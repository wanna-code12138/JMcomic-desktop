# JMComic Desktop 1.2.0 外观实施与验收

2026-10-02。实施基线 `617eaea`，任务分支 `feat/ui-1.2.0-design`。依据用户批准的[设计](../../../docs/design/2026-10-02-1.2.0-visual-design.md)完成分组清单及全局外观精修，版本为 1.2.0。本文记录当前产物的实际检查；设计文档末尾的研究阶段记录仍保留为历史证据。

## 交付

- [便携版 EXE](../../releases/1.2.0/JMComic%20Desktop%20Portable%201.2.0.exe)，108,420,389 字节（103.40 MiB）。
- [目录版 EXE](../../releases/1.2.0/win-unpacked/JMComic%20Desktop.exe)，需与 `win-unpacked` 内其余文件一起使用。
- [实际便携版设置与新标签页截图](../../reader-qa/120-portable-visible/release-settings.png)、[目录版下载页](../../reader-qa/120-package-visible/release-downloads.png)。内容均为合成测试资料。
- [校验值](checksums.json)、[构建日志](build.txt)、[打包日志](package.txt)。复用本地 Electron 43.2.0，未新增或升级依赖。

两个实际 EXE 的 `app.isPackaged` 均为 `true`、`app.getVersion()` 均为 `1.2.0`，内含 `app.asar` 的 SHA-256 相同。产物保存在本地，本轮不合并 main、不推送或发布。

## 已落地的呈现

- 设置沿用原分组及顺序，组内共用表面与细分隔；说明自然换行，开关独立靠右。主题按钮在窄栏按规则堆叠。GPU 实际状态、待重启、读取/保存失败及操作入口保留。
- Fluent Theme 与自定义 CSS 使用统一语义映射；浅色转为中性底色，深色延续石墨色。明确品牌文字、填充与填充上的文字、状态与收藏颜色；补齐页标题、分组标题、正文、辅助说明的角色。
- 首页、分类、搜索、收藏、详情及下载统一同类 Tab、空态图标、辅助文字、间距与操作基线。详情标签使用成对品牌填充与文字色。诊断数值列右对齐并采用等宽数字。
- 标题栏、导航、新标签页、阅读工具及菜单/对话框调整静态表面、边界、字体和阴影；阅读画布、漫画图片、会话及布局算法维持原实现。
- 修复实际检查发现的搜索框最小宽度问题：300px 浏览栏中的 64px 横向溢出已消除。

## 验证结果

| 项目 | 当前结果 | 原始证据 |
| --- | --- | --- |
| 全部测试 | `TOTAL=82 PASSED=82 FAILED=0`，按测试文件计数 | [tests.txt](tests.txt) |
| 类型与生产构建 | `tsc --noEmit`、Electron Vite 构建均退出 0 | [typecheck.txt](typecheck.txt)、[build.txt](build.txt) |
| 真实外观检查 | 两主题、设置实际浏览宽度 672/480/300px；开关与说明同排，分组相邻行共享边界；六组宽度均为 0px 横向溢出 | [visual-observations.json](../../reader-qa/120-visual-complete/visual-observations.json) |
| 浏览与浮层 | 首页/分类/搜索/收藏/下载全宽及 300px；详情、新标签页、诊断、Fluent 设置/选章浮层、原生格式 dialog 已截图；检查无违规项 | [result.json](../../reader-qa/120-visual-complete/result.json) |
| 主题与配色 | Mica/纯色/亚克力选项、forced-colors 分组边界；深色标签对比度由 2.4241:1 提升至 6.5063:1，浅色为 5.3844:1 | [最终浅色设置](../../reader-qa/120-visual-complete/settings-light-wide.png)、[深色详情](../../reader-qa/120-visual-complete/detail-dark.png)、[强制颜色](../../reader-qa/120-visual-complete/settings-forced-colors.png) |
| 语义色配对 | 两主题常用文字/状态色在四层表面上 ≥4.5:1；品牌按钮四种状态文字 ≥4.5:1；已选开关填充对卡片 ≥3:1 | [theme-contrast.txt](theme-contrast.txt) |
| 动画与几何 | 采集的工具栏进出、菜单进出、页面切换、阅读侧栏隐藏/恢复共七类动作，与实施前关键帧、时长、缓动、位移结果一致；标签栏 44px、工具栏 40px、tabs 顶部 5px | [改动前](../../reader-qa/120-motion-before-final/motion-observations.json)、[改动后](../../reader-qa/120-visual-complete/motion-observations.json) |
| 源码保护范围 | 主进程生产代码、preload、shared、store、motion、navigation 未改；AppFrame、PageHost、ReaderWorkspace、ReaderPage、ExperienceSettings 未改；CSS 中 33 项动效相关声明未改 | [source-contracts.json](source-contracts.json) |
| 动画特殊路径 | 动画关闭、系统减少动态、快速切页、原生窗口可见性 true/false/true 及恢复后收敛；GPU 开/关两次可见窗口检查通过 | [硬件路径](../../reader-qa/120-motion-window-on/result.json)、[软件路径](../../reader-qa/120-motion-window-off/result.json) |
| 阅读与工作区 | 锚点/缩放/键盘/焦点、单活动会话、全屏/最小窗口、标签操作、保存失败重试、下载缺页修复、离线/CBZ、正常关闭保存均通过 | [reader](../../reader-qa/120-reader/result.json)、[workspace](../../reader-qa/120-workspace/result.json)、[tabs](../../reader-qa/120-tabs/result.json) |
| 设置与 PDF | 动画/GPU 独立保存、重启恢复、格式确认/默认/覆盖、多章 PDF、唯一文件名均通过 | [settings](../../reader-qa/120-settings/result.json)、[restart](settings-restart.txt)、[PDF](../../reader-qa/120-pdf/result.json) |
| 缩放与布局 | Electron 强制显示缩放 1/1.25/1.5/2 下各四种窗口/主题阅读控件边界检查通过；设置/诊断现有滚动布局检查通过 | [矩阵](matrix.json)、[browse](../../reader-qa/120-browse/result.json) |
| 可见窗口资源矩阵 | GPU 开/关 × 动画开/关四组合通过；每组 12 次标签/侧栏循环后 1 个 reader、1 个标签、6 张图片、0 个空闲活动动画 | [visible-matrix.json](visible-matrix.json)、[示例原始采样](../../reader-qa/120-visible-gpu-on-motion-on/result.json) |
| 包内依赖 | 250 个包、858 条必需依赖边，`errors: []` | [package-dependencies.json](package-dependencies.json) |
| 实际目录版与便携版 | 隐藏与可见窗口均退出 0；真实包加载、下载解扰 23 行金样、本地图片协议、CBZ、PDF worker、阅读/工具栏/关闭检查通过 | [目录版](../../reader-qa/120-package-visible/result.json)、[便携版](../../reader-qa/120-portable-visible/result.json) |

主审已目检两主题设置与窄栏、深色详情/新标签页、浅色首页/搜索/下载、深色分类/诊断、设置偏好与格式对话框、强制颜色，以及两种实际包的稳定界面截图。封面使用合成占位内容，不包含个人书库。

## 红灯与复测说明

1. 实施前真实 Electron 检查发现：480/300px 设置开关落到说明下方；设置项之间存在独立卡片空隙；深色标签对比度 2.4241:1。先保留[失败证据](../../reader-qa/120-visual-before-visible/visual-observations.json)，再修改布局和配色，[设置阶段复测](../../reader-qa/120-visual-settings-green/result.json)通过。
2. 扩展浏览页检查时，浅深主题的 300px 搜索页均溢出 64px，见[失败证据](../../reader-qa/120-visual-pages-check/visual-observations.json)。增加 SearchBox 的 `minWidth: 0` 后，最终外观检查 `violations: []`。上述实际修复有先失败后通过的证据；补充的静态主题单元断言不单独声称测试先行。
3. 首次 motion smoke 在点击动画开关后立即读取状态，快于原有异步持久化完成。修正测试等待实际保存完成，不改 ExperienceSettings 保存流程；两条 GPU 路径复测通过。
4. 初轮隐藏窗口的两个“动画开”资源组合未通过静置断言：保留的是原有 `ui-content-in`，160ms、单次播放，分别停在约 103.8ms/69.8ms。隐藏窗口动画时间线不等同于可见呈现；失败记录仍保留在[初轮矩阵](matrix.json)。可见窗口四组合及隐藏后恢复专项检查通过，没有将失败记录改写为通过。
5. 目录版和便携版的最初隐藏截图包含过渡中间帧。包启动脚本增加可见 fixture 选项，并等待有限动画结束；最终外观依据 `120-package-visible`、`120-portable-visible` 的截图。原来的 `*-fixture` 结果只作功能验证和问题追踪，不作稳定外观验收。
6. 最终复核发现 reader smoke 将 `showInactive` 屏蔽，旧的“隐藏后恢复”步骤未验证实际窗口恢复。先增加 `win.isVisible()` 断言，[真实红灯](../../reader-qa/120-motion-window-red/result.json)为 `false !== true`；再让可见测试模式使用原生 `showInactive`，GPU 开/关复测均明确记录 `true/false/true`。`120-motion-verified`、`120-motion-software` 仅保留为早期回归记录；窗口恢复的最终证据为 `120-motion-window-on/off`，没有为此改产品代码。

## 复现入口与边界

基础命令为 `npm test`、`npm run typecheck`、`npm run build`。真实 Electron 外观检查复用 `scripts/reader-smoke.cjs`，设置 `JM_QA_VISUAL=1`、`JM_QA_VISIBLE=1`、`JM_QA_MOTION_BASELINE=outputs/reader-qa/120-motion-before-final/motion-observations.json`，清除 `ELECTRON_RUN_AS_NODE` 后运行 `node node_modules/electron/cli.js scripts/reader-smoke.cjs`，各轮其他参数保存在矩阵文件。复现时使用新的 `JM_QA_RUN`，避免复用已有资料。

本地打包命令：

```powershell
node node_modules/electron-builder/cli.js --win --publish never --config.electronDist=node_modules/electron/dist --config.directories.output=outputs/releases/1.2.0
node scripts/verify-package.cjs 'outputs/releases/1.2.0/win-unpacked/resources/app.asar'
$env:JM_QA_VISIBLE='1'
node scripts/package-launch-smoke.mjs 'outputs/releases/1.2.0/win-unpacked/JMComic Desktop.exe' '120-package-visible' '--fixture'
node scripts/package-launch-smoke.mjs 'outputs/releases/1.2.0/JMComic Desktop Portable 1.2.0.exe' '120-portable-visible' '--fixture'
```

全部网络和导出对话框使用隔离合成输入，未触及用户资料或真实账号；不据此宣称实网/CDN 当前可用。显示缩放为 Electron 测试进程的强制缩放，未改系统设置。Mica/纯色测试证明选项与应用表面切换，不量化 Windows 合成器的材质效果。

运行时颜色对比测量覆盖详情标签；静态单元检查覆盖列出的语义配对，二者不等于所有控件、所有交互状态的完整无障碍认证。资源采样不是 FPS，也没有用它宣称性能提升百分比。关键动效参数和源码保持不变，但本轮没有逐帧等价或专业帧时间评测。

构建仍有基线已存在的两条 Vite 提示：`networkProbe`、`httpClient` 同时静态/动态导入，因此不会拆成单独 chunk。无新增构建错误。源码、脚本、Markdown 与 JSON 的 Git 空白检查通过；原始 `.txt` 日志保留工具输出的末尾空格和空行，未作格式清洗。本轮临时 profile 和脚本清理记录见 [cleanup.json](cleanup.json)；必要的截图、原始 JSON、失败与复测日志保留在 outputs。
