# 隐藏阅读侧栏后设置页滚动区未归位：修复记录

日期：2026-09-29。基线 `8366ed4`，工作分支 `feat/experience-1.1.0`。本记录仅覆盖用户截图对应的设置页滚动区问题，整体 1.1.0 设计另见 [设计文档](../docs/design/2026-09-29-1.1.0-experience-design.md)。

## 根因与最小改动

AppFrame 隐藏阅读栏时已经移除其布局占位，三栏 browse 的 40% 规则也已不匹配。缺陷在 SettingsPage：root 同时设置 `overflow:auto` 和 `maxWidth:720px`，因此浏览父容器变宽后，滚动容器仍停在中间。

将最大宽度从滚动容器下移到各个表单 section，并居中。section 保持原可读内容宽度 672px（原 720px 外框减左右 24px 内边距），外层滚动区填满实际浏览栏。没有修改下载、网络、设置保存或阅读会话逻辑。

## TDD 与真实验证

先增加 `scripts/browse-layout-smoke.cjs`，通过现有 reader-smoke 的 `JM_QA_BROWSE_LAYOUT=1` 入口运行真实 Electron / preload / IPC / 生产 renderer，使用隔离数据与合成网络。修复前实际失败：

```text
settings scrollbar must return to the browse pane's right edge after hiding the reader
browse: left=64 right=1280 width=1216
scroll: left=64 right=784 width=720
readerWidth=0, sameReader=true
```

随后才修改 SettingsPage，实际通过：

```text
QA PASS: settings scrollbar fills the browse pane across hide, restore,
resize, navigation expansion and final close
QA RESULT=0
browse: left=64 right=1280 width=1216
scroll: left=64 right=1280 width=1216
TOTAL=75 PASSED=75 FAILED=0
npm run typecheck: exit 0
npm run build: exit 0
```

真实布局旅程覆盖请求宽度 1280、960、1600（125% DPR），隐藏 / 恢复阅读侧栏、滚到“关于”、阅读 DOM 身份不变、展开导航、深色主题以及关闭最后一个阅读标签。Windows 在 960 请求下实际读回 innerWidth=962，断言使用 native content size 允许 1px 取整，滚动区则始终直接与实际浏览区域几何比较。

首次 green 尝试严格要求 `innerWidth===960`，因上述系统尺寸取整超时；这是测试等待条件的问题，不是产品修复再失败。更正等待条件后原产品补丁未改，完整旅程通过。最初受限环境启动 tsx 时的 `uv_os_get_passwd ENOMEM` 也不算产品红灯；按正常权限流程重跑后得到上述真实红 / 绿结果。

证据：

- [修复前结果](reader-qa/browse-layout-red-20260929/result.json)与[修复前截图](reader-qa/browse-layout-red-20260929/settings-hidden-1280.png)。
- [最终结果](reader-qa/browse-layout-verified-20260929/result.json)。
- [1280 宽](reader-qa/browse-layout-verified-20260929/settings-hidden-1280.png)、[960 宽](reader-qa/browse-layout-verified-20260929/settings-hidden-960.png)、[1600 宽](reader-qa/browse-layout-verified-20260929/settings-hidden-1600.png)、[深色与导航展开](reader-qa/browse-layout-verified-20260929/settings-hidden-dark-expanded-nav.png)均已目检；滚动区归位，内容宽度有界。

构建仍有原有的 networkProbe / httpClient 静态、动态导入共用提示。合成网络主动拦截真实站点，日志的 ERR_BLOCKED_BY_CLIENT 是夹具预期，不是实网验收结果。测试用项目 Electron 启动，关于页显示 43.2.0 是该测试运行时版本，不是已打包的 1.1.0。

## 边界

此轮没有生成新的 EXE，也没有修改正式版本号。既有深色控件的表面 / 对比度不一致，以及导航自动收起和用户选择共用状态的问题，已纳入 1.1.0 设计，未将其描述为这次最小补丁已修复。诊断页另有最大宽度限制，整体页面容器改造会统一处理。
