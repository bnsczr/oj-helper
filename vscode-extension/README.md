# Codeforces Helper

编辑器右上角 **+**，以及资源管理器中 **Codeforces Helper** 面板右上角 **+**，均可新建题目文件。

先打开 VS Code 设置，搜索 `codeforcesHelper.directory`，填写保存目录的绝对路径，例如 `E:\code\CF`。没有默认目录，未配置时会提示并提供“打开设置”。目录需已存在。

点击 + 后输入 `2278F`，即可创建并打开 `2278F.cpp`。也支持 `1A`、`123B1` 或 `1A.cpp`。同名文件已存在时打开原文件，不覆盖。取消输入不会创建文件。

没有打开编辑器时，可以使用资源管理器里的 Codeforces Helper 面板，或命令面板中的“Codeforces Helper: 新建题目文件”。

这是命令行提交工具的配套 VS Code 扩展；提交仍使用现有 `submit` 命令及浏览器扩展。
