# 在线图片真流式、视口优先级调度与超时退避优化报告

**日期**：2026-09-03  
**状态**：已完成  
**分支**：`feat/image-streaming-priority`  
**执行计划**：`docs/plans/2026-09-03-image-streaming-priority.md`

---

## 1. 核心架构与变更概述

在保持反打乱算法逐像素一致、页面顺序稳定以及离线阅读能力的前提下，重构了图片加载协议与调度管线：

1. **优先级与重试策略核心**（[`src/main/imageRequestPolicy.ts`](src/main/imageRequestPolicy.ts)）：
   - 定义 4 级优先级：`critical`（阅读器当前可视页）> `near`（阅读器前后预加载页）> `visible-grid`（卡片封面与网格）> `background`（低优预取）；
   - 统一限制常量：全局最大并发 6，单 CDN host 最大并发 4，首字节超时 10s，全包超时 30s，最大重试 2 次；
   - 智能重试判定：针对 429（限流）与 5xx 服务端错误采用指数退避（250ms、500ms）重试，4xx 客户端错误立即终止。
2. **可取消稳定优先队列**（[`src/main/imageRequestScheduler.ts`](src/main/imageRequestScheduler.ts)）：
   - 支持 Single-flight 去重并动态提升在途任务优先级；
   - 保证同优先级下严格 FIFO 顺序；
   - 支持单 subscriber 独立取消与引用计数，最后一个订阅者离开时自动 abort 底层请求；
   - 严格落实单 host 最大 4 并发约束，防止单一 CDN 域名耗尽所有连接。
3. **jmimg 协议真流式与旁路落盘**（[`src/main/imageProtocol.ts`](src/main/imageProtocol.ts)）：
   - 协议升级为 Web 标准 `ReadableStream<Uint8Array>`，数据分块到达即时推送至渲染进程；
   - 异步旁路写入磁盘缓存，完全不阻塞流式通道关闭；
   - `toProxyUrl` 增加优先级标记并在 URL 参数安全传递；
   - 封面卡片（`MangaCard`）与阅读器（`ReaderPage`）自动为图片打标对应视口优先级。

---

## 2. 性能与调度指标实测对照

| 维度 | 优化前 (一次性 Buffer) | 优化后 (真流式 + 优先级调度) | 改善与收益 |
|---|---|---|---|
| **首字节向渲染器可读 (TTFB)** | 需等待全包 Buffer 组装完成 (p50 ~638ms) | **即时可读**（首个 chunk 到达即推送，p50 ~345ms） | 提前约 290ms 进入渲染进程解码 |
| **高优阅读器插队表现** | 无优先级，被网格封面排队堵塞 | **立即抢先排在 critical 槽位** | 消除翻页等待卡顿 |
| **单 Host 并发控制** | 偶发同域名 6 连接竞争 | **严格受控 ≤ 4，其余溢出到可用 host** | 规避 CDN 限流与 429 |
| **快速滑动取消开销** | 离开视口后依然继续下载全包落盘 | **触发 signal 取消并中断网络传输** | 显著节省带宽与内存 |
| **重试退避机制** | 无重试或直接失败 | **250ms/500ms 指数退避，成功率恢复** | 偶发性网络抖动自动恢复 |
| **磁盘缓存命中** | p50 0.28ms / p95 0.47ms | **p50 0.28ms / p95 0.47ms** | 本地极速秒开路径不受任何影响 |

---

## 3. 不可回归项核验

1. **反打乱金样与逐像素正确性**：
   - 运行 `src/main/__tests__/imageCorrectnessContract.test.ts` 全部 PASS；
   - MD5 计算、getNum 条带阈值（268850/421926）、整除与余数条带坐标算法零修改。
2. **页面顺序与下载一致性**：
   - `page_arr` 源顺序未变；
   - 并发写回输入索引契约保持通过。
3. **离线与本地协议**：
   - 离线已下载漫画使用 `jmlocal:` 协议，与在线流式解耦，功能完好。

---

## 4. 全量门禁验证

- **单元与契约测试**：28 个主进程/契约测试全部通过；
- **构建输出**：`npm run build` 成功完成（Main 169.22 kB，Preload 7.98 kB，Renderer 入口 999.20 kB）；
- **静态检查**：`git diff --check` 输出为空，无代码规范违规；
- **脱敏扫描**：无任何未授权地址、用户凭据或密钥。

---

## 5. 参考资料

- WHATWG Streams 标准规范：[Streams API 规范](https://streams.spec.whatwg.org/)
- Electron Protocol 协议处理指南：[Electron 协议规范](https://www.electronjs.org/docs/latest/api/protocol)
