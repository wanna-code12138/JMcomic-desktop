# 1.3.0 准备阶段验证记录

日期：2026-10-02（Asia/Shanghai）。代码基线 `190aff86a94466af43fa02703dbfc7007d218550`，源码版本 `1.2.0`。

本轮完成调查和待批准设计，没有实现 1.3 产品功能。主交付物：[调研与设计](../../../docs/design/2026-10-02-1.3.0-comments-account-design.md)、[执行清单](../../../docs/plans/2026-10-02-1.3.0-preparation-and-execution.md)。

## 1. 当前代码基线

实际运行：

```powershell
npm run check
```

关键真实输出：

```text
TOTAL=82 PASSED=82 FAILED=0
> jmcomic-desktop@1.2.0 typecheck
> tsc --noEmit
> jmcomic-desktop@1.2.0 build
> electron-vite build
out/main/index.js      250.16 kB
out/preload/index.js  9.50 kB
✓ built in 6.84s
```

完整记录：[baseline-check.txt](baseline-check.txt)，仅规范化两行构建日志的行尾空格。退出码 0。82 是项目测试文件数量，不声称是所有内部断言数量。

第一次在受限沙箱运行时，tsx 在测试模块加载前因 `uv_os_get_passwd returned ENOMEM` 失败（1 个 mjs 通过、81 个 TS 文件无法启动）；通过正常权限重跑后全部通过。这不是用业务改动消除失败，也不是某项 1.3 的 TDD 红灯。

已有构建警告两项：`networkProbe.ts`、`httpClient.ts` 同时被静态与动态导入，不能按动态导入拆成独立 chunk。本轮未改这两个文件；警告不阻止构建，相关体积不能当作启动性能结果。本轮没有重新打包 EXE 或执行产品 GUI 回归。

## 2. 历史模块的本地行为调查

实际运行旧版本 `6fdc90a7d700480e12480c6bac2fe41380894aed` 的生产模块，外部 I/O 全部替换为合成端口。入口及复现方式：

```powershell
node outputs/research/1.3.0/probes/observe-history.cjs
```

证据：[history-observations.json](history-observations.json)；保留的探针：[observe-history.cjs](probes/observe-history.cjs)、[load-source.cjs](probes/load-source.cjs)。须从仓库根目录运行，需要已有 TypeScript/cheerio 与该历史提交。

| 检查 | 当前实际结果 |
| --- | --- |
| `replys` 的一条内嵌回复 | 旧 parser 输出 0 条，复现丢失 |
| `spoiler="2"` | 旧 parser 输出 false，复现漏遮挡 |
| `spoiler="1"` | 旧 parser 输出 true，复现错误遮挡 |
| 畸形评论 envelope | 被解析为空列表，复现错误隐藏 |
| `ensureSessionValidated` | 增加远端请求 0 次，仅检查本地 lease |
| 当前 scope 认证失败 | 整个账户进入 verification-required |
| 重新认证时排入旧 401 | 100 次均未误伤新会话；该特定时序受到最终历史版本保护 |

诊断脚本退出码 0，含义是这些“旧行为”被成功观察和断言；**不表示缺陷已修复**。其他并发时序和真实服务端会话互踢尚未验证，不能以这 100 次实验宣称根因已彻底排除。

## 3. 公开网络只读调查

最终探测时间 2026-10-02 22:15:40（Asia/Shanghai）。入口：[probe-public-comments.cjs](probes/probe-public-comments.cjs)，结果：[public-comments-probe.json](public-comments-probe.json)。

运行使用现有生产签名/解密和有界 fetch-port，实际 HTTP 执行器为 Node fetch；`credentials: omit`。没有启动 Electron、访问应用用户目录、登录、签到、发表评论或修改收藏等账户行为。

最后一轮 6 个 GET 均成功：1 个 setting、5 个 forum。结果为：

| 样本/查询 | 主评论数 | total | 内嵌回复数 |
| --- | ---: | ---: | ---: |
| 123456，all，第 1 页 | 10 | 34 | 0 |
| 123456，all，第 2 页 | 10 | 34 | 0 |
| 123456，manhua，第 1 页 | 10 | 34 | 0 |
| 123456，all，第 4 页 | 4 | 34 | 3 |
| 1173049，all，第 1 页 | 4 | 4 | 0 |

当次 setting 给出 appVersion `2.1.9`。评论 envelope 为 list/total；回复键是 `replys`，出现 `spoiler=1/2`；第 1、2 页 CID 摘要不同。第 1 页 all/manhua 摘要相同，仅证明这一样本的结果相同。

未保留正文、昵称、用户 ID、头像值或原始响应，仅保留形状、数量与摘要。结果不构成用户资料快照，也不证明生产 Electron/UI 路径或长期成功率。

## 4. 上游源码取证

本轮读取并固定版本：

- `JUKOMU/JMComic-Api-Java@5a7a4bb4870edb512274dc2adeb4f7c157445321`，提交时间 2026-10-01。
- `hect0x7/JMComic-Crawler-Python@5a3f627cea76030886f3da452ffb8ec7a540a0bb`，提交时间 2026-09-28。

共获取 16 个公开源码/许可文件，382,597 字节（约 374 KiB），未安装依赖。文件列表、固定链接与 SHA-256 见 [source-index.json](source-index.json)。原始源码仅作临时阅读，未整库复制或加入产品依赖。

核对得到的关键差异：Python API 客户端仍不实现评论发表，Java 有 `/comment` 请求；不能把一套库的限制说成平台限制。Java 接口明确注明评论投票停用；注册、找回密码与经济操作的 Deprecated 状态应单独评估。当前 Python/Java 收藏修改均为 POST Toggle，旧搜索摘要中的 GET 描述不作为协议依据。

PowerShell 的公开 HTTPS 读取遇到 TLS 身份验证错误，随后使用标准 Python urllib 且保持证书校验成功读取；没有关闭证书检查。对第三个参考项目的 master 引用元数据请求返回 422，未继续下载；仅使用维护者公开发布记录作旁证。

## 5. 明确未完成的验证

- 本轮真实账户请求数量为 0；没有复用历史账户、凭据或会话。
- 尚未确认当前有效账户的认证证明端点、恢复所需完整 Cookie 集、部分端点 401 的服务器行为。
- 尚未验证收藏/追更/通知写入或任何增强功能的实际效果。
- 尚未实施或验证新的评论 UI、账户 UI、Session、代理和 vault 代码。
- 本轮未发布版本、修改 package 配置、合并 main 或推送提交。

这些边界已写入实施门槛；当前基线测试通过不能替代它们。

## 6. 文档与交付检查

交付检查包括本地 Markdown 链接、JSON 解析、探针语法、调查结果数量一致性、`git diff --check`、生产目录无变更和暂存差异检查。具体输出记录在 [document-validation.txt](document-validation.txt)。

只提交设计、计划及必要调查证据；本轮创建的 `work/1.3-research/` 在证据保留后清理，其他 work 文件不动。
