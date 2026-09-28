# 公开内容 API 化性能笔记

日期：2026-09-03
状态：历史研究记录，保留当时的观察与方案，不作为当前实现说明。当前结论以 [实施与验收报告](../../outputs/2026-09-29-implementation-results.md) 为准；原始审计见 [项目改进审阅记录](../../outputs/2026-09-28-project-improvement-review.md)，现有内容链路见 [架构说明](../ARCHITECTURE.md)。

当前源码已接入匿名 API → 受支持的直接网页解析 → 隐藏浏览器的三级回退，API 与图片请求省略凭据，网页验证按浏览器回退需要触发。下面的接口形态与研究建议不表示每个接口或字段都已在当前版本支持，也不构成实时站点验证或性能结论。在线账号功能不属于当前产品。

## 为什么值得研究

研究时重点关注的 `scraperWindow` 路径使用隐藏 `BrowserWindow` 加载完整网页，再通过 `executeJavaScript` 提取 DOM；它的等待涉及页面脚本、Cloudflare 和单窗口互斥。此处没有可用于当前版本比较的耗时测量。

当时提出在主进程增加 JSON API provider，直接请求结构化元数据和章节 manifest，并接入 `contentGateway`，同时保留浏览器回退。该方向现已进入实现；减少页面导航和 DOM 提取是否带来实际收益，仍应按当前环境测量。

## 当时观察到的公开内容 API 形态

| API | 用途 | 字段或备注 |
| --- | --- | --- |
| `GET /setting` | 读取版本和图片主机等运行配置 | 只取需要的版本/图片主机字段；远端结果不能自动成为敏感会话信任 |
| `GET /album?id={albumId}` | 读取本子元数据和权益状态 | 可能包含 `id`、`name`、`series`、`price`、`purchased`、`is_favorite`、`liked`；空值不能直接猜成 `false` |
| `GET /comic_read?id={chapterId}` | 首选章节 manifest | 可能包含 `id`、`name`、`series_id`、`images[]`、`scramble_id`、`total_page`；图片数组通常是文件名而不是完整 URL |
| `GET /chapter?id={chapterId}` | 兼容旧章节 manifest | 可能包含 `images[]`、`series`、`tags`；通常没有 `scramble_id`，不能无条件替代首选接口 |
| `GET /chapter_view_template?...` | 旧版图片模板或反打乱信息 | 返回脚本/HTML，不是普通 JSON；需要独立解析 |

## 当时提出的工作方式

1. 主进程统一请求、解析响应 envelope，并按版本或站点 profile 选择接口。
2. 用严格 DTO 校验漫画 ID、章节 ID、图片文件名、页数、图片主机和权益字段；遇到未知或矛盾数据时返回 `unknown`，不要猜测成免费或已购买。
3. 由 `contentGateway` 优先选择 API provider；失败、超时或响应结构不匹配时保留网页回退。当前实现先尝试受支持的直接网页解析，再使用 `scraperWindow`。
4. 图片地址由主进程依据受信主机和安全文件名构造，并避免复制反打乱算法。当前在线阅读与下载共用 [imageDescrambleCore.ts](../../src/shared/imageDescrambleCore.ts)，`imageDescrambler.ts` 只负责下载侧的执行环境。
5. 缓存按内容身份、接口版本和图片主机隔离，避免不同 profile 的结果互相污染。

历史研究还提到过基于时间戳的请求签名、版本 profile 和加密 `data`。这些细节会随上游版本漂移，维护当前匿名 provider 时需要用相应版本的上游证据和本地合成 fixture 验证，不能把旧常量当成稳定协议。

## 已停止的账号方向

历史研究包含登录、站点收藏、互动、通知与购买等账号接口，这些能力不属于当前产品，旧接口清单不作为维护契约。当前收藏和阅读记录保存于本地，preload / IPC 不提供旧账号入口。

## 后续扩展仍需验证的边界

- API host、版本、签名和加密 profile 可能漂移；匿名 GET 成功不代表登录或付费内容读取一定可用。
- 免费、未购买、已购买、过期会话的错误形状和权益语义需要分别验证。
- CDN 是否需要额外凭据，以及重定向、图片 MIME、文件魔数和文件名边界需要单独验证。
- 扩大匿名 provider 覆盖前需补充当前基准与回退对比；本文不授权或规划登录、购买等账号写操作。
