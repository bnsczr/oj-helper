# QOJ 适配说明

核对日期：2026-11-04。QOJ 支持已实现，下列平台差异均已取得用户同意。浏览器扩展版本为 1.14.3，本机启动器为 v5。

## 保持一致的命令与功能

- `oj CF`、`oj qoj`、`oj`：持久化选择 OJ、查看状态。
- `submit A.cpp`、`oj-helper A.cpp`、`--lang`：提交当前文件，并保留 y/n/c 确认。
- `submit clear`、`submit 'clear()'`：清空默认题号并重置顺序。
- `submit --pair`、`submit --install-native`：共用配对和本机连接。
- `submit --serve-files`：保留旧文件助手兼容入口。
- `open s`：覆盖保存 statement.md，并以保存目录作为 VS Code 工作区打开。
- `open b`：新标签打开榜单、导出全表并在 VS Code 中打开。
- 浏览器 +、Shift+N：单题和比赛批量导入、覆盖模板、追加全部可取得的样例、默认提交映射、完成提示 10 秒后关闭。
- Dashboard/单题的 C++ 和 statement 自动打开开关、新建文件初始内容设置。
- 即时通知浏览器、一次任务只提交一次、账号/题号/语言/新编号核对、最终评测结果和最后测试点 checker。

## 已确认并实施的平台差异

| 项目 | 平台差异 | 实现方式 |
| --- | --- | --- |
| 题号 | QOJ 普通题目使用数字 ID，如 `/problem/2`；不能使用 CF 的比赛号加字母解析。 | c 接受数字 ID 或 QOJ 题目网址；批量导入仍按比赛页题号创建 A.cpp 等文件，记录到真实题目 ID 及比赛上下文。 |
| 配置 | 两站的题号、语言名称、最近题面与比赛不能混用。 | 分别保存 CF/QOJ 上下文；clear 仅清当前 OJ；保留并兼容旧 CF 配置。 |
| 编译器 | QOJ 官方评测说明支持 C++23，但编译器选项不能按 CF 的 GNU G++23 名称匹配。 | C++ 默认使用 QOJ 页面实际提供的 C++23，独立记忆语言偏好；不可选时提示 --lang，不默默降级。 |
| 题面和样例 | QOJ 存在 PDF iframe 题面，样例可能位于题目 Attachments 中。 | 按用户后续要求，PDF 逐页提取完整正文写入 Markdown，保留原件并嵌入各页图像以核对公式和插图；读取 HTML 与官方 ZIP 的全部可配对样例。旧记录通过 open s 从本地 PDF 自动补全，不重新覆盖源码。缺失或无法可靠配对时明确提示。 |
| 提交与 checker | 结果可能表现为 AC 或分数，普通 Test 与 Extra Test 同时存在；Training Mode 可能隐藏详细反馈。 | 从正常网页读取原始结果、分数、耗时、内存，仅返回最后一个普通 Test 的 checker，排除 Extra Test；不可见时说明“无法得知结果”。不改变 Training Mode。 |
| 特殊题 | 存在多文件题和 output-only 题。 | 本次仅支持单文件源码，其他类型明确报错。 |
| 比赛上下文 | 普通题库 URL 不含比赛 ID，不能单靠该 URL 决定 open b 的比赛。 | 优先使用添加时的比赛上下文；缺失时选择/指定比赛；不擅自选择另一场比赛。 |
| 榜单 | 用户所称 Extra Standings 在真实页面中的名称为 External Standings。 | 从比赛页识别实际入口，在新标签打开并导出全部原始行列；没有入口或权限时明确报错。CF 的 show unofficial 设置不用于 QOJ。 |
| 比赛批量读取 | QOJ 没有 CF 的比赛全部题目聚合页。 | 复用一个后台标签页依次读取各题，全部读取完成后再创建文件。 |

## 验证范围

- 使用已登录浏览器扩展读取比赛 4582 的 Dashboard、题目、提交列表、已有 AC 详情和 External Standings，五个页面均取得有效结果。
- Dashboard 读取到 13 题；真实提交表单识别到 C++23、单源码上传字段及提交按钮，并排除 Custom Test 表单。
- 题目 22910 的真实 PDF 为 207,084 字节；官方 ZIP 导入两组样例。在隔离目录验证了源码样例追加、PDF 原件一致、statement.md 本地链接和默认题号映射，没有覆盖用户工作目录。
- 后续完整题面修复验证了该 PDF 两页中文正文、题目描述、输入输出、约束、样例解释、数学上下标及原始页面图像。测试覆盖整场混合 HTML/PDF、旧记录补全不改源码，以及损坏 PDF 在写入前报错。
- External Standings 完整读取到 825 行、18 列，并验证本地榜单导出。
- 已有 AC 提交 3330594 的最后普通测试点为 Test #25，checker 为 `ok 1 number(s): "1000000000"`，没有误取 Extra Test。
- 自动化回归覆盖 CF 兼容、模式隔离、单次提交、表单生命周期、隐藏 checker、特殊题拒绝、ZIP 配对及校验、原生大消息传输和浏览器任务领取。
- 1.14.3 修复真实 `.nav.nav-pills` 登录区域识别。真实提交前链路已通过：识别账号、记录基线、进入目标表单，再以不存在的语言验证在上传与正式提交之前明确终止。
- 未向真实 QOJ 发送新的正式提交；正式提交结果监控通过真实已有记录读取和模拟浏览器生命周期分别验证。

## 第一方依据

- [QOJ #1：多文件要求及分数](https://qoj.ac/problem/1)
- [QOJ #2：数字题号及 PDF iframe](https://qoj.ac/problem/2)
- [比赛系统官方说明：PDF、Attachments、提交及逐测试点详情](https://qoj.ac/blog/ucupannouncements/blog/701)
- [QOJ 官方评测环境](https://qoj.ac/blog/qingyu/blog/221)
- [QOJ 更新日志：Training Mode 隐藏反馈](https://qoj.ac/blog/qingyu/blog/631)
