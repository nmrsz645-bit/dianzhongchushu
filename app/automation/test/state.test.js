const assert = require("assert");
const {
  buildFailedQueueState,
  buildNotificationQueueState,
  buildSeenBookState,
  dueFailedBooks,
  expireStaleFailedBooks,
  markPendingBookAttempted,
  mergePendingBooks,
  migrateStaleFailedQueueEntries,
  pruneSeenEntries,
  removePendingBook,
  removeNotification,
} = require("../src/state");

function testPruneSeenEntriesKeepsOnlySevenDays() {
  const now = new Date("2026-07-08T00:00:00.000Z");
  const entries = {
    old: "2026-06-30T23:59:59.000Z",
    kept: "2026-07-01T00:00:00.000Z",
  };
  assert.deepStrictEqual(pruneSeenEntries(entries, now), {
    kept: "2026-07-01T00:00:00.000Z",
  });
}

function testBuildSeenBookStatePreservesExistingSeenAtAndAddsNewIds() {
  const now = new Date("2026-07-08T00:00:00.000Z");
  const existing = {
    entries: {
      "1101": "2026-07-07T00:00:00.000Z",
      old: "2026-06-30T00:00:00.000Z",
    },
  };
  assert.deepStrictEqual(buildSeenBookState(new Set(["1101", "1102"]), existing, now), {
    ids: ["1101", "1102"],
    entries: {
      "1101": "2026-07-07T00:00:00.000Z",
      "1102": "2026-07-08T00:00:00.000Z",
    },
    updatedAt: "2026-07-08T00:00:00.000Z",
  });
}

function testFailedQueueRetriesHourlyThenTerminalFailsOn24thFailure() {
  const first = new Date("2026-07-08T00:00:00.000Z");
  const retry = new Date("2026-07-08T01:00:00.000Z");
  const queued = buildFailedQueueState({}, "11010517765", "first error", first, {
    listedAt: "2026-07-08 08:00:00",
  });
  assert.strictEqual(queued.queue["11010517765"].failCount, 1);
  assert.strictEqual(queued.queue["11010517765"].nextRetryAt, "2026-07-08T01:00:00.000Z");
  assert.deepStrictEqual(dueFailedBooks(queued, new Date("2026-07-08T00:59:59.000Z")), []);
  assert.deepStrictEqual(dueFailedBooks(queued, retry, "2026-07-08").map((book) => book.bookId), ["11010517765"]);

  queued.queue["11010517765"].failCount = 23;
  const terminal = buildFailedQueueState(queued, "11010517765", "last error", retry, {
    listedAt: "2026-07-08 08:00:00",
  });
  assert.deepStrictEqual(terminal.queue, {});
  assert.deepStrictEqual(terminal.terminalFailures, [
    {
      bookId: "11010517765",
      bookName: "",
      listedAt: "2026-07-08 08:00:00",
      discoveredAt: "2026-07-08T00:00:00.000Z",
      source: "platform",
      reason: "last error",
      failCount: 24,
      failedAt: "2026-07-08T01:00:00.000Z",
    },
  ]);
}

function testFailedQueueContinuesAcrossMidnightUntilRetryLimit() {
  const state = buildFailedQueueState({}, "11010517766", "old error", new Date("2026-07-08T00:00:00.000Z"), {
    listedAt: "2026-07-07 23:59:59",
  });
  state.queue["11010517766"].nextRetryAt = "2026-07-08T01:00:00.000Z";
  assert.deepStrictEqual(dueFailedBooks(state, new Date("2026-07-08T02:00:00.000Z"), "2026-07-08").map((book) => book.bookId), ["11010517766"]);

  const expired = expireStaleFailedBooks(state, "2026-07-08", new Date("2026-07-08T02:00:00.000Z"));
  assert.strictEqual(expired.queue["11010517766"].failCount, 1);
  assert.deepStrictEqual(expired.terminalFailures, []);
}

function testPendingQueueMergesAndSurvivesAttemptUntilExplicitRemoval() {
  const first = new Date("2026-07-08T00:00:00.000Z");
  const merged = mergePendingBooks({ books: [{ id: "100", name: "原名", discoveredAt: "2026-07-07T00:00:00.000Z" }] }, [
    { id: "100", name: "新名" },
    { id: "101", name: "第二本" },
  ], first);
  assert.deepStrictEqual(merged.books.map((book) => book.id), ["100", "101"]);
  assert.strictEqual(merged.books[0].name, "原名");
  assert.strictEqual(merged.books[1].discoveredAt, first.toISOString());
  const attempted = markPendingBookAttempted(merged, "101", new Date("2026-07-08T00:01:00.000Z"));
  assert.strictEqual(attempted.books.find((book) => book.id === "101").attemptStartedAt, "2026-07-08T00:01:00.000Z");
  assert.deepStrictEqual(removePendingBook(attempted, "100").books.map((book) => book.id), ["101"]);
}

function testStaleActiveFailuresMigrateToTerminalOnce() {
  const now = new Date("2026-07-09T00:00:00.000Z");
  const input = {
    queue: {
      "102": {
        bookId: "102",
        bookName: "旧日期书籍",
        listedAt: "2026-07-08 23:00:00",
        reason: "未审核通过",
        failCount: 1,
        firstFailedAt: "2026-07-08T15:30:00.000Z",
        lastFailedAt: "2026-07-08T16:00:00.000Z",
        extraField: "保留字段",
      },
      "103": {
        bookId: "103",
        listedAt: "2026-07-09 08:00:00",
        reason: "今日失败",
        failCount: 1,
      },
    },
    terminalFailures: [{
      bookId: "104",
      listedAt: "2026-07-08 08:00:00",
      reason: "已有彻底失败",
      failCount: 24,
    }],
  };

  const migrated = migrateStaleFailedQueueEntries(input, now);
  assert.strictEqual(migrated.migrated, 1);
  assert.deepStrictEqual(Object.keys(migrated.state.queue), ["103"]);
  assert.strictEqual(migrated.state.queue["103"].reason, "今日失败");
  const oldBook = migrated.state.terminalFailures.find((item) => item.bookId === "102");
  assert.strictEqual(oldBook.reason, "失败书籍已过当天，不再重试：未审核通过");
  assert.strictEqual(oldBook.extraField, "保留字段");
  assert.strictEqual(oldBook.failedAt, "2026-07-08T16:00:00.000Z");

  const repeated = migrateStaleFailedQueueEntries(migrated.state, now);
  assert.strictEqual(repeated.migrated, 0);
  assert.deepStrictEqual(repeated.state, migrated.state);
}

function testNotificationQueueAddsAndRemovesMessages() {
  const now = new Date("2026-07-08T00:00:00.000Z");
  const queued = buildNotificationQueueState({}, "点重后台登录失效，请重新登录", now);
  assert.strictEqual(queued.items.length, 1);
  assert.strictEqual(queued.items[0].content, "点重后台登录失效，请重新登录");
  assert.strictEqual(queued.items[0].createdAt, "2026-07-08T00:00:00.000Z");
  assert.deepStrictEqual(removeNotification(queued, queued.items[0].id), { items: [] });
}

testPruneSeenEntriesKeepsOnlySevenDays();
testBuildSeenBookStatePreservesExistingSeenAtAndAddsNewIds();
testFailedQueueRetriesHourlyThenTerminalFailsOn24thFailure();
testFailedQueueContinuesAcrossMidnightUntilRetryLimit();
testPendingQueueMergesAndSurvivesAttemptUntilExplicitRemoval();
testStaleActiveFailuresMigrateToTerminalOnce();
testNotificationQueueAddsAndRemovesMessages();
console.log("state tests passed");
