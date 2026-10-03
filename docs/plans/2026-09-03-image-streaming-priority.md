# Image Streaming and Priority Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 让网络图片在缓存写完前开始显示，并让当前视口请求优先于已离屏预取，同时具备取消、超时和有限重试。

**Architecture:** 保留 `jmimg://` 和现有磁盘缓存键；把 FIFO scheduler 升级为带优先级和 AbortSignal 的 single-flight 队列。协议层使用 Electron fetch Response body 分流：一支立即返回 renderer，另一支受控写临时文件并原子提交；若当前 Electron 版本的 `tee()` 压测失败，则使用临时文件回压流适配器。

**Tech Stack:** Electron `protocol`/`session.fetch`/Web Streams、Node fs/promises、TypeScript、tsx。

## Global Constraints

- 不改变 `jmimg://` URL 格式、图片顺序、缓存键和反打乱算法。
- 只接受 HTTPS、受信 host、2xx、合法 Content-Type、合法图片魔数。
- 401/403、HTML challenge、部分文件和取消响应不得进入正式缓存。
- 全局并发初始为 6；同 host 上限为 4；重试最多 2 次。
- timeout 默认：连接/首字节 10s，总请求 30s；429/5xx 才可退避重试。
- renderer 不接收真实远端 URL 权威或 Cookie。

---

## File Structure

- `src/main/imageRequestPolicy.ts`：优先级、超时、重试和 host 规则纯函数。
- `src/main/imageRequestScheduler.ts`：优先队列、single-flight、取消和计数。
- `src/main/imageProtocol.ts`：缓存命中、网络 Response 校验和流式返回。
- `src/main/imageLoader.ts`：流到临时文件、魔数校验、原子 rename。
- `src/preload/index.ts`：只暴露 requestId/priority/cancel 意图。
- `src/main/__tests__/imageStreamingPolicy.test.ts`：策略和队列测试。
- `src/main/__tests__/imageStreamingContract.test.ts`：协议流、缓存和安全契约。

### Task 1: 优先级与重试策略

**Files:**
- Create: `src/main/imageRequestPolicy.ts`
- Create: `src/main/__tests__/imageStreamingPolicy.test.ts`

**Interfaces:**
- Produces: `ImagePriority = 'critical' | 'near' | 'visible-grid' | 'background'`。
- Produces: `priorityRank(priority): number`、`shouldRetryImage(status, attempt): boolean`、`ImageRequestLimits`。

- [ ] **Step 1: 写失败测试**

```ts
assert.deepEqual(
  (['background', 'critical', 'visible-grid', 'near'] as ImagePriority[]).sort((a, b) => priorityRank(a) - priorityRank(b)),
  ['critical', 'near', 'visible-grid', 'background']
)
assert.equal(shouldRetryImage(429, 0), true)
assert.equal(shouldRetryImage(503, 1), true)
assert.equal(shouldRetryImage(403, 0), false)
assert.equal(shouldRetryImage(500, 2), false)
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/imageStreamingPolicy.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 最小实现并跑绿灯**

```ts
export const IMAGE_REQUEST_LIMITS = Object.freeze({ global: 6, perHost: 4, firstByteMs: 10_000, totalMs: 30_000, retries: 2 })
const RANK: Record<ImagePriority, number> = { critical: 0, near: 1, 'visible-grid': 2, background: 3 }
export const priorityRank = (value: ImagePriority): number => RANK[value]
export const shouldRetryImage = (status: number, attempt: number): boolean => attempt < 2 && (status === 429 || status >= 500)
```

Run: `npx tsx src/main/__tests__/imageStreamingPolicy.test.ts`

Expected: PASS。

- [ ] **Step 4: 提交**

```powershell
git add src/main/imageRequestPolicy.ts src/main/__tests__/imageStreamingPolicy.test.ts
git commit -m "feat: 定义图片请求优先级策略"
```

### Task 2: 可取消 priority scheduler

**Files:**
- Modify: `src/main/imageRequestScheduler.ts`
- Modify: `src/main/__tests__/imageRequestScheduler.test.ts`

**Interfaces:**
- Replaces: `run<T>(key, task)`。
- Produces: `run<T>(request: { key; host; priority; signal? }, task: (signal) => Promise<T>): Promise<T>`、`cancel(key)`、`counts()`。

- [ ] **Step 1: 添加红灯测试**

测试必须断言：critical 越过 pending background；相同 key 返回同一 Promise；pending abort 不执行 task；in-flight abort 收到 signal；每 host 不超过 4；完成后计数归零。

```ts
const scheduler = createImageRequestScheduler({ maxConcurrent: 1, maxPerHost: 1 })
const order: string[] = []
const blocker = scheduler.run({ key: 'a', host: 'h', priority: 'background' }, async () => gate)
void scheduler.run({ key: 'b', host: 'h', priority: 'background' }, async () => { order.push('b') })
void scheduler.run({ key: 'c', host: 'h', priority: 'critical' }, async () => { order.push('c') })
release()
await blocker
assert.deepEqual(order, ['c', 'b'])
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/imageRequestScheduler.test.ts`

Expected: FAIL，旧接口不接受 request descriptor。

- [ ] **Step 3: 实现稳定优先队列**

QueueEntry 增加 `sequence` 保证同优先级 FIFO；single-flight key 不含 priority；重复订阅者取消只移除自己的订阅，最后一个订阅者取消才 abort 底层请求。

- [ ] **Step 4: 运行绿灯**

Run: `npx tsx src/main/__tests__/imageRequestScheduler.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/main/imageRequestScheduler.ts src/main/__tests__/imageRequestScheduler.test.ts
git commit -m "feat: 支持图片优先级与取消调度"
```

### Task 3: 流式协议与异步缓存

**Files:**
- Modify: `src/main/imageProtocol.ts`
- Modify: `src/main/imageLoader.ts`
- Create: `src/main/__tests__/imageStreamingContract.test.ts`

**Interfaces:**
- Produces: `storeImageStream(cacheKey, stream, metadata, signal): Promise<'stored' | 'cancelled'>`、可注入端口的 `createStreamingImageResponse(fetchPort, cachePort)` 测试 seam。
- Consumes: scheduler、`session.defaultSession.fetch`、`ReadableStream.tee()`。

- [ ] **Step 1: 写失败契约与行为测试**

用合成 Web Stream 分两段发送；断言协议 Response 在第二段和缓存 Promise 完成前可读第一段。再覆盖 HTML body、错误魔数、中途 abort 和 rename 失败。

```ts
const { response, cacheDone } = await createStreamingImageResponse(fakeFetch, cachePort)
const reader = response.body!.getReader()
assert.deepEqual((await reader.read()).value, firstChunk)
assert.equal(cachePort.committed, false)
releaseSecondChunk()
await cacheDone
assert.equal(cachePort.committed, true)
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/imageStreamingContract.test.ts`

Expected: FAIL，当前协议先拼完整 Buffer。

- [ ] **Step 3: 实现 Response 分流**

```ts
const upstream = await session.defaultSession.fetch(realUrl, { headers, signal })
validateImageResponse(upstream)
const [visibleBody, cacheBody] = upstream.body!.tee()
const cacheDone = storeImageStream(cacheKey, cacheBody, metadata, signal).catch(recordCacheFailure)
return new Response(visibleBody, { status: 200, headers: filteredImageHeaders(upstream.headers) })
```

缓存支路写 `${target}.tmp`，完成后检查 Content-Length 上限和魔数，再 rename；失败 unlink 临时文件。不得等待 `cacheDone` 才返回。

- [ ] **Step 4: 运行图片契约**

Run: `npx tsx src/main/__tests__/imageStreamingContract.test.ts`

Run: `npx tsx src/main/__tests__/imageCacheIoContract.test.ts`

Run: `npx tsx src/main/__tests__/imageCorrectnessContract.test.ts`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/main/imageProtocol.ts src/main/imageLoader.ts src/main/__tests__/imageStreamingContract.test.ts
git commit -m "perf: 流式返回并异步缓存在线图片"
```

### Task 4: Renderer 优先级和取消意图

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/pages/ReaderPage.tsx`
- Modify: `src/renderer/src/components/MangaCard.tsx`
- Modify: `src/main/imageProtocol.ts`
- Modify: `src/main/__tests__/imageStreamingContract.test.ts`

**Interfaces:**
- Produces: `imageSetPriority(requestId, priority)`、`imageCancel(requestId)`；requestId 为本地随机标识，不含 URL。

- [ ] **Step 1: 扩充红灯契约**

断言 reader 当前页为 critical、前后两页为 near、虚拟窗口外 cleanup 调用 cancel；卡片只把可见封面标成 visible-grid。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/imageStreamingContract.test.ts`

Expected: FAIL，缺少优先级桥接。

- [ ] **Step 3: 实现意图桥接**

IPC 只接受枚举 priority 和长度受限 requestId；main 内部维护 requestId 到可信请求的短期映射。页面卸载和虚拟项离开时取消；不得让 renderer 提交真实 URL。

- [ ] **Step 4: 全量验收并报告**

在同一网络采集缓存 miss 首字节/首张可见、快速滚动 50 页、离开 reader、429/503、403 challenge。目标：首字节到首张可见降低 ≥30%，critical 不被旧 background 阻塞。

Run: `Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object { npx tsx $_.FullName }`

Run: `npm run build`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```powershell
git add src/preload/index.ts src/renderer/src/pages/ReaderPage.tsx src/renderer/src/components/MangaCard.tsx src/main/imageProtocol.ts src/main/__tests__/imageStreamingContract.test.ts
git commit -m "perf: 接入视口图片优先级与取消"
```

## Plan Acceptance

- 缓存 miss 的 Response 在缓存提交前开始向 renderer 供字节。
- single-flight、四级优先级、per-host 限流、取消、超时和有限重试均有测试。
- 取消/错误/HTML/非法魔数不污染缓存。
- 图片正确性金样 100% 通过，快速滚动没有迟到图片占槽。
