# 贡献指南

感谢你对 JMComic Desktop 感兴趣！无论是修 bug、加功能、改文档还是提建议，都欢迎参与。

## 开发环境

- Windows 10 / 11
- Node.js 22 与 npm（与 CI 保持一致）

```powershell
npm ci
npm run dev        # 开发模式：electron-vite + HMR
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式（Vite HMR + Electron） |
| `npm test` | 运行 `src/` 与 `scripts/` 下全部自动发现的测试 |
| `npm run typecheck` | TypeScript 类型检查，不生成文件 |
| `npm run check` | 依次运行全部测试、类型检查和生产构建 |
| `npm run build` | 生产构建 |
| `npm run package` | 打包便携版单文件 .exe |
| `npx tsx <测试文件>` | 运行单个单元测试 |

## 测试

统一入口是 `npm test`，由 [scripts/test.mjs](scripts/test.mjs) 递归发现 `src/` 与 `scripts/` 下的 `*.test.ts`、`*.test.mjs`。TypeScript 测试通过 `tsx` 加载，主要使用 Node `assert`；`.mjs` 测试使用 Node 测试运行器。单个测试仍可直接运行：

```powershell
npx tsx src/main/__tests__/homepageLogic.test.ts
```

测试以非零退出码表示失败，统一入口输出通过和失败的文件数。新增测试应验证生产行为与真实需求，避免复制实现算法或仅匹配源码字符串。

**工程代码改动请遵循 TDD**：先运行有意义的失败测试，再写最小实现并验证通过。文案、文档、简单重命名等小改动采用人工核对、链接检查或适用的轻量验证。

阅读器改动还应按范围验证真实 Electron 窗口中的滚动 / 单页模式、图片尺寸变化、缩放、键盘与焦点、进度恢复、离线图片及保存失败。反打乱改动需要覆盖生产共享算法和真实 Canvas 绘制；网络或持久化改动应覆盖取消、超时、失败恢复与重新打开的数据结果。自动化通过不能代替这些未执行的检查，提交说明应区分已执行、未执行与历史记录。

下载与导出改动需覆盖稳定 ID 目录、旧标题目录兼容、首尾及中间缺页、同页重复文件、修复后原页序、CBZ 的章节 / 页序，以及导出和重试、删除、关窗并发的处理。数据库与退出流程改动需覆盖主库损坏后备份恢复、主库和备份均不可读、渲染器保存失败 / 超时、后台工作停止及最终落盘顺序。测试通过的场景与尚未执行的验收应分别记录，不能以接口存在作为功能验收证据。

### Electron 行为回归

[scripts/reader-smoke.cjs](scripts/reader-smoke.cjs) 使用已构建的主进程、preload 和渲染页面，打开独立测试窗口；网络和漫画页均由合成夹具提供。每次新验收使用新的运行 ID；仅冷启动续读时复用上一次 ID。测试目录位于 `work/<运行 ID>/`，断言和截图位于 `outputs/reader-qa/<运行 ID>/`。

```powershell
npm run build
$env:JM_QA_RUN = 'manual-' + [guid]::NewGuid().ToString('N')
$env:JM_QA_VISIBLE = '1'
& .\node_modules\.bin\electron.cmd scripts/reader-smoke.cjs
if ($LASTEXITCODE -ne 0) { throw '阅读旅程失败' }
$env:JM_QA_RESUME = '1'
& .\node_modules\.bin\electron.cmd scripts/reader-smoke.cjs
Remove-Item Env:JM_QA_RESUME
```

完整旅程包含可见页和页内位置、模式与键盘、单页失败重试、真实下载、删除合成缺页后修复、CBZ、正常关闭落盘；第二次启动核对第 36 页、离线来源、缩放和章节目录。另可在新的运行 ID 下单独设置 `JM_QA_SAVE_RETRY=1` 或 `JM_QA_HISTORY_RETRY=1` 验证存储故障恢复，完成后清除该环境变量。`JM_QA_LAYOUT=1` 与 `JM_QA_SCALE=1.25` 等值组合用于显示缩放与深浅主题检查；这是应用强制缩放，不能替代物理多屏切换验收。

三栏回归使用 `JM_QA_WORKSPACE=1`，覆盖中间浏览独立性、两本书的标签和锚点、相同章节去重、活动会话卸载及图片/Canvas 释放、切换保存失败、快速连续切换、关闭焦点、铺满/还原/全屏和 Esc。`JM_QA_CLOSE_RETRY=1` 注入偏好及最终保存失败，验证窗口保留、取消关闭通知、恢复阅读和再次关窗的磁盘末值。这些模式各用独立运行 ID，完成后移除对应环境变量；不要混用 `RESUME`、`WORKSPACE`、`CLOSE_RETRY`、`LAYOUT`、`GOLDEN` 模式。

[scripts/descramble-smoke.cjs](scripts/descramble-smoke.cjs) 验证生产 Canvas 的逐像素金样。`reader-smoke.cjs` 的 `JM_QA_GOLDEN=1` 模式则经过完整下载 IPC、文件写入、本地协议和 CBZ；可用 `JM_QA_PACKAGE` 指向本地打包的 `resources/app.asar` 核对包内依赖。

性能实验入口是 [scripts/ablation.ts](scripts/ablation.ts) 和 [scripts/reader-benchmark.cjs](scripts/reader-benchmark.cjs)。控制方式、统计口径和历史基线见 [实施与验收报告](outputs/2026-09-29-implementation-results.md)，三栏当前测量见 [工作区验收](outputs/2026-09-29-three-pane-results.md)。这些 Electron 和性能脚本不属于 `npm test` 的单元测试发现范围，应按修改范围单独运行。

## 分支与提交规范

- 分支命名：`feat/<简述>` 或 `fix/<简述>`
- 提交信息用中文简要说明，遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```text
feat(reader): 章节预加载
fix(download): 修复重试后进度不刷新
docs: 更新架构文档
```

## 提交流程

1. Fork 本仓库并克隆到本地
2. 从 `main` 新建功能分支
3. 完成改动并补充相关验证，运行 `npm run check`；记录需要的 Electron / 网络验收结果
4. 提交并推送到你的 Fork
5. 发起 Pull Request，描述改动动机、方案与验证结果

## 代码风格

- 保持既有风格：TypeScript strict、2 空格缩进、React 函数组件
- 主进程逻辑尽量拆成纯函数（便于单测），UI 组件尽量无状态化
- 内容请求复用 `contentGateway` 的 API / 直接网页 / 浏览器回退；不要在页面中另建抓取链路
- 在线图片与下载复用 `imageNetwork` 调度和 `shared/imageDescrambleCore`；本地图片通过 `jmlocal://` 的路径校验
- 标签与过渡入口由 `appStore` 负责，`ReaderWorkspace` 只挂载活动会话；阅读会话、图片和工具栏位于 `src/renderer/src/reader/`，偏好与进度类型统一使用 `src/shared/readerContracts.ts`
- 下载目录通过 `downloadCore.ts` 的 `resolveTaskDirectory()` 解析；新记录保存 `storage_relpath`，旧记录保留标题目录兼容，不按展示标题重建新任务的目录
- 恢复下载、离线阅读和导出复用 `inspectChapterFiles()`；它检查原页号和图片头，不应被描述为完整图片解码验证
- CBZ 入口位于 `downloadExport.ts`，归档写入位于 `cbzExport.ts`；复用导出目录占用检查、临时文件与取消处理
- 数据写入使用 `database.ts` 的异步持久化接口；需要确认落盘的操作必须等待 Promise 并处理错误
- 关窗保存由 `App` 通过 `onBeforeClose()` 注册工作区任务，准备关闭时冻结新入口，再由 `shutdownController.ts` 按保存、停止下载与导出、关闭数据库的顺序处理；`onCloseCancelled()` 恢复被保留的窗口，新增后台写入必须接入对应停止阶段
- 不改无关文件，不留下注释掉的旧代码
- 新增图片 / 网络来源时检查域名校验与 CSP（`src/renderer/index.html`），只扩大实际需要的范围

## 发布流程

维护者打 `v*` tag 后，GitHub Actions 会自动构建并发布便携版 .exe 到 Releases，无需手动打包上传。
