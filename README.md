# oj-helper

Codeforces / QOJ 题目导入、代码提交、题面与榜单助手，包含浏览器扩展、命令行工具和配套 VS Code 扩展。

[GitHub 仓库](https://github.com/bnsczr/oj-helper)

## 选择 OJ

```powershell
oj CF
oj qoj
oj
```

`oj CF` 切换为 Codeforces helper，`oj qoj` 切换为 QOJ helper，两种模式都使用 `submit A.cpp`、`open s`、`open b` 等命令。单独运行 `oj` 查看当前选择及用法，OJ 名称不区分大小写。

首次使用默认 Codeforces。选择保存在本机偏好中，重启终端后仍然生效。两站分别保存题号关联、题面记录、文件序号和语言偏好。`submit clear` 重置两站的命令行状态。浏览器 `+` 或 `Shift+N` 成功添加单题或整场比赛后，会自动切换到该网页对应的 OJ，随后 `submit` 和 `open` 直接使用该站点。比赛／正常显示模式独立保存。

已将项目目录加入 Path 的 Windows 用户可以直接使用 `oj`；通过 npm 安装或链接时也会提供同名入口。在项目目录也可运行 `node oj.js CF` 或 `node oj.js qoj`。

## 新建与添加题目

浏览器扩展更新到 **1.14.6** 后，打开 Codeforces / QOJ 题目页，点击工具栏 + 或在正文按 **Shift+N**。页面立即显示“正在添加…”，完成后显示分配的文件名、默认提交题号和路径。

不同题目在每个保存目录中依次分配 `A.cpp`、`B.cpp`、`C.cpp`……，Z 之后为 AA、AB。重复添加同一题复用已分配文件；同名文件已存在时直接覆盖，并写入扩展设置中的初始内容，同时更新题号。提交 `A.cpp` 和 `B.cpp` 时分别使用各自记住的题号。未关联的文件沿用最近设置的默认题号，确认处会显示目标；c 可修改并永久保存当前文件的题号。

## 清空默认题号及重置序号

PowerShell 中运行：

```powershell
submit 'clear()'
```

也可以使用 `submit clear`。PowerShell 会解析未加引号的括号，因此 `clear()` 要加引号。命令清除两站的默认题号、逐文件映射、提交记录、比赛统计、题面缓存及语言偏好，并恢复 Codeforces 和正常模式。下一次添加从 A.cpp 开始。浏览器扩展设置、配对和已有文件保留。

## 安装与设置

1. 安装 Node.js 18+，在本项目目录运行 `npm ci`。在 Chrome / Edge 扩展管理页加载本项目的 `extension` 文件夹，并允许扩展访问 Codeforces 和 QOJ 页面。
2. 将本项目目录加入 Windows 用户 Path，或者在本目录通过 `node cli.js` 使用下面命令。`oj-helper` 与 `submit` 使用同一命令入口，例如 `oj-helper A.cpp`。
3. 运行 `submit --pair`，将配对码粘贴到扩展设置并保存。不要分享 `.bridge-secret` 或配对码。
4. 扩展设置中填写已有保存目录的绝对路径，例如 `E:\code`；不提供默认保存目录。
5. 运行一次 `submit --install-native`；无法自动检测时，使用扩展设置提供的带 ID 安装命令。浏览器会按需启动无窗口助手，完成操作后退出，不需要 `submit --serve-files` 或常驻终端。

本机助手安装使用当前用户 Chrome / Edge 的 NativeMessagingHosts 连接，不需管理员权限。项目或 Node.js 路径变化后重新运行安装命令。1.8.0 已修复浏览器保持消息输入管道开启时启动器阻塞的问题，并为添加结果设置超时反馈。刷新扩展及题目页后使用新版。

### Linux 上使用 Firefox

安装 Node.js 24 LTS，使用桌面版 Firefox 128 或更新版本。以下示例把项目和题目文件分别放在 `~/vscpp/oj-helper` 和 `~/vscpp/OJ-work`。命令可以直接在 fish 中执行。已经克隆过项目时，从 `cd` 开始。

```sh
mkdir -p "$HOME/vscpp/OJ-work"
git clone https://github.com/bnsczr/oj-helper.git "$HOME/vscpp/oj-helper"
cd "$HOME/vscpp/oj-helper"
npm ci
npm run build:firefox
node cli.js --install-native firefox
node cli.js --pair
realpath "$HOME/vscpp/OJ-work"
```

在 Firefox 打开 `about:debugging#/runtime/this-firefox`，点击「临时载入附加组件」，选择构建命令输出的 `.firefox-extension/manifest.json`。如果文件选择器隐藏点号目录，可直接输入路径。打开 `about:addons` 中的 oj-helper 设置，保存配对码和 `realpath` 输出的题目目录，并允许访问使用的 OJ 网站。刷新题目页后，点击 `+` 或按 `Shift+N` 验证导入。

```sh
node cli.js status
node cli.js "$HOME/vscpp/OJ-work/A.cpp"
node open.js b
```

本机助手写入 `~/.mozilla/native-messaging-hosts/`，按需启动。Snap 和 Flatpak 的 Firefox 可能需要发行版提供的额外本机通信配置。移动项目或更换 Node.js 路径后，再执行一次 `node cli.js --install-native firefox`。

临时加载的版本在 Firefox 退出后需要重新加载。更新项目后运行 `npm ci` 和 `npm run build:firefox`，再在调试页重载扩展。常规 Firefox 的长期安装使用 Mozilla 签名的 `.xpi`，见 [Mozilla 签名说明](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)。

### Linux 桌面安装

使用同一台 Linux 电脑上的终端和桌面版 Chrome、Chromium 或 Edge。推荐 Node.js 24 LTS；如需自动打开文件，请安装 VS Code，并确认 `command -v code` 有输出。

```bash
cd "$HOME"
git clone https://github.com/bnsczr/oj-helper.git
cd oj-helper
npm ci
mkdir -p "$HOME/OJ-work"
```

1. 在 `chrome://extensions`（Edge 为 `edge://extensions`）打开开发人员模式，加载仓库的 `extension` 目录。
2. 运行 `node cli.js --pair`，在扩展选项保存配对码，并填写保存目录的绝对路径（可用 `realpath "$HOME/OJ-work"` 查看）。
3. 运行 `node cli.js --install-native`。如果没有自动识别扩展，复制扩展管理页中该扩展的 ID，运行 `node cli.js --install-native "$extension_id"`，其中 `extension_id` 为复制的 ID。安装后重新加载扩展。
4. 可选：在仓库目录运行 `npm link --prefix "$HOME/.local"`，再运行 `export PATH="$HOME/.local/bin:$PATH"`，即可使用 `oj`、`submit`、`open` 和 `mode`。将这条 `export` 写入所用 shell 的配置文件可在以后复用。也可在仓库目录用 `node cli.js A.cpp`、`node open.js s`、`node mode.js contest`。

安装只写当前用户的浏览器 `NativeMessagingHosts` 目录与项目下的 `.native-host`，不需要 `sudo`。这套步骤面向普通桌面浏览器安装；Snap／Flatpak 浏览器可能需要额外的本机消息配置。浏览器若以自定义 `--user-data-dir` 启动，可在运行安装命令时将同一个绝对路径传给 `CHROME_USER_DATA_DIR`。更换项目或 Node.js 路径后重新安装本机助手。

## 提交

### 比赛模式

`mode contest` 进入比赛模式，`mode normal` 恢复正常模式，`mode status` 查看当前模式。模式独立于 `oj CF` / `oj qoj` 持久保存。终端以绿色显示 `CORRECT`，以红色显示 `WRONG-ANSWER`、`TIME-LIMIT`、`RUN-ERROR`、`MEMORY-LIMIT` 和 `IDLENESS-LIMIT`，其余结果以黄色显示 `UNKNOW-ERROR`。QOJ 的复合结果（例如 `AC, TL`）以黄色显示 `CORRECT, TIME-LIMIT`。评测期间 `pending` 前的点会原位刷新，重定向输出时保留纯文本。比赛模式隐藏测试点、耗时、内存和 checker。

比赛模式需要浏览器扩展 **1.14.4** 或更新版本。Windows 上的 `mode` 与系统 `mode.com` 重名。在允许执行脚本的 PowerShell 中，从项目目录运行一次 `./install-mode.ps1` 注册命令（其他系统 `mode` 参数仍交由 Windows 处理）。旧版 Windows PowerShell 禁用脚本时，可以直接运行 `mode.cmd contest` 或 `node mode.js contest`。

比赛模式下点击 `+` 或按 `Shift+N` 会先建立提交映射，再读取题面。`submit B1.cpp` 使用映射到的题号。扩展设置中的“比赛模式”自动打开开关默认关闭，此时源码由用户自行准备。开启后会补建缺少的空 C++ 文件，并在 VS Code 中打开对应源码，已有源码保留原内容。浏览器分别报告映射和题面的状态，`open s` 可手动保存已读取的题面。Codeforces PDF 题面提取正文和可识别的样例表，图示和原始版式可通过原件链接查看。`mode normal` 恢复按模板和样例导入。

```powershell
submit A.cpp
submit B.cpp --lang 'GNU G++23'
```

提交前显示文件、默认题号及语言。y 提交，n 取消，c 修改并永久保存题号后重新确认。没有默认题号时提示“没有默认题号，请点击 c 修改默认题号”。C++ 首次默认 GNU G++23，之后按文件类型记住上次确认的语言选择。

`submit status` 从最新到最早显示最近 10 次提交。切换正常模式或比赛模式会保留这些记录，并按当前模式显示。正常模式使用已保存的原始结论、耗时、内存和分数。切换 OJ 或执行 `submit clear` 会清空这份记录。从 Dashboard 点 `+` 或按 `Shift+N` 后，正常模式与比赛模式都在状态页顶部按题号横向显示本轮累计尝试。每题随机分配互不相同、对比鲜明的题号背景，文字自动选用黑色或白色。题号下方的状态方格通过为绿，等待结果为蓝色 `pending`，已尝试未通过为红，未尝试留空。第一次通过也计一次，之后该题的尝试数冻结并保持绿色。重新导入 Dashboard 开始新一轮累计，`submit clear` 清除两站的比赛统计。

在 Dashboard 按 `Shift+N` 时，从按键时刻开始本场计时。两种模式的 `submit status` 都在逐题栏左侧显示总罚时，在已通过的题目下显示首次 AC 的提交时间（分钟）。每道已通过题的罚时为首次 AC 的提交分钟数加上此前每次有效失败的 20 分钟。编译错误不加罚时。本场提交显示开赛后的相对时间，其他提交显示北京时间（年月日时分）。

按 Ctrl+C 退出提交终端后，已发出的提交由独立后台进程继续跟踪。确认提交编号后，记录显示灰色 `pending`。取得结果后自动保存，可再次运行 `submit status` 查看。提交已确认但读取失败、后台进程异常退出，或达到原有的 10 分钟总等待上限时，记录显示灰色 `UNKNOW`，并保留该次 try。未确认提交成功的任务不计入记录及 try。已领取但尚未点击提交的任务会在表单提交前检查取消状态。

`submit B.cpp` 优先使用当前目录中的文件；当前目录没有该文件时，使用最近点击 + 的保存目录中的同名文件及其题号映射。显式指定的相对路径（如 `.\B.cpp`）和绝对路径始终按指定路径使用。确认时会显示实际提交文件的完整路径。

浏览器需已运行、已配对并登录 Codeforces。正式比赛或虚拟赛请先在网页完成报名。扩展通过对应比赛的「My Submissions」和「Submit Code」提交，普通比赛结束后走题库练习入口，Gym 使用自己的提交入口。在确认时输入 c 可以用 Gym 题目链接设置默认目标。这个选择与 `mode contest` 的显示设置无关。收到 `Pretests passed` 时，正常模式立即报告通过预试，比赛模式按其他结果显示 `UNKNOW-ERROR`。系统测试的结果可在比赛提交列表查看。正常模式在最终评测结果可用时显示最后测试点 checker，比赛模式隐藏详情。需要登录或人机验证时暂停等待，不自动重复提交。暂不支持 Groups。网页需使用英文评测语言。

偏好保存在工具目录的 `.submit-preferences.json`，重启后仍保留。文件助手认证、文件分配和保存题号失败时会报告错误；原 + 按钮保留，快捷键在输入框、代码编辑器及输入法组合输入时不触发。

## 检查

先运行 `npm ci` 安装依赖，再运行 `node --test`。QOJ PDF 全文转换使用本地 PDF.js 和 canvas 依赖，首次使用或更新项目后也应运行一次 `npm ci`；无需额外安装 Python 或系统 PDF 工具。测试包括文件分配与模板覆盖、双 OJ 记录隔离、清空与重置、逐文件默认题号、快捷键状态、配对认证、评测结果与 checker 解析、QOJ PDF 全文和 ZIP 样例及超过 1 MiB 附件的真实无窗口启动器传输。

配套 `vscode-extension` 的 + 保留手动输入题号流程，跟随 oj 选择接受 CF 完整题号或 QOJ 数字题号/题目网址。


## 新建文件初始内容

1.8.0 新增扩展设置中的“新建文件的初始内容”，默认填入指定 C++ 模板。编辑后点击“保存初始内容”，下次点击 + 或按 Shift+N 时生效；“恢复默认内容”会恢复并保存默认模板。空白内容也可以保存，用于创建空文件。

每次添加都会将分配到的文件完整写入初始内容，包括重复添加同一题以及 clear 后再次分配到已存在文件的情况。保存模板设置本身不修改任何源码文件。页面成功提示仍在 10 秒后关闭。


## 自动追加题目样例

1.8.0 起，点击 + 或按 Shift+N 时直接读取当前题目页的所有样例输入、输出，按组编号，以 `/* … */` 注释追加在初始代码末尾。兼容普通换行、br 和逐行 div，保留样例中的内部空行。重复添加会重写整个文件，不重复累加样例注释。

交互题保留用于对齐双方对话的空行。通信题按网页顺序保留每次运行的样例；这两类题没有普通样例时仍可导入题面。普通题样例缺失或不配对时提示错误，不覆盖已有文件。刷新扩展及题目页后生效。本机消息上限已扩大到 1 MiB；本机助手更新后支持较长样例。


## Dashboard 批量导入比赛

在比赛 Dashboard 点击 + 或按 Shift+N 后，扩展先更新提交映射和 `submit status` 的逐题栏，再在临时后台标签读取题面和样例。已有源码此时即可提交。普通模式核对整场题目后，才在设置的目录写入初始模板和样例注释。读取期间有改动的源码会保留现有内容。页面提示在操作完成 10 秒后关闭。

每个文件独立保存映射，例如该比赛下 `submit A.cpp` 提交 2278A、`submit B1.cpp` 提交 2278B1。在另一个比赛 Dashboard 批量导入同一目录后，同名文件及其映射更新为新比赛。逐文件的 c 修改仍可用；submit clear 会同时清除此批量映射。普通单题页原来的顺序分配流程保留。

批量读取最长等待约两分钟。若遇到网页验证会展示对应的临时题目页供手动处理，不重试提交。该功能仅针对普通 `/contest/编号` Dashboard。

## 保存题面与打开榜单

1.9.0 起，在 Dashboard 或单题页成功点击 +（或按 Shift+N）后，可以运行：

```powershell
open s
open b
```

`open s` 在最近添加时使用的保存目录中写入 `statement.md`，直接覆盖同名文件，并自动在 VS Code 中打开，优先复用已有窗口。Dashboard 添加记录保存该场所有题目的题面与全部样例，单题添加记录只保存该题。题面按 Markdown 保存，包含题目链接、文字、公式、图片链接及完整样例输入输出。添加时一并保存题面快照，运行此命令不再请求 Codeforces，关闭题目标签页后也能保存。需要安装 VS Code；Windows 优先识别正在运行的 VS Code，同时支持 `code` 命令、注册位置、常见安装目录及更新后的 `_` 子目录，无需额外配置 Path。若找不到安装位置，请先启动 VS Code。若启动失败，会提示具体错误，题面文件仍已保存。

`open b` 通过已配对的浏览器扩展，在**新标签页**打开该比赛的 `/contest/编号/standings/friends/true`（Gym 为 `/gym/编号/standings/friends/true`），保留当前标签页，读取该页完整榜单，保存为 `standings.md` 后在 VS Code 中打开。浏览器需要正在运行，通常 30 秒内开始；若正在提交，请等提交任务完成后使用。页面是否能查看榜单由比赛访问权限决定。

两条命令都以**最近一次成功添加**为准，重启终端后保留；单独修改默认提交题号不会改变这条添加记录。没有添加记录时提示命令无效，不创建文件、不打开网页。`submit clear` 同时清除此记录，之后需要重新添加。旧版添加记录没有题面，请更新扩展、刷新网页并重新点击 +。

`open.cmd` 和 `submit.cmd` 位于同一个工具目录。原来已将该目录加入 Path 的用户可直接使用；如果当前终端还未识别新命令，重新打开终端。在工具目录也可运行 `node open.js s` 或 `node open.js b`。本版无需重新安装已连接的本机助手。

## 添加后自动打开 VS Code

1.10.0 起，点击 + 和 Shift+N 都会在文件创建或覆盖完成后，按扩展设置在 VS Code 中打开文件，优先复用已有窗口。

| 添加页面 | 自动打开 C++ 文件 | 保存并打开 statement.md |
| --- | --- | --- |
| Dashboard | 默认开启，打开该场全部文件 | 默认开启，保存整场题面与所有样例 |
| 单题页面 | 默认开启，打开本题文件 | 默认关闭 |

在扩展设置的“添加后自动在 VS Code 打开”中调整开关，点击“保存自动打开设置”，下次添加时生效。正常模式使用按页面区分的四个开关。关闭 C++ 自动打开时，正常模式仍会创建文件、写入模板和样例并保存提交题号。启用题面自动打开时，会在保存目录新建或覆盖 `statement.md`。也可通过 `open s` 随时保存并打开最新题面。

选中的全部文件通过一次 VS Code 调用打开。若题面保存或编辑器启动失败，浏览器会显示具体原因，并保留已创建的 C++ 文件和提交映射；更新完成提示仍在 10 秒后关闭。升级到本版后刷新扩展及 Codeforces 页面，无需重新安装已经连接的本机助手。

自动打开文件及 `open s`、`open b` 都会同时将文件的保存目录作为 VS Code 工作区打开，例如 `E:\code`。新建终端使用该工作区目录；已经运行的终端不会被命令更改目录，必要时新建一个终端或执行 `cd E:\code`。

## open b 完整好友榜单

1.12.0 起，`open b` 在新标签页直接打开最近添加比赛的 Friends standings，例如 `/contest/2278/standings/friends/true`。读取该页完整榜单，在添加题目时使用的保存目录新建或覆盖 `standings.md`，并自动在 VS Code 中打开。

所有用户行和表格列按网页保留，包括好友排名及括号内总排名、过题数、罚时或得分、单题结果与提交时间、评级和评级变化、N/A 等原始标记及 Accepted/Tried 底部统计。不再只提取当前账号，不按比赛结束状态隐藏列，也不从过题分数推算成绩。表内换行保留为 Markdown 表格中的换行；可在 VS Code 按 Ctrl+Shift+V 预览表格。

“Show unofficial” 设置仍默认开启，可以在扩展设置的“open b 好友榜单”中关闭。读取正常浏览器网页，不调用后台榜单 API、不逐页抓取或搜索账号。若当前网页有分页，导出本页全部行，并保留其他分页链接。读取期间遇到登录或人机验证会等待恢复，不刷新榜单。

榜单读取失败、返回其他比赛数据或版本不兼容时报告错误，保留原有 `standings.md`。完成后保留新标签页。升级到 1.12.0 后重新加载扩展，再运行 `open b`。

## 即时领取提交任务

扩展 1.14.14 起，命令行确认 `y` 后会立即通知浏览器，并在 3 秒内短间隔重试，直到浏览器确认已领取。浏览器的本机连接断开时会自动重连，扩展也会通过定时检查领取任务。网页返回并核对提交编号后，终端才显示 `pending`。`open b` 同样使用即时通知。

升级时运行一次 `submit --install-native` 更新启动器，然后在扩展管理页重新加载本扩展至 1.13.0。本机助手随扩展连接自动启动并等待通知，浏览器连接关闭后退出，不需常驻终端或 `submit --serve-files`。通知连接未就绪时保留原定时领取作为备用。

任务领取使用经过配对认证的本机管道；不会为了提速增加 Codeforces 抓取请求。y/n/c 确认、账号/题号/编译器/新提交编号核对和 checker 返回均保留。网站加载、登录验证和评测队列的耗时由网站决定。

## QOJ 使用与已确认的差异

升级至 1.14.4 后运行一次 `submit --install-native` 更新本机消息启动器，并重新加载浏览器扩展。已安装 v5 本机启动器的用户只需重新加载扩展。

```powershell
oj qoj
submit A.cpp
submit A.cpp --lang 'C++20'
open s
open b
submit clear
```

- 在 QOJ 题目页点击 + 或按 Shift+N，顺序创建 A.cpp、B.cpp；在比赛 Dashboard 添加时，以比赛字母题号批量创建文件，并分别关联真实 QOJ 数字题号及比赛上下文。
- QOJ 没有 CF 的“所有题目”聚合页。批量导入复用一个后台标签页依次读取各题，全部读取完成后才写入，最长等待 15 分钟。
- C++ 首次默认 QOJ 的 C++23；语言偏好与 CF 分开记忆。c 可输入 QOJ 数字题号或题目网址，例如 `123`、`https://qoj.ac/problem/123` 或 `https://qoj.ac/contest/42/problem/123`。
- HTML 题面直接写入 statement.md；PDF 题面逐页提取完整正文（包括题目描述、输入输出和约束），同时保存 `statements/QOJ-题号.pdf` 原件和各页 PNG，并在 Markdown 中嵌入可展开的原始页面，保留公式及插图的完整排版。没有文字层的扫描页直接嵌入整页图像并提示。样例从 HTML 或官方 ZIP 附件读取，写入 Markdown 并追加到源码注释。不能完整解析样例时明确显示警告，不声称样例完整。每个下载资源最多 16 MiB，超过整场消息容量时提示分题添加。
- 旧版仅记录 PDF 链接和样例的导入记录，运行 `open s` 时会从已保存的 PDF 自动补全正文并缓存。无需重新点击 +，不会覆盖已经编写的 C++ 源码。PDF 全文转换失败时明确报错，不把仅有样例的文件当作完整题面。
- 交互样例表按原顺序保留双方列及空单元格。多文件交互题或通信题可导入题面与样例，浏览器会提示使用网页提交；命令行仍只支持单文件源码提交。沿用现有模板、覆盖规则、VS Code 打开开关和 10 秒完成提示。
- 提交通过正常 QOJ 表单完成，记录提交前编号，只点击一次 Submit；在提交详情核对账号、题号、语言和新编号后读取原始结果、分数、耗时及内存。
- checker 只读取最后一个普通 **Test**，忽略 Extra Test，并标注 Test 编号。比赛权限或 Training Mode 隐藏对应详情时显示“无法得知结果”，不改变网站模式。
- open b 新开标签，按比赛 Dashboard 中真实的 **Extra/External Standings** 入口打开并导出完整原始表格。没有入口或权限时报告原因，不换成普通榜单；题库题缺少比赛上下文时，先在终端选择/输入比赛编号。

开发诊断：`node qoj-inspect.js` 只读采集已打开的 QOJ 页面结构，`node qoj-inspect.js --audit` 核验读取器和一题的官方 PDF/样例附件。结果仅保存为已忽略的 `.qoj-inspection*.json`，不上传 Git；诊断不提交代码。

