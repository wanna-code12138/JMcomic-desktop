# 1.1.0 发布前仓库核对

日期：2026-09-30。核对范围为当前 `main` 源码与 `feat/update-public-docs` 文档提交、版本标签、发布工作流、自动化测试、依赖、便携包和启动行为。本报告记录本次实际执行结果，不代表逐行审阅仓库全部源码。

## 版本与发布状态

- `package.json` 版本为 `1.1.0`，`main` 源码提交为 `2c342d2`；文档更新在 `feat/update-public-docs` 的 `f9b2f70` 及后续提交。
- 远端现有标签为 `v1.0.4`、`v1.0.5`；核对时最新 GitHub Release 是 `v1.0.5`。仅推送 `main` 不触发发布工作流，推送 `v*` 标签才会触发。
- 1.0.6 是源码开发节点，没有对应标签或独立 Release；1.1.0 尚待合并文档、建立标签和发布。

## 本次验证

| 检查 | 实际结果 |
| --- | --- |
| `npm run check` | 退出码 0；统一测试、TypeScript 类型检查和生产构建通过。构建保留两条混合静态/动态导入提示。 |
| GitHub `main` CI | GitHub Actions 对 `2c342d2` 的 CI 运行已完成，结论为 `success`。文档分支尚未合并。 |
| `npm audit --omit=dev` | 生产依赖高危、严重及其他级别漏洞数均为 0。 |
| 标准 `npm run package -- --publish never` | 源码构建通过，electron-builder 在官方 GitHub 下载请求等待 600 秒后超时；本轮未由此命令生成 EXE。 |
| 本机缓存重试 | 使用 electron-builder 的临时 `electronDist` 参数指定已有 Electron 43.2.0 官方缓存包，成功生成 1.1.0 便携 EXE；未修改项目配置，也未上传。 |
| ASAR 依赖 | `scripts/verify-package.cjs` 检查 250 个包和 858 条必需依赖边，错误数 0。 |
| 真实 EXE 合成场景 | [结果](reader-qa/release-audit-20260930-fixture/result.json)：7 项断言、0 错误，覆盖启动、单篇详情、下载、反打乱、离线阅读、CBZ、PDF 工作进程及正常退出。 |
| 真实 EXE 启动 | [结果](reader-qa/release-audit-20260930-startup/result.json)：2 项断言、0 错误；使用隔离用户数据目录，无漫画 ID 实网阅读。 |

本次便携 EXE 为 `dist-electron/JMComic Desktop Portable 1.1.0.exe`，大小 108,418,811 字节，SHA-256 为 `dfdeba03c06acbe079a4eeb867fa02a272f8e43bc1026704f95db57d7e094296`。该文件在被 Git 忽略的本地打包目录中，没有上传。它与现有 v1.0.5 便携文件一样没有数字签名。

## 发布前待处理

1. 合并已推送的文档分支到 `main`。仓库工作纪律要求合并前取得用户批准。
2. 发布工作流当前只遍历 `src/main/__tests__/*.test.ts`，漏掉统一测试入口发现的 `scripts/` 测试，也未运行 `npm run typecheck`。建议将旧测试循环替换为 `npm test`，并在打包前增加 `npm run typecheck`。这是 `.github/workflows/release.yml` 配置改动，按仓库工作纪律需先取得具体批准。
3. 待上述提交进入 `main` 并确认远端 CI 后，在目标提交建立 `v1.1.0` 标签，由 GitHub Actions 构建并创建 Release；发布后核对标签目标、工作流结果、EXE 资源与 Release 页面。

本轮的真实网络启动检查不等于真实站点阅读与 CDN 下载验收；单篇详情的实网回归证据见 [前一轮修复报告](detail-chapters-fix/verification.md)。
