<p align="center">
  <img src="./build/icons/icon-256.png" width="120" alt="JMComic Desktop" />
</p>

<h1 align="center">JMComic Desktop</h1>

<p align="center">
  禁漫天堂（18comic.vip）Windows 桌面客户端 · WinUI 3 风格 · 便携单文件
</p>

---

一个 Windows 上用的禁漫天堂客户端。界面由 React 和 Fluent UI 构建，内容通过匿名 API 获取，必要时回退到直接网页解析或隐藏浏览器提取。整体采用 WinUI 3 风格：自定义标题栏、Mica 材质和 Fluent 控件。

便携版是单文件 exe，免安装。收藏、阅读进度、下载记录和设置保存在 exe 旁的 `JMComicData/jmcomic.db`；非便携运行使用 Electron 的 `userData` 目录。漫画默认下载到系统“下载”目录下的 `JMComic`，也可在设置中更改。迁移时需要保留数据目录和漫画文件，删除 exe 本身不会清空这些数据。

> 仓库源码版本以 `package.json` 为准，可下载的便携版版本以 [Releases](https://github.com/wanna-code12138/JMcomic-desktop/releases/latest) 页面为准。下列功能以当前源码为准；下载旧版 EXE 时请核对版本，v1.0.5 不包含后续的阅读标签和 PDF 下载。版本演进见 [更新日志](CHANGELOG.md)。

> 仅限成年人，请在合法合规的前提下使用。

## 功能

- 首页：推荐 / 最新 / 热门三个 Tab，卡片分批加载
- 搜索：关键词、标签、历史记录，6~7 位车号直接跳详情页
- 分类：类型 / 子类型 / 排序 / 时间筛选，附 38 个热门标签
- 详情页：封面、章节列表、标签点击反查
- 阅读工作区：浏览器式标签支持新建起始页、拖动排序、固定、重命名、批量关闭和恢复；中间保留浏览与详情，分隔条可拖动或键盘调整，可选启动恢复标签
- 阅读器：连续滚动 / 单页模式，图片适配与缩放、键盘翻页、章节目录和附近页缩略图，保存阅读偏好及页内进度，可还原站点的反打乱图片
- 下载：每次选择逐张图片或合并 PDF，也可保存默认格式。PDF 按所选章节顺序合并为一个文件，直接放在下载根目录；图片保留漫画/章节目录。队列支持取消、失败重试、缺页修复，图片可应用内离线阅读或导出 CBZ
- 收藏：本地收藏和浏览历史两个视图，无需登录账号
- 设置：动画即时开关、GPU 硬件加速开关（重启生效）、标签恢复、下载默认格式、代理、缓存、网络重探测、数据导出 / 导入 / 清除
- 隐私：浏览记录、收藏、下载状态全部只存本机，不上传

## 架构上几个关键决定

内容获取统一经过 `contentGateway`：优先使用匿名 API，失败、数据校验不通过或筛选条件不受支持时，依次尝试直接网页解析和隐藏 `BrowserWindow` 提取。直接网页路径只覆盖部分搜索、推荐列表和章节请求；浏览器提取使用互斥锁串行导航。应用先配置代理，再随主窗口启动网页验证；本地下载恢复与匿名 API 预热同时进行。验证失败后由首页“重新验证”入口恢复，后台请求不会在阅读中重新弹出验证视图。

在线封面和漫画图片通过 `jmimg://` 交给主进程，复用图片缓存、请求优先级和并发调度。请求补充 Referer / UA，并用 `credentials: 'omit'` 省略凭据；离线漫画通过限定下载目录的 `jmlocal://` 读取。在线阅读与下载共用反打乱算法。

阅读标签仅挂载当前章节，后台标签保留位置元数据；切换和关闭前等待进度与偏好保存，失败时保留当前阅读并提供重试。同一本书的在线和离线版本分开标记，重复打开不会增加标签。浏览导航不会关闭阅读区，隐藏或关闭最后一个标签后恢复用户原有导航选择。工作区最多 100 个标签，最近关闭保留 20 项；重启恢复默认关闭。

常用快捷键：`Ctrl+T` 新建，`Ctrl+W` 关闭当前标签，`Ctrl+Shift+T` 恢复关闭，`Ctrl+Tab` / `Ctrl+Shift+Tab` 切换，`Ctrl+1…9` 定位，`Ctrl+Shift+PageUp/PageDown` 排序；标签还支持中键关闭和 `Shift+F10` 菜单。阅读工具仍使用 `H` 手动显隐。

新下载按漫画和章节的稳定 ID 建立目录，旧记录继续使用原有标题目录。恢复下载、离线打开和 CBZ 导出共用页文件扫描，按原页号检查缺页；修复时重新取得章节清单并补齐缺失页，不重新编号现有页面。CBZ 导出只包含已完成且扫描齐全的章节。

PDF 使用独立工作进程逐页生成，带章节书签；任务清单先落盘，暂存页放在应用数据目录，完成后通过同盘硬链接安全发布，不覆盖同名文件。下载磁盘需要支持硬链接（例如 NTFS）；不支持时保留可重试任务并提示。为限制解码峰值，单张 PNG 超过 16,777,216 像素时提示改用图片下载；取消和重试保留已下载页面，清除个人数据会停止任务并移除暂存页，已完成的 PDF 和图片保留。

动画采用 CSS/WAAPI 短过渡并遵循系统减少动态效果。GPU 开关写入 `JMComicData/startup-preferences.json`，便携迁移时随数据目录保留；核显/独显采用 Chromium 的兼容性判断，不强制忽略驱动屏蔽列表。设置显示实际运行状态，不保证所有旧驱动都能启用硬件路径。

sql.js 数据库保存在内存中，由异步写入协调器合并高频进度更新。收藏、设置等需要确认保存的操作等待落盘。正常关窗先等待阅读器保存进度和偏好，再停止下载与导出，最后刷新并关闭数据库；保存失败会保留窗口并显示原因。主库不可读时尝试经过完整性检查的备份，恢复时保留损坏原文件并提示用户，具体边界见架构文档。

```mermaid
flowchart LR
  R["Renderer（React + Fluent UI）"] --> P["Preload（contextBridge）"]
  P -->|IPC| M["Main（Electron 主进程）"]
  M --> G["内容网关与缓存"]
  G --> API["匿名 API"]
  API -->|失败或不支持| WEB["直接网页解析"]
  WEB -->|失败或不支持| SW["隐藏浏览器回退"]
  M --> IMG["jmimg:// 匿名图片请求 / jmlocal:// 离线读取"]
  M --> DB[("sql.js + 异步持久化")]
  M --> DL["下载队列 / 图片缓存"]
```

更详细的模块说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 快速开始

如需已发布的便携版，从 [Releases](https://github.com/wanna-code12138/JMcomic-desktop/releases/latest) 下载 `JMComic Desktop Portable <版本>.exe`，双击即用，无需安装。下载前请核对 Release 页的版本号；要使用当前 `main` 的 1.1.0 功能，请按下方步骤从源码构建。

## 从源码构建

建议使用 Node.js 22 与 npm，与 CI 环境保持一致：

```powershell
# 安装依赖
npm ci

# 开发模式（Vite HMR + Electron），也可以双击 dev.bat
npm run dev

# 生产构建
npm run build

# 打包便携版单文件 exe
npm run package
```

## 项目结构

```text
src/
├── main/                 # Electron 主进程
│   ├── index.ts          # 入口：窗口、Mica 材质、协议注册、IPC 装配
│   ├── scraperWindow.ts  # 隐藏浏览器内容提取引擎（带互斥锁）
│   ├── contentApi.ts     # 首页 / 搜索 / 分类 / 详情 / 章节 IPC
│   ├── contentGateway.ts # API → 直接网页 → 浏览器回退与结果校验
│   ├── content/          # 匿名 API 的发现、传输与数据解析
│   ├── imageProtocol.ts  # jmimg:// 图片代理
│   ├── imageNetwork.ts   # 图片请求调度、取消与重试
│   ├── imageLoader.ts    # 图片磁盘缓存与下载加载器
│   ├── downloadManager.ts# 下载队列、任务恢复与缺页补齐
│   ├── downloadCore.ts   # 稳定目录、旧路径兼容与页文件扫描
│   ├── downloadExport.ts # CBZ 导出入口（归档写入在 cbzExport.ts）
│   ├── database.ts       # sql.js 初始化、迁移、异步持久化与恢复
│   ├── shutdownController.ts # 渲染器保存、停止下载/导出、数据库关闭的顺序
│   ├── sessionWarmup.ts  # 启动网页验证、会话状态与显式重试
│   └── __tests__/        # 主进程与共享逻辑回归测试
├── preload/              # contextBridge，统一暴露 electronAPI
├── shared/               # 阅读器契约、反打乱算法等跨进程逻辑
└── renderer/             # React 18 + Fluent UI v9 + Tailwind
    └── src/
        ├── pages/        # 首页 / 搜索 / 分类 / 详情 / 阅读器 / 下载 / 收藏 / 设置
        ├── reader/       # 阅读会话、图片、工具栏、布局计算与样式
        ├── components/   # 漫画卡片、标题栏、章节选择等
        ├── stores/       # zustand 全局状态
        └── theme/        # WinUI 主题与语义样式
```

## 测试

统一测试入口递归发现 `src/` 和 `scripts/` 下的 `*.test.ts`、`*.test.mjs`。TypeScript 测试通过 `tsx` 执行，`.mjs` 测试使用 Node 测试运行器：

```powershell
npm test              # 全部自动化测试
npm run typecheck     # TypeScript 类型检查
npm run check         # 依次运行测试、类型检查和生产构建
```

CI 在向 `main` 推送和 Pull Request 时运行测试、类型检查与生产构建（见 [ci.yml](.github/workflows/ci.yml)）。阅读器交互、真实 Canvas 和网络回退仍需按改动范围补充 Electron 验收，记录实际环境与结果；历史性能报告不代表当前版本的测量值。

`npm run package` 完成后会独立校验 ASAR 内运行依赖。交付前还必须直接运行生成的 EXE，验证主进程、preload、界面及正常关闭；加载 ASAR 的开发测试不能代替成品启动验收。阅读器同时覆盖开发 StrictMode 与生产页面，具体命令见 [贡献指南](CONTRIBUTING.md#electron-行为回归)。

## 贡献

欢迎提 Issue、PR 或改进建议，先读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## Roadmap

- 持续测量不同内容路径的首屏、回退率和缓存命中，扩大经验证的 API / 直接网页覆盖范围
- 评估下一章预加载的收益、取消行为和缓存成本
- 完善长章节、混合尺寸图片、触控与无障碍阅读体验
- 首页无限滚动
- 扩大多显示器、触控和不同显卡/驱动的真实兼容性验证

## 免责声明

个人学习项目，与 18comic.vip 无任何关联；站点内容版权归原作者与平台所有。请勿用于商业或侵权用途，仅限成年人，遵守当地法律法规。

## 许可证

[MIT](LICENSE)
