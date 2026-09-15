# 性能与加载链路实施复核（2026-09-15）

## 范围与状态

本次从 `feat/main-io-coordinator` 的已有实现继续，工作分支为 `fix/performance-runtime-completion`。没有重写或覆盖既有成果，也没有合并 main。参考 `docs/design/2026-09-03-performance-experience-api-master-design.md`、总路线图及各阶段实施计划。

已有页面 selector、壳层拆分、页面懒加载、有界保活、卡片 CSS hover、收藏集合、阅读器输入合并、缓存维护合并及数据库落盘合并。本次重点修复它们背后的真实运行链路，不把旧报告中的性能数字当作当前验证结果。

| 方向 | 本次交付 |
| --- | --- |
| 云端内容 | 实际可用的匿名 API 域名发现、版本/CDN 引导、真实 DTO 解析、正确分页与参数 |
| 启动响应 | API 引导后台启动；本地下载恢复不再等待浏览器验证 |
| 下载清单 | 与阅读器共用内容 Gateway，保留 API→直接网页→浏览器回退 |
| 图片流 | 响应体结束前保留并发名额；重复消费者独立流；贯穿响应体的超时；有界缓存与格式签名检查 |
| 卡片收藏 | 初始化只读一次；独立条目的失败回滚不覆盖其他成功操作；同条目并发操作保护 |
| 页面加载 | 重试创建新的 lazy identity，而不是仅清除错误提示 |

本次不声称九阶段的全部量化验收完成。账号运行时、Worker 迁移、完整长列表虚拟化、全量主进程异步化及长时性能实验仍按原设计的条件独立评估。

## 修复内容与位置

### 匿名 API

- `src/main/content/jmAppApiRuntime.ts`：受信域名依次引导；发现 single-flight；成功路由缓存 10 分钟；失败冷却 60 秒；每个引导候选超时 3 秒。引导失败不影响应用壳创建。
- `src/main/content/jmAppApiDomainResolver.ts`：候选固定为受信公开 API 主机，不接受 renderer 输入任意源。
- `src/main/content/jmAppApiFetchPort.ts`：Electron Chromium 网络栈，`credentials: omit`，不跟随重定向；响应体逐块检查字节上限，并响应取消。
- `src/main/content/jmAppApiTransport.ts`：端点 timeout 实际驱动 AbortController；最终检查 UTF-8 字节数，而非 JavaScript 字符数。
- `src/main/content/jmAppApiProvider.ts`：分类使用 `/categories/filter` 的 c/o/order/page；搜索保留 main_tag/t；章节使用 `/comic_read`。不支持的组合明确拒绝，交给 Gateway 回退，不能静默返回另一种列表。首页推荐不能假装等价于最新分类，且拒绝发生在发现前。
- `src/main/content/jmAppApiSchemas.ts`：公开 API 列表按每页 80 项；空封面使用确定的 album 路径；作者数组与完整标签保留；图片页校验总页数、请求章节 ID 与 1-based 原始页码，不暗中排序。
- `src/shared/imageUrlCore.ts`：HTTPS、无 userinfo/非默认端口、明确受信 CDN 主机；拒绝 HTTP 升级修复及域名后缀欺骗。
- `src/main/contentApi.ts`：新缓存 namespace `public-content-api-v2`，避免把旧参数语义下的缓存继续用于新链路。没有删除个人数据库、下载、收藏或账号文件。

域名和图片主机来自当前上游公开实现及匿名 `/setting` 实测。主机允许集合仍是显式维护项，不能保证第三方服务未来永不变更。协议盐仍仅归属于既有 profile 文件；未新增个人密钥或账号请求。

### 启动及下载

`src/main/index.ts` 移除无条件浏览器 warmup 和以其完成为前提的下载初始化。浏览器验证由实际 browser fallback 按需触发。`src/main/downloadManager.ts` 的详情与章节清单统一调用 Gateway，不再直接调用浏览器 extractor。

这一变化仅解除清单发现的验证耦合，不代表离线下载的解码、像素反打乱及文件写入全部已经异步化。反打乱算法和页序未改。

### 图片生命周期

`src/main/imageStreamFetch.ts` 分离为可注入网络端口的实现；`src/main/imageProtocol.ts` 接入；`src/main/imageRequestScheduler.ts` 通过 done promise 持有名额。

- 全局 6、单主机 4；名额覆盖响应体及缓存完成，不在收到 headers 时提前释放。
- 单图最大 32 MiB；首字节 10 秒、总过程 30 秒。总超时在 headers 后继续有效。
- 不跟随重定向，匿名图片请求不携带账号 Cookie；只接受成功的 image 响应，完整传输并通过签名检查后才写缓存。
- 同 URL 请求共享网络任务，但每个消费者获得独立可读分支；后到的消费者不会悬挂在已兑现的 headers promise 后。
- 所有排队订阅者取消后立即清除条目。
- 缓存写失败不使已完整下载的有效图片失效。
- 完成指标记录真实字节数和响应体结束时刻，不再在 headers 阶段记录 0-byte 成功。

当前缓存仍累积单图字节后原子写入，**不是**零缓冲的磁盘直写方案。tee 的慢消费者可积压数据，32 MiB 单图上限限制资源增长，但并不等于进程总内存上限；超过上限的超长图片会失败。进一步优化必须测量峰值内存，并采用临时文件/订阅背压方案，不能把当前实现称为恒定内存流。下游仅取消分支、未发出协议 request abort 时，底层任务最迟由总超时释放。

### 收藏和模块重试

`src/renderer/src/stores/favoritesStore.ts` 保留成功初始化，后续卡片挂载不重复读取列表；变更失败只恢复本条目，其他条目成功结果不受影响；等待初始化后再修改，避免初始化覆盖乐观更新。

`src/renderer/src/components/retryableLazyPage.ts` 和 `PageLoadBoundary.tsx`、`PageHost.tsx` 保留按页拆包，同时让“重新加载”真正创建新的 React lazy 尝试。

## 本回合实际验证

### 回归与构建

先建立失败回归，再实现对应修复。新增行为测试覆盖 API 超时/字节边界、真实字段形状、stream 生命周期、重复消费者、取消清理、收藏竞态和模块重试；原有部分测试是源码契约检查，不能替代运行验证。

```text
全部 src/scripts 下 *.test.ts 文件由本地 tsx 逐一执行
TOTAL=49 FAILED=0

npm run build
main:     208.56 kB
preload:    8.33 kB
renderer: 2185 modules transformed
index:   1004.69 kB
详情、阅读器、设置、下载等页面独立 chunk
main、preload、renderer 均构建成功
```

构建仍有原有 networkProbe/httpClient 静态与动态导入混用警告。没有通过强制 GPU 参数或更换技术栈改善指标。

`tsc --noEmit` **未通过**。剩余错误位于本次未修改的 `winuiVisualContract.test.ts`、`ioMetrics.ts`、`ipc.ts`、`localImageProtocol.ts`、`sessionWarmup.ts`、`FavoritesPage.tsx`、`MangaDetailPage.tsx`、`winuiTheme.ts`；本次涉及文件的类型错误已修正。不能以 Vite 构建成功替代全项目类型检查。

### 匿名服务端实测

只读公开 API，无账号、无服务端写操作。最终一次 Node 端口验证输出：

```json
{"check":"anonymous-bootstrap","ok":true,"elapsedMs":1083}
{"check":"search-schema","count":45,"totalPages":1}
{"check":"detail-schema","chapters":61,"tags":6}
{"check":"pages-schema","count":71,"contiguous":true,"scramblePresent":true}
{"check":"image-stream","bytes":37370,"ok":true}
```

先前试验曾因 1.5 秒引导预算失败；随后改为 3 秒并成功。另一次实时探测发现空 image 字段，建立失败测试后修复。以上是真实网络单次结果，不是 p95、成功率或性能提升百分比。

### Electron 集成

临时 helper 启动最终生产产物，隐藏窗口，userData、便携数据和下载路径全部隔离到本任务 work 子目录。使用真实 preload IPC 和 Chromium 图片元素加载，不使用原有个人数据。

首次测试用 renderer fetch 图片，被既有 CSP 的 default-src 拒绝；这是测试路径错误。未放宽 CSP，改用应用实际采用的 Image 元素后成功：

```json
{"search":45,"chapters":61,"pages":71,"images":[{"width":720,"height":3008},{"width":720,"height":3008}],"equalImages":true,"shellPresent":true}
```

图片流单次日志记录首字节 713.14 ms、完整结束 832 ms、37370 字节。此数字不是跨版本 A/B 提升结论。双流字节一致由行为测试验证；Electron 集成校验两个图片元素均成功解码且尺寸一致。

## 未完成的量化与独立工作

- 没有完成 100 次冷/热加载、长时滚动、低功耗及网络故障矩阵，因此不宣称达到“40% 提升”或特定 p95。
- 没有重跑 GPU 探针，不能把其他 agent 的 RTX 或既有 AMD 结果作为本次设备实测。
- 卡片网格/章节列表虚拟化、OffscreenCanvas Worker、数据库 worker/utility process 及 Mica 自动降级仍遵循既有测量门槛，未盲目迁移。
- renderer 当前帧采样主要记录慢帧，不能拿其分布冒充全帧间隔 p95。
- 主进程 legacy 图片下载/文件写入仍有同步路径，不能报告“全量 I/O 已异步化”。
- 浏览器验证的已知页面证明与 reset 竞态仍须专项加固；本次真实成功路径为匿名 API，不能由此证明所有网页回退异常路径均可靠。
- 在线账号登录、账号 Cookie 适配、云收藏写入、购买/付费均未执行，按主设计另行授权并隔离。匿名内容优化无需登录账号。

后续可以在这一已验证实现上做专项测量与修复，不需要再次重复整套设计。

## 参考

- [Electron Session API](https://www.electronjs.org/docs/latest/api/session)：Chromium 网络栈与 session.fetch。
- [Electron Protocol API](https://www.electronjs.org/docs/latest/api/protocol)：自定义协议的 Response 流返回。
- [JMComic-Crawler-Python 客户端公开实现](https://github.com/hect0x7/JMComic-Crawler-Python/blob/master/src/jmcomic/jm_client_impl.py)：公开 API 的端点与过滤参数。
- [上游配置](https://github.com/hect0x7/JMComic-Crawler-Python/blob/master/src/jmcomic/jm_config.py)：域名与公开 API 图片主机配置，仍需当前服务端验证。
