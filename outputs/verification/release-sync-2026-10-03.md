# 发布资料与附件同步核验

日期：2026-10-03。发布源码提交 `5fddf13`，版本 `1.3.4`。本轮不新增产品功能，补齐此前只有源码提交、没有正式 Release 的版本，并同步公开说明及发布验证流程。

## 已同步内容

- README：推荐版本、账户能力概述、下载文件名、校验方法、升级数据保留、模块目录及完整版本索引。
- CONTRIBUTING 与 CHANGELOG：发布前完整测试、类型检查、标签和版本一致性、实际 EXE 验证、中文说明及校验附件。
- `docs/releases/`：1.1.0、1.2.0、1.3.1、1.3.2、1.3.3、1.3.4 的中文发布说明。各 Release 已使用对应文件，逐一回读正文匹配。
- 六个版本的标签、Windows x64 便携 EXE 和 `SHA256SUMS.txt` 已发布。历史 1.3.1～1.3.3 明确标注封面空白问题，推荐 1.3.4；1.0.6 开发节点和 1.3.0 设计阶段不创建不存在的独立发行版。
- GitHub 仓库 About 介绍仍准确描述 Windows 便携阅读器，主页指向本仓库；原有 1.0.4/1.0.5 发布内容保留。

## 当前验证

- 新发布配置检查先在旧工作流上失败：未采用完整测试入口，缺少实际 EXE 发布前检查；修正后两项检查通过。
- 本地 `npm run check`：`TOTAL=105 PASSED=105 FAILED=0`，类型检查及生产构建通过。保留两条既有混合 import 提示。
- YAML 解析、五段 PowerShell 的语法解析及公开说明的相对链接检查通过。
- [main CI](https://github.com/wanna-code12138/JMcomic-desktop/actions/runs/37057422265) 对发布提交的测试、类型检查、构建全部成功。
- [1.3.4 Release 工作流](https://github.com/wanna-code12138/JMcomic-desktop/actions/runs/37057431451) 全部成功，包含实际便携 EXE 的隔离回归、下载附件、SHA-256 文件和历史发布说明同步。该隔离回归不冒充真实账户手动验收；此前真实窗口证据见 [1.3.4 封面验收](1.3.4/acceptance.md)。
- 六个标签的远端对象与本地匹配，目标提交中的 `package.json` 均与版本一致；六份远端说明与仓库 Markdown 一致。
- 六个 EXE 下载链接均返回 HTTP 200，Content-Length 与 Release 资产大小一致；每份校验文件与 GitHub 对应资产 digest 一致。
- 实际下载 GitHub 1.3.4 EXE，大小 **108,739,971 字节**，SHA256 **`64a0be0961e7b5c0c016a8216449bbc67b7aa187f96523197376dbf74e1d3934`**，验证一致。本轮仅下载该 EXE，不重复下载其余五份历史安装包。
- GitHub `/releases/latest` 已确认为 `v1.3.4`。

## 版本与构建记录

| 版本 | 源码提交 | 发布工作流 | EXE 字节数 |
| --- | --- | --- | ---: |
| [1.1.0](https://github.com/wanna-code12138/JMcomic-desktop/releases/tag/v1.1.0) | `a5b40e2` | [success](https://github.com/wanna-code12138/JMcomic-desktop/actions/runs/37056737115) | 108338268 |
| [1.2.0](https://github.com/wanna-code12138/JMcomic-desktop/releases/tag/v1.2.0) | `190aff8` | [success](https://github.com/wanna-code12138/JMcomic-desktop/actions/runs/37056746901) | 108336279 |
| [1.3.1](https://github.com/wanna-code12138/JMcomic-desktop/releases/tag/v1.3.1) | `0519a55` | [success](https://github.com/wanna-code12138/JMcomic-desktop/actions/runs/37056759371) | 108352995 |
| [1.3.2](https://github.com/wanna-code12138/JMcomic-desktop/releases/tag/v1.3.2) | `54ac93b` | [success](https://github.com/wanna-code12138/JMcomic-desktop/actions/runs/37056768283) | 108360091 |
| [1.3.3](https://github.com/wanna-code12138/JMcomic-desktop/releases/tag/v1.3.3) | `a574702` | [success](https://github.com/wanna-code12138/JMcomic-desktop/actions/runs/37056776786) | 108741428 |
| [1.3.4](https://github.com/wanna-code12138/JMcomic-desktop/releases/tag/v1.3.4) | `5fddf13` | [success](https://github.com/wanna-code12138/JMcomic-desktop/actions/runs/37057431451) | 108739971 |

完整 URL、版本提交、大小、哈希和匹配结果见 [机器核验记录](release-assets-2026-10-03.json)。本地下载副本保存在 `outputs/releases/github-v1.3.4/JMComic.Desktop.Portable.1.3.4.exe`，该二进制目录按原规则不提交 Git。GitHub 构建与旧本地构建的 EXE 哈希不同，各自使用对应的验证记录；没有覆盖原本地便携包。
