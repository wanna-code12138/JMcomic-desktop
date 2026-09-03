# 公开内容 API 化性能笔记

日期：2026-09-03
状态：仅作未来研究备忘，不是当前实现。在线账号功能已取消；当前项目仍使用现有匿名内容链路。

## 为什么值得研究

当前 `scraperWindow` 会用隐藏 `BrowserWindow` 加载完整网页，再通过 `executeJavaScript` 提取 DOM。页面通常需要等待数秒，还会受到页面脚本、Cloudflare 和单窗口互斥的影响。

未来可以在主进程增加 JSON API provider，直接请求结构化元数据和章节 manifest，并接入现有 `contentGateway`。浏览器提取保留为回退路径，这样 API 响应稳定时可以减少页面导航和 DOM 提取开销。

## 当时观察到的公开内容 API 形态

| API | 用途 | 字段或备注 |
| --- | --- | --- |
| `GET /setting` | 读取版本和图片主机等运行配置 | 只取需要的版本/图片主机字段；远端结果不能自动成为敏感会话信任 |
| `GET /album?id={albumId}` | 读取本子元数据和权益状态 | 可能包含 `id`、`name`、`series`、`price`、`purchased`、`is_favorite`、`liked`；空值不能直接猜成 `false` |
| `GET /comic_read?id={chapterId}` | 首选章节 manifest | 可能包含 `id`、`name`、`series_id`、`images[]`、`scramble_id`、`total_page`；图片数组通常是文件名而不是完整 URL |
| `GET /chapter?id={chapterId}` | 兼容旧章节 manifest | 可能包含 `images[]`、`series`、`tags`；通常没有 `scramble_id`，不能无条件替代首选接口 |
| `GET /chapter_view_template?...` | 旧版图片模板或反打乱信息 | 返回脚本/HTML，不是普通 JSON；需要独立解析 |

## API 化的大致工作方式

1. 主进程统一请求、解析响应 envelope，并按版本或站点 profile 选择接口。
2. 用严格 DTO 校验漫画 ID、章节 ID、图片文件名、页数、图片主机和权益字段；遇到未知或矛盾数据时返回 `unknown`，不要猜测成免费或已购买。
3. 由 `contentGateway` 优先选择 API provider；API 失败、超时或响应结构不匹配时回退到 `scraperWindow`。
4. 图片地址由主进程依据受信主机和安全文件名构造；复用现有 `imageDescrambler.ts`，不要再复制一份算法。
5. 缓存按内容身份、接口版本和图片主机隔离，避免不同 profile 的结果互相污染。

历史研究还提到过基于时间戳的请求签名、版本 profile 和加密 `data`。这些细节会随上游版本漂移，重新实现时必须用最新上游证据和本地合成 fixture 验证，不能把旧常量当成稳定协议。

## 曾研究过但当前不保留的账号接口

以下接口只用于说明旧方向的边界，不属于当前产品，也不应重新暴露到 preload/IPC：

`POST /login`、`POST /logout`、`GET /useredit/{uid}`、`GET|POST /favorite`、`GET|POST /watch_list`、`GET /forum`、`POST /like`、`GET /notifications`、`GET /album_sertracking`、`POST /album_tracking`、`GET|POST /daily*`、`GET /tasks`、`POST /coin_buy_comics`。

## 重新实现前必须确认

- API host、版本、签名和加密 profile 可能漂移；匿名 GET 成功不代表登录或付费内容读取一定可用。
- 免费、未购买、已购买、过期会话的错误形状和权益语义需要分别验证。
- CDN 是否需要额外凭据，以及重定向、图片 MIME、文件魔数和文件名边界需要单独验证。
- 推荐先做匿名只读 provider 和基准对比，再考虑替代浏览器路径；不要把登录、购买或写操作放回当前产品。
