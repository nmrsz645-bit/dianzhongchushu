using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Management;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}

internal sealed class MainForm : Form
{
    private readonly string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
    private readonly string automation;
    private readonly string node;
    private readonly Label state = new Label();
    private readonly Label summary = new Label();
    private readonly CheckBox platform = new CheckBox { Text = "平台扫描出书", AutoSize = true };
    private readonly CheckBox fallback = new CheckBox { Text = "兜底链接出书", AutoSize = true };
    private readonly TextBox mainLog = NewLogBox();
    private readonly TextBox watchdogLog = NewLogBox();
    private readonly TextBox fallbackLog = NewLogBox();
    private readonly TextBox statusBox = NewInfoBox();
    private readonly TextBox todayCountsBox = NewInfoBox();
    private readonly TextBox fallbackBox = NewInfoBox();
    private readonly Timer timer = new Timer { Interval = 5000 };

    public MainForm()
    {
        automation = Path.Combine(root, "automation");
        node = Path.Combine(root, "runtime", "node", "node.exe");
        RunMigration();
        EnsureFiles();

        Text = "点重自动化";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(960, 680);
        Size = new Size(1120, 760);
        Font = new Font("Microsoft YaHei UI", 9F);

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4, Padding = new Padding(8) };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 116));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 230));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 62));
        Controls.Add(layout);

        var top = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Padding = new Padding(6, 4, 6, 2) };
        top.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        top.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        top.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        layout.Controls.Add(top, 0, 0);

        var title = new Label { Text = "点重自动化", Font = new Font("Microsoft YaHei UI", 15F, FontStyle.Bold), AutoSize = true };
        state.AutoSize = true; state.Margin = new Padding(18, 8, 0, 0); state.ForeColor = Color.DimGray;
        var heading = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
        heading.Controls.Add(title); heading.Controls.Add(state);
        top.Controls.Add(heading, 0, 0);

        var controls = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
        AddButton(controls, "启动 7x24", StartWatchdog);
        AddButton(controls, "停止全部", StopAll);
        AddButton(controls, "运行一次", delegate { StartNode("src\\scan-once.js"); });
        AddButton(controls, "登录页面", delegate { StartNode("src\\open-login.js"); });
        AddButton(controls, "一键基准", delegate { StartNode("src\\baseline-now.js"); });
        AddButton(controls, "一键自检", RunSelfCheck);
        AddButton(controls, "开机自启", delegate { StartPowerShell("scripts\\enable-autostart.ps1"); });
        top.Controls.Add(controls, 0, 1);

        var lower = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
        platform.Margin = new Padding(3, 5, 4, 0); fallback.Margin = new Padding(8, 5, 10, 0);
        lower.Controls.Add(platform); lower.Controls.Add(fallback);
        AddButton(lower, "保存模式", SaveMode);
        AddButton(lower, "批量处理书籍", RunBatchBooks);
        summary.AutoSize = true; summary.Margin = new Padding(24, 6, 0, 0); summary.ForeColor = Color.DimGray;
        lower.Controls.Add(summary);
        top.Controls.Add(lower, 0, 2);

        var statusLayout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, Padding = new Padding(6, 0, 6, 4) };
        statusLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 45));
        statusLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        statusLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 30));
        var statusGroup = new GroupBox { Text = "运行状态", Dock = DockStyle.Fill };
        statusGroup.Controls.Add(statusBox);
        var todayCountsGroup = new GroupBox { Text = "\u4eca\u65e5\u7edf\u8ba1", Dock = DockStyle.Fill };
        var todayCountsLayout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Padding = new Padding(2) };
        todayCountsLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        todayCountsLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        todayCountsLayout.Controls.Add(todayCountsBox, 0, 0);
        var terminalDetailsButton = new Button { Text = "\u67e5\u770b\u5f7b\u5e95\u5931\u8d25\u8be6\u60c5", AutoSize = true, Anchor = AnchorStyles.Right, Height = 27 };
        terminalDetailsButton.Click += ShowTerminalFailureDetails;
        todayCountsLayout.Controls.Add(terminalDetailsButton, 0, 1);
        todayCountsGroup.Controls.Add(todayCountsLayout);
        var fallbackGroup = new GroupBox { Text = "兜底状态", Dock = DockStyle.Fill };
        fallbackGroup.Controls.Add(fallbackBox);
        statusLayout.Controls.Add(statusGroup, 0, 0);
        statusLayout.Controls.Add(todayCountsGroup, 1, 0);
        statusLayout.Controls.Add(fallbackGroup, 2, 0);
        layout.Controls.Add(statusLayout, 0, 1);

        var tabs = new TabControl { Dock = DockStyle.Fill, Padding = new Point(12, 5) };
        tabs.TabPages.Add(NewTab("运行日志", mainLog));
        tabs.TabPages.Add(NewTab("守护日志", watchdogLog));
        tabs.TabPages.Add(NewTab("兜底日志", fallbackLog));
        layout.Controls.Add(tabs, 0, 2);

        var config = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(6, 12, 6, 4), WrapContents = true, AutoScroll = true };
        AddButton(config, "网址", delegate { OpenConfig("网址.txt"); });
        AddButton(config, "飞书", delegate { OpenConfig("飞书接口和链接.txt"); });
        AddButton(config, "企业微信", delegate { OpenConfig("企业微信.txt"); });
        AddButton(config, "微信开关", delegate { OpenConfig("企业微信发送开关.txt"); });
        AddButton(config, "DeepSeek", delegate { OpenConfig("DeepSeek接口.txt"); });
        AddButton(config, "违禁词", delegate { OpenConfig("违禁词.txt"); });
        AddButton(config, "资源 ID", delegate { OpenConfig("选择资源id.txt"); });
        AddButton(config, "兜底链接", delegate { OpenConfig(Path.Combine("兜底", "新建文本文档.txt")); });
        AddButton(config, "使用说明", delegate { OpenConfig("使用说明-点重自动化.txt"); });
        config.Controls.Clear();
        AddButton(config, "\u914d\u7f6e\u4e2d\u5fc3", OpenConfigurationCenter);
        AddButton(config, "\u4f7f\u7528\u8bf4\u660e", delegate { OpenConfig("\u4f7f\u7528\u8bf4\u660e-\u70b9\u91cd\u81ea\u52a8\u5316.txt"); });
        layout.Controls.Add(config, 0, 3);

        timer.Tick += delegate { RefreshUi(); };
        timer.Start();
        RefreshUi();
    }

    private static TextBox NewLogBox()
    {
        return new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false, Dock = DockStyle.Fill, Font = new Font("Consolas", 9F) };
    }

    private static TextBox NewInfoBox()
    {
        return new TextBox { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, WordWrap = true, Dock = DockStyle.Fill, BorderStyle = BorderStyle.None, BackColor = SystemColors.Window, Font = new Font("Microsoft YaHei UI", 9F) };
    }

    private static TabPage NewTab(string title, Control content)
    {
        var page = new TabPage(title); page.Controls.Add(content); return page;
    }

    private static void AddButton(FlowLayoutPanel panel, string text, EventHandler action)
    {
        var button = new Button { Text = text, AutoSize = true, Height = 28, Margin = new Padding(0, 0, 8, 0) };
        button.Click += action; panel.Controls.Add(button);
    }

    private void EnsureFiles()
    {
        Directory.CreateDirectory(Path.Combine(root, "兜底"));
        EnsureFile("自动化模式.json", "{\r\n  \"platformEnabled\": true,\r\n  \"fallbackEnabled\": true\r\n}");
        EnsureFile("网址.txt", "https://admin.wqxsw.com/");
        EnsureFile("企业微信.txt", "");
        EnsureFile("飞书接口和链接.txt", "");
        EnsureFile("DeepSeek接口.txt", "启用：否\r\nAPI Key：\r\n模型：deepseek-chat");
        EnsureFile("网站密码.txt", "");
        EnsureFile(Path.Combine("兜底", "新建文本文档.txt"), "");
    }

    private void RunMigration()
    {
        var script = Path.Combine(root, "Migrate-PreviousUserData.ps1");
        if (!File.Exists(script)) return;
        try
        {
            using (var process = Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"") {
                WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
            }))
            {
                process.WaitForExit(10000);
            }
        }
        catch { }
    }

    private void EnsureFile(string relative, string content)
    {
        var file = Path.Combine(root, relative);
        var directory = Path.GetDirectoryName(file);
        if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);
        if (!File.Exists(file)) File.WriteAllText(file, content, new UTF8Encoding(true));
    }

    private ProcessStartInfo NewProcess(string file, string arguments, bool capture)
    {
        var info = new ProcessStartInfo(file, arguments) {
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = capture,
            RedirectStandardError = capture
        };
        if (File.Exists(node)) info.EnvironmentVariables["DZ_NODE_PATH"] = node;
        return info;
    }

    private void StartPowerShell(string script)
    {
        var file = Path.Combine(automation, script);
        if (!File.Exists(file)) { MessageBox.Show("找不到脚本：" + file, "点重自动化", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }
        Process.Start(NewProcess("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + file + "\"", false));
        RefreshUi();
    }

    private void StartNode(string script, string arguments = "")
    {
        if (!File.Exists(node)) { MessageBox.Show("内置 Node 运行时缺失，请使用完整桌面版安装包。", "点重自动化", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }
        var target = Path.Combine(automation, script);
        if (!File.Exists(target)) { MessageBox.Show("找不到任务脚本：" + target, "点重自动化", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }
        Process.Start(NewProcess(node, "\"" + target + "\" " + arguments, false));
        RefreshUi();
    }

    private void StartWatchdog(object sender, EventArgs e)
    {
        SaveMode(null, EventArgs.Empty);
        StartPowerShell("scripts\\watchdog.ps1");
    }

    private void StopAll(object sender, EventArgs e) { StartPowerShell("scripts\\stop-all.ps1"); }

    private void SaveMode(object sender, EventArgs e)
    {
        if (!platform.Checked && !fallback.Checked) { MessageBox.Show("至少选择一个出书模式。", "点重自动化", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        File.WriteAllText(Path.Combine(root, "自动化模式.json"), string.Format("{{\r\n  \"platformEnabled\": {0},\r\n  \"fallbackEnabled\": {1}\r\n}}", platform.Checked.ToString().ToLowerInvariant(), fallback.Checked.ToString().ToLowerInvariant()), new UTF8Encoding(true));
        RefreshUi();
    }

    private void RunBatchBooks(object sender, EventArgs e)
    {
        using (var dialog = new Form { Text = "批量处理书籍", StartPosition = FormStartPosition.CenterParent, Size = new Size(440, 420), MinimumSize = new Size(440, 420), Font = Font })
        {
            var input = new TextBox { Multiline = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill, Font = new Font("Consolas", 10F) };
            var hint = new Label { Text = "每行一个书籍 ID。人工批量处理会重新出书；重复书名依次写为《书名》、《书名》-、《书名》--。", Dock = DockStyle.Top, Height = 48, Padding = new Padding(10, 8, 10, 0) };
            var start = new Button { Text = "开始批量处理", Dock = DockStyle.Right, Width = 110 };
            var cancel = new Button { Text = "取消", Dock = DockStyle.Right, Width = 70 };
            var actions = new Panel { Dock = DockStyle.Bottom, Height = 44, Padding = new Padding(10, 8, 10, 8) };
            actions.Controls.Add(start); actions.Controls.Add(cancel);
            dialog.Controls.Add(input); dialog.Controls.Add(hint); dialog.Controls.Add(actions);
            cancel.Click += delegate { dialog.Close(); };
            start.Click += delegate
            {
                var ids = new List<string>();
                var seen = new HashSet<string>();
                foreach (var line in input.Lines)
                {
                    var id = line.Trim();
                    if (!Regex.IsMatch(id, "^\\d+$")) continue;
                    if (seen.Add(id)) ids.Add(id);
                }
                if (ids.Count == 0) { MessageBox.Show("请每行输入一个纯数字书籍 ID。", "点重自动化", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
                var directory = Path.Combine(automation, "data");
                Directory.CreateDirectory(directory);
                var file = Path.Combine(directory, "manual-book-ids.txt");
                File.WriteAllLines(file, ids.ToArray(), new UTF8Encoding(false));
                StartNode("src\\run-books.js", "\"" + file + "\"");
                summary.Text = "已开始批量处理 " + ids.Count + " 本";
                dialog.Close();
            };
            dialog.ShowDialog(this);
        }
    }

    private void OpenConfigurationCenter(object sender, EventArgs e)
    {
        const string urlFile = "\u7f51\u5740.txt";
        const string feishuFile = "\u98de\u4e66\u63a5\u53e3\u548c\u94fe\u63a5.txt";
        const string wechatFile = "\u4f01\u4e1a\u5fae\u4fe1.txt";
        const string wechatSwitchFile = "\u4f01\u4e1a\u5fae\u4fe1\u53d1\u9001\u5f00\u5173.txt";
        const string aiFile = "DeepSeek\u63a5\u53e3.txt";
        const string forbiddenFile = "\u8fdd\u7981\u8bcd.txt";
        const string resourceFile = "\u9009\u62e9\u8d44\u6e90id.txt";
        const string complianceFile = "\u5e7f\u544a\u6807\u7b7e\u5408\u89c4\u89c4\u5219.txt";
        var feishuText = ReadUserConfig(feishuFile);
        var aiText = ReadUserConfig(aiFile);

        using (var dialog = new Form { Text = "\u914d\u7f6e\u4e2d\u5fc3", StartPosition = FormStartPosition.CenterParent, Size = new Size(780, 650), MinimumSize = new Size(720, 560), Font = Font })
        {
            var tabs = new TabControl { Dock = DockStyle.Fill, Padding = new Point(12, 5) };
            var urlBox = NewConfigBox(ReadUserConfig(urlFile));
            var resourceBox = NewConfigBox(ReadUserConfig(resourceFile));
            var platformPage = NewConfigPage();
            AddConfigRow(platformPage, 0, "\u5e73\u53f0\u7f51\u5740", urlBox);
            AddConfigRow(platformPage, 1, "\u8d44\u6e90 ID", resourceBox);
            tabs.TabPages.Add(NewTab("\u5e73\u53f0", platformPage));

            var appIdBox = NewConfigBox(ReadConfigValue(feishuText, "App ID"));
            var appSecretBox = NewConfigBox(ReadConfigValue(feishuText, "App Secret"), true);
            var feishuLinkBox = NewConfigBox(ReadFirstUrl(feishuText));
            var feishuPage = NewConfigPage();
            AddConfigRow(feishuPage, 0, "App ID", appIdBox);
            AddConfigRow(feishuPage, 1, "App Secret", appSecretBox);
            AddConfigRow(feishuPage, 2, "\u51fa\u4e66\u8868\u683c\u94fe\u63a5", feishuLinkBox);
            AddSecretToggle(feishuPage, 3, appSecretBox, "\u663e\u793a App Secret");
            tabs.TabPages.Add(NewTab("\u98de\u4e66", feishuPage));

            var wechatBox = NewConfigBox(ReadUserConfig(wechatFile), true);
            var wechatEnabled = new CheckBox { Text = "\u51fa\u4e66\u540e\u53d1\u9001\u5c0f\u8bf4\u539f\u6587\u5230\u4f01\u4e1a\u5fae\u4fe1", AutoSize = true, Checked = IsEnabledConfig(ReadUserConfig(wechatSwitchFile)) };
            var wechatPage = NewConfigPage();
            AddConfigRow(wechatPage, 0, "\u673a\u5668\u4eba Webhook", wechatBox);
            AddSecretToggle(wechatPage, 1, wechatBox, "\u663e\u793a Webhook");
            wechatEnabled.Margin = new Padding(150, 8, 8, 8);
            wechatPage.Controls.Add(wechatEnabled, 1, 2);
            tabs.TabPages.Add(NewTab("\u4f01\u4e1a\u5fae\u4fe1", wechatPage));

            var aiEnabled = new CheckBox { Text = "\u542f\u7528 AI \u6807\u7b7e", AutoSize = true, Checked = IsEnabledConfig(ReadConfigValue(aiText, "Enable")) };
            var aiKeyBox = NewConfigBox(ReadConfigValue(aiText, "API Key"), true);
            var configuredModel = ReadConfigValue(aiText, "Model");
            var aiModelBox = NewConfigBox(String.IsNullOrWhiteSpace(configuredModel) ? "deepseek-v4-flash" : configuredModel);
            var aiEndpointBox = NewConfigBox(ReadConfigValue(aiText, "Endpoint"));
            var aiPage = NewConfigPage();
            aiEnabled.Margin = new Padding(150, 8, 8, 8);
            aiPage.Controls.Add(aiEnabled, 1, 0);
            AddConfigRow(aiPage, 1, "API Key", aiKeyBox);
            AddConfigRow(aiPage, 2, "\u6a21\u578b", aiModelBox);
            AddConfigRow(aiPage, 3, "\u63a5\u53e3\u5730\u5740", aiEndpointBox);
            AddSecretToggle(aiPage, 4, aiKeyBox, "\u663e\u793a API Key");
            var thinking = new Label { Text = "\u6df1\u5ea6\u601d\u8003\uff1a\u7a0b\u5e8f\u4f1a\u81ea\u52a8\u5173\u95ed", AutoSize = true, ForeColor = Color.DimGray, Margin = new Padding(150, 8, 8, 8) };
            aiPage.Controls.Add(thinking, 1, 5);
            tabs.TabPages.Add(NewTab("AI", aiPage));

            var fallbackLinksBox = NewConfigBox(ReadUserConfig(Path.Combine("\u515c\u5e95", "\u65b0\u5efa\u6587\u672c\u6587\u6863.txt")), false, true);
            var forbiddenBox = NewConfigBox(ReadUserConfig(forbiddenFile), false, true);
            var complianceBox = NewConfigBox(ReadUserConfig(complianceFile), false, true);
            var rulesPage = NewConfigPage();
            AddConfigRow(rulesPage, 0, "\u515c\u5e95\u8868\u683c\u94fe\u63a5\uff08\u6bcf\u884c\u4e00\u4e2a\uff09", fallbackLinksBox);
            AddConfigRow(rulesPage, 1, "\u8fdd\u7981\u8bcd\uff08\u6bcf\u884c\u4e00\u4e2a\uff09", forbiddenBox);
            AddConfigRow(rulesPage, 2, "\u989d\u5916\u5408\u89c4\u5c4f\u853d\u8bcd\uff08\u6bcf\u884c\u4e00\u4e2a\uff09", complianceBox);
            tabs.TabPages.Add(NewTab("\u515c\u5e95\u4e0e\u89c4\u5219", rulesPage));

            var save = new Button { Text = "\u4fdd\u5b58\u914d\u7f6e", Dock = DockStyle.Right, Width = 105 };
            var saveCheck = new Button { Text = "\u4fdd\u5b58\u5e76\u81ea\u68c0", Dock = DockStyle.Right, Width = 110 };
            var cancel = new Button { Text = "\u53d6\u6d88", Dock = DockStyle.Right, Width = 75 };
            var actions = new Panel { Dock = DockStyle.Bottom, Height = 48, Padding = new Padding(10, 8, 10, 8) };
            actions.Controls.Add(saveCheck); actions.Controls.Add(save); actions.Controls.Add(cancel);
            dialog.Controls.Add(tabs); dialog.Controls.Add(actions);

            Action saveAll = delegate
            {
                WriteUserConfig(urlFile, urlBox.Text.Trim());
                WriteUserConfig(resourceFile, resourceBox.Text.Trim());
                WriteUserConfig(feishuFile, "App ID: " + appIdBox.Text.Trim() + "\r\nApp Secret: " + appSecretBox.Text.Trim() + "\r\n\u51fa\u4e66\u8868\u683c\u94fe\u63a5: " + feishuLinkBox.Text.Trim() + "\r\n");
                WriteUserConfig(wechatFile, wechatBox.Text.Trim());
                WriteUserConfig(wechatSwitchFile, wechatEnabled.Checked ? "on" : "off");
                WriteUserConfig(aiFile, "Enable: " + (aiEnabled.Checked ? "yes" : "no") + "\r\nAPI Key: " + aiKeyBox.Text.Trim() + "\r\nModel: " + aiModelBox.Text.Trim() + "\r\nEndpoint: " + aiEndpointBox.Text.Trim() + "\r\n");
                WriteUserConfig(Path.Combine("\u515c\u5e95", "\u65b0\u5efa\u6587\u672c\u6587\u6863.txt"), fallbackLinksBox.Text.Trim());
                WriteUserConfig(forbiddenFile, forbiddenBox.Text.Trim());
                WriteUserConfig(complianceFile, complianceBox.Text.Trim());
                RefreshUi();
            };
            save.Click += delegate { saveAll(); MessageBox.Show("\u914d\u7f6e\u5df2\u4fdd\u5b58\u3002", "\u914d\u7f6e\u4e2d\u5fc3", MessageBoxButtons.OK, MessageBoxIcon.Information); };
            saveCheck.Click += delegate { saveAll(); dialog.Close(); RunSelfCheck(null, EventArgs.Empty); };
            cancel.Click += delegate { dialog.Close(); };
            dialog.ShowDialog(this);
        }
    }

    private static TableLayoutPanel NewConfigPage()
    {
        var page = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 7, Padding = new Padding(12), AutoScroll = true };
        page.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        page.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (var index = 0; index < 7; index++) page.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        return page;
    }

    private static TextBox NewConfigBox(string text, bool secret = false, bool multiline = false)
    {
        return new TextBox { Text = text ?? "", Dock = DockStyle.Top, Multiline = multiline, Height = multiline ? 120 : 28, ScrollBars = multiline ? ScrollBars.Vertical : ScrollBars.None, UseSystemPasswordChar = secret };
    }

    private static void AddConfigRow(TableLayoutPanel page, int row, string labelText, Control control)
    {
        var label = new Label { Text = labelText, AutoSize = true, TextAlign = ContentAlignment.MiddleRight, Margin = new Padding(0, 8, 8, 4), Dock = DockStyle.Top };
        control.Margin = new Padding(0, 4, 0, 4);
        page.Controls.Add(label, 0, row); page.Controls.Add(control, 1, row);
    }

    private static void AddSecretToggle(TableLayoutPanel page, int row, TextBox textBox, string label)
    {
        var toggle = new CheckBox { Text = label, AutoSize = true, Margin = new Padding(0, 4, 0, 4) };
        toggle.CheckedChanged += delegate { textBox.UseSystemPasswordChar = !toggle.Checked; };
        page.Controls.Add(toggle, 1, row);
    }

    private string ReadUserConfig(string relative)
    {
        try { return File.Exists(Path.Combine(root, relative)) ? File.ReadAllText(Path.Combine(root, relative), Encoding.UTF8) : ""; }
        catch { return ""; }
    }

    private void WriteUserConfig(string relative, string content)
    {
        var file = Path.Combine(root, relative);
        var directory = Path.GetDirectoryName(file);
        if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);
        File.WriteAllText(file, content ?? "", new UTF8Encoding(true));
    }

    private static string ReadConfigValue(string text, string key)
    {
        var match = Regex.Match(text ?? "", "^\\s*" + Regex.Escape(key) + "\\s*[:\uff1a]\\s*(?<value>.*)$", RegexOptions.Multiline | RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["value"].Value.Trim() : "";
    }

    private static string ReadFirstUrl(string text)
    {
        var match = Regex.Match(text ?? "", "https?://\\S+", RegexOptions.IgnoreCase);
        return match.Success ? match.Value.Trim() : "";
    }

    private static bool IsEnabledConfig(string value)
    {
        var text = String.IsNullOrWhiteSpace(value) ? "" : value.Trim().ToLowerInvariant();
        return text != "no" && text != "off" && text != "false" && text != "0" && text != "\u5173\u95ed";
    }

    private void OpenConfig(string relative)
    {
        EnsureFile(relative, "");
        Process.Start(new ProcessStartInfo("notepad.exe", "\"" + Path.Combine(root, relative) + "\"") { UseShellExecute = true });
    }

    private bool IsRunning()
    {
        var lockFile = Path.Combine(automation, "data", "watchdog-ps.lock");
        if (!File.Exists(lockFile)) return false;
        var match = Regex.Match(File.ReadAllText(lockFile), "\\\"pid\\\"\\s*:\\s*(\\d+)");
        if (!match.Success) return false;
        try
        {
            var processId = int.Parse(match.Groups[1].Value);
            var expected = Path.Combine(automation, "scripts", "watchdog.ps1").Replace('/', '\\');
            using (var searcher = new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE ProcessId = " + processId))
            {
                foreach (ManagementObject process in searcher.Get())
                {
                    var commandLine = Convert.ToString(process["CommandLine"]) ?? "";
                    return commandLine.Replace('/', '\\').IndexOf(expected, StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
        }
        catch { }
        return false;
    }

    private void RefreshUi()
    {
        var modeFile = Path.Combine(root, "自动化模式.json");
        var text = File.Exists(modeFile) ? File.ReadAllText(modeFile) : "";
        platform.Checked = !text.Contains("\"platformEnabled\": false");
        fallback.Checked = !text.Contains("\"fallbackEnabled\": false");
        var running = IsRunning();
        state.Text = running ? "运行中" : "未运行";
        state.ForeColor = running ? Color.ForestGreen : Color.DimGray;
        summary.Text = running ? "守护进程正在运行" : "可启动 7x24 守护";
        statusBox.Text = "当前北京时间：" + BeijingNow() + Environment.NewLine + "当前状态：" + (running ? "正常运行" : "未运行") + Environment.NewLine + "运行模式：" + ReadModeText() + Environment.NewLine + Environment.NewLine + ReadStatus();
        todayCountsBox.Text = ReadTodayCounts();
        fallbackBox.Text = ReadFallbackSummary();
        mainLog.Text = Tail(Path.Combine(automation, "logs", "run-" + DateTime.Now.ToString("yyyy-MM-dd") + ".log"));
        watchdogLog.Text = Tail(Path.Combine(automation, "logs", "watchdog-" + DateTime.Now.ToString("yyyy-MM-dd") + ".log"));
        fallbackLog.Text = Tail(Path.Combine(root, "兜底", "兜底日志.txt"));
    }

    private string ReadStatus()
    {
        var file = Path.Combine(root, "状态面板.txt");
        if (!File.Exists(file)) return "状态面板：暂无数据";
        try
        {
            var text = File.ReadAllText(file, Encoding.UTF8).Trim();
            return string.IsNullOrEmpty(text) ? "状态面板：暂无数据" : text;
        }
        catch (Exception error) { return "状态面板读取失败：" + error.Message; }
    }

    private string ReadTodayCounts()
    {
        var file = Path.Combine(automation, "data", "status_snapshot.json");
        const string empty = "\u4eca\u65e5\u53d1\u73b0\u603b\u4e66\u7c4d\uff1a0\r\n\u5f85\u5904\u7406\u4e66\u7c4d\uff1a0\r\n\u4eca\u65e5\u5df2\u5904\u7406\u4e66\u7c4d\uff1a0\r\n\u91cd\u8bd5\u961f\u5217\uff1a0\r\n\u5f7b\u5e95\u5931\u8d25\u961f\u5217\uff1a0";
        if (!File.Exists(file)) return empty;
        try
        {
            var json = File.ReadAllText(file, Encoding.UTF8);
            var todayBooks = ReadJsonInt(json, "todayBooks");
            var todayOutputCount = ReadJsonInt(json, "todayOutputCount");
            var pendingCount = ReadJsonInt(json, "pendingCount");
            var retryQueueCount = ReadJsonInt(json, "retryQueueCount");
            var terminalFailureCount = ReadJsonInt(json, "terminalFailureCount");
            return "\u4eca\u65e5\u53d1\u73b0\u603b\u4e66\u7c4d\uff1a" + todayBooks + Environment.NewLine
                + "\u5f85\u5904\u7406\u4e66\u7c4d\uff1a" + pendingCount + Environment.NewLine
                + "\u4eca\u65e5\u5df2\u5904\u7406\u4e66\u7c4d\uff1a" + todayOutputCount + Environment.NewLine
                + "\u91cd\u8bd5\u961f\u5217\uff1a" + retryQueueCount + Environment.NewLine
                + "\u5f7b\u5e95\u5931\u8d25\u961f\u5217\uff1a" + terminalFailureCount + Environment.NewLine + Environment.NewLine
                + ReadFallbackTodayCounts();
        }
        catch { return empty; }
    }

    private void ShowTerminalFailureDetails(object sender, EventArgs e)
    {
        var file = Path.Combine(automation, "data", "terminal_failure_details.tsv");
        if (!File.Exists(file))
        {
            MessageBox.Show(this, "\u6682\u65e0\u5f7b\u5e95\u5931\u8d25\u8be6\u60c5\u3002", "\u5f7b\u5e95\u5931\u8d25\u961f\u5217", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        var lines = File.ReadAllLines(file, Encoding.UTF8);
        var window = new Form { Text = "\u5f7b\u5e95\u5931\u8d25\u961f\u5217\u8be6\u60c5", StartPosition = FormStartPosition.CenterParent, Size = new Size(1100, 620), MinimumSize = new Size(820, 420), Font = Font };
        var grid = new DataGridView {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.AllCells,
            RowHeadersVisible = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            MultiSelect = false,
        };
        var headers = new[] { "\u53d1\u73b0\u65f6\u95f4", "\u5f7b\u5e95\u5931\u8d25\u65f6\u95f4", "\u4e66\u7c4d\u540d\u79f0", "\u4e66\u7c4d ID", "\u5931\u8d25\u539f\u56e0", "\u5c1d\u8bd5\u6b21\u6570", "\u6765\u6e90" };
        foreach (var header in headers) grid.Columns.Add(header, header);
        grid.Columns[0].Width = 145;
        grid.Columns[1].Width = 145;
        grid.Columns[2].Width = 220;
        grid.Columns[3].Width = 115;
        grid.Columns[4].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
        grid.Columns[5].Width = 80;
        grid.Columns[6].Width = 80;
        for (var index = 1; index < lines.Length; index++)
        {
            if (String.IsNullOrWhiteSpace(lines[index])) continue;
            var values = lines[index].Split(new[] { '\t' }, 7);
            Array.Resize(ref values, 7);
            values[0] = FormatDetailTime(values[0]);
            values[1] = FormatDetailTime(values[1]);
            values[6] = values[6] == "platform" ? "\u5e73\u53f0" : (values[6] == "fallback" ? "\u515c\u5e95" : values[6]);
            grid.Rows.Add(values);
        }
        window.Controls.Add(grid);
        window.ShowDialog(this);
    }

    private static string FormatDetailTime(string value)
    {
        DateTimeOffset parsed;
        if (!DateTimeOffset.TryParse(value, out parsed)) return value ?? "";
        try { return TimeZoneInfo.ConvertTime(parsed, TimeZoneInfo.FindSystemTimeZoneById("China Standard Time")).ToString("yyyy-MM-dd HH:mm:ss"); }
        catch { return parsed.ToString("yyyy-MM-dd HH:mm:ss"); }
    }

    private static int ReadJsonInt(string json, string property)
    {
        var match = Regex.Match(json ?? "", "\\\"" + Regex.Escape(property) + "\\\"\\s*:\\s*(\\d+)");
        return match.Success ? int.Parse(match.Groups[1].Value) : 0;
    }

    private string ReadFallbackTodayCounts()
    {
        const string shortList = "\u203c\ufe0f\u52a0\u6025\u8d85\u77ed\u4e66\u5355";
        const string mediumList = "\u203c\ufe0f\u52a0\u6025\u4e2d\u77ed\u4e66\u5355";
        var sourceById = new Dictionary<string, string>();
        var markedToday = new Dictionary<string, HashSet<string>> {
            { shortList, new HashSet<string>() }, { mediumList, new HashSet<string>() }
        };
        var actualToday = new Dictionary<string, HashSet<string>> {
            { shortList, new HashSet<string>() }, { mediumList, new HashSet<string>() }
        };

        try
        {
            var stateFile = Path.Combine(root, "\u515c\u5e95", "\u515c\u5e95\u72b6\u6001.json");
            if (File.Exists(stateFile))
            {
                var json = File.ReadAllText(stateFile, Encoding.UTF8);
                foreach (Match item in Regex.Matches(json, "\\\"(?<id>\\d+)\\\"\\s*:\\s*\\{(?<body>[^{}]*)\\}"))
                {
                    var id = item.Groups["id"].Value;
                    var body = item.Groups["body"].Value;
                    var source = ReadJsonString(body, "source");
                    var listName = FallbackListName(source, shortList, mediumList);
                    if (listName == null) continue;
                    sourceById[id] = listName;
                    if (IsChinaToday(ReadJsonString(body, "successAt"))) markedToday[listName].Add(id);
                }
            }

            var logFile = Path.Combine(root, "\u515c\u5e95", "\u515c\u5e95\u65e5\u5fd7.txt");
            if (File.Exists(logFile))
            {
                foreach (var line in File.ReadAllLines(logFile, Encoding.UTF8))
                {
                    var match = Regex.Match(line, "^\\[(?<at>[^\\]]+)\\].*\\u515c\\u5e95\\u51fa\\u4e66\\u6210\\u529f\uff1a(?<id>\\d+)");
                    if (!match.Success || !IsChinaLogDate(match.Groups["at"].Value)) continue;
                    string listName;
                    if (sourceById.TryGetValue(match.Groups["id"].Value, out listName)) actualToday[listName].Add(match.Groups["id"].Value);
                }
            }
        }
        catch { }

        return shortList + "\u6210\u529f\u515c\u5e95\uff1a" + actualToday[shortList].Count + Environment.NewLine
            + mediumList + "\u6210\u529f\u515c\u5e95\uff1a" + actualToday[mediumList].Count + Environment.NewLine
            + "\u4eca\u65e5\u5df2\u6807\u8bb0\u5b8c\u6210" + Environment.NewLine
            + shortList + "\uff1a" + markedToday[shortList].Count + Environment.NewLine
            + mediumList + "\uff1a" + markedToday[mediumList].Count;
    }

    private static string FallbackListName(string source, string shortList, string mediumList)
    {
        if (String.IsNullOrEmpty(source)) return null;
        if (source.IndexOf("\u52a0\u6025\u8d85\u77ed\u4e66\u5355", StringComparison.Ordinal) >= 0) return shortList;
        if (source.IndexOf("\u52a0\u6025\u4e2d\u77ed\u4e66\u5355", StringComparison.Ordinal) >= 0) return mediumList;
        return null;
    }

    private static string ReadJsonString(string json, string property)
    {
        var match = Regex.Match(json ?? "", "\\\"" + Regex.Escape(property) + "\\\"\\s*:\\s*\\\"(?<value>(?:\\\\.|[^\\\"])*)\\\"");
        return match.Success ? Regex.Unescape(match.Groups["value"].Value) : "";
    }

    private static bool IsChinaToday(string value)
    {
        DateTimeOffset parsed;
        if (!DateTimeOffset.TryParse(value, out parsed)) return false;
        try { return TimeZoneInfo.ConvertTimeBySystemTimeZoneId(parsed.UtcDateTime, "China Standard Time").ToString("yyyy-MM-dd") == BeijingNow().Substring(0, 10); }
        catch { return parsed.LocalDateTime.Date == DateTime.Now.Date; }
    }

    private static bool IsChinaLogDate(string value)
    {
        DateTime parsed;
        return DateTime.TryParse(value, out parsed) && parsed.ToString("yyyy-MM-dd") == BeijingNow().Substring(0, 10);
    }

    private static string BeijingNow()
    {
        try { return TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "China Standard Time").ToString("yyyy-MM-dd HH:mm:ss"); }
        catch { return DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"); }
    }

    private string ReadModeText()
    {
        if (platform.Checked && fallback.Checked) return "平台+兜底";
        if (platform.Checked) return "仅平台";
        if (fallback.Checked) return "仅兜底";
        return "未选择";
    }

    private string ReadFallbackSummary()
    {
        var file = Path.Combine(root, "兜底", "兜底状态.json");
        if (!File.Exists(file)) return "兜底状态：暂无数据";
        try
        {
            var json = File.ReadAllText(file, Encoding.UTF8);
            var records = Regex.Matches(json, "\\\"bookId\\\"\\s*:").Count;
            var completed = Regex.Matches(json, "\\\"successAt\\\"\\s*:").Count;
            var failures = Regex.Matches(json, "\\\"nextRetryAt\\\"\\s*:").Count;
            var maxFail = 0;
            foreach (Match match in Regex.Matches(json, "\\\"failCount\\\"\\s*:\\s*(\\d+)")) maxFail = Math.Max(maxFail, int.Parse(match.Groups[1].Value));
            return string.Format("记录 {0} 本，已完成 {1} 本，失败重试中 {2} 本，最高失败 {3} 次", records, completed, failures, maxFail);
        }
        catch (Exception error) { return "兜底状态读取失败：" + error.Message; }
    }

    private static string Tail(string file)
    {
        try
        {
            if (!File.Exists(file)) return "暂无日志";
            const int maxBytes = 96 * 1024;
            byte[] bytes;
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                var startOffset = Math.Max(0, stream.Length - maxBytes);
                stream.Seek(startOffset, SeekOrigin.Begin);
                var length = (int)(stream.Length - startOffset);
                bytes = new byte[length];
                stream.Read(bytes, 0, bytes.Length);
            }
            var lines = Encoding.UTF8.GetString(bytes).Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            var start = Math.Max(0, lines.Length - 180);
            return string.Join(Environment.NewLine, lines, start, lines.Length - start);
        }
        catch (Exception error) { return "日志读取失败：" + error.Message; }
    }

    private void RunSelfCheck(object sender, EventArgs e)
    {
        summary.Text = "正在执行自检...";
        Task.Run(delegate
        {
            var script = Path.Combine(automation, "scripts", "self-check.ps1");
            var check = RunCapture("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"", root);
            var output = string.IsNullOrWhiteSpace(check.Item2) ? "自检没有返回内容" : check.Item2;
            BeginInvoke((Action)delegate { mainLog.Text = output; summary.Text = check.Item1 == 0 ? "完整自检通过" : "自检发现问题"; MessageBox.Show(output, "点重自动化自检", MessageBoxButtons.OK, check.Item1 == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning); });
        });
    }

    private static Tuple<int, string> RunCapture(string file, string args, string workingDirectory)
    {
        var info = new ProcessStartInfo(file, args) { WorkingDirectory = workingDirectory, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        using (var process = Process.Start(info))
        {
            var output = process.StandardOutput.ReadToEnd() + process.StandardError.ReadToEnd();
            process.WaitForExit();
            return Tuple.Create(process.ExitCode, output);
        }
    }
}
