# Anonymous App API Provider Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 用无需登录的结构化移动 API 加速公开搜索、分类、详情和章节 manifest，并在协议漂移时逐端点安全回退。

**Architecture:** 从历史 `codex/online-account-completion` 分支只人工移植已测试的纯协议核心，不整分支合并。新 provider 通过严格 transport、profile、domain resolver 和 endpoint parser 输出现有 `ContentProvider` DTO；Gateway 顺序变为 API → direct HTML → BrowserWindow，并保持持久缓存外层不变。

**Tech Stack:** Node crypto、Electron Session fetch、TypeScript、现有 ContentGateway、tsx 合成 fixture 测试。

## Global Constraints

- 仅公开只读请求；不登录、不发送 Cookie/AVS、不执行收藏、历史、签到、评论或购买。
- 不在文档、renderer、日志或新增测试中复制协议盐；实现时从历史分支受控移植至唯一 profile owner。
- HTTP 只允许 HTTPS、无 userinfo、默认端口、受信 hostname；redirect 设为 manual。
- 单响应硬上限由 endpoint 声明；默认超时 10s；只读网络错误最多重试一次。
- 空字段、未知权益、页数冲突和 schema 漂移必须失败并回退，不猜测成功。
- 每个 endpoint 独立启用、独立统计、独立熔断。

---

## File Structure

- `src/main/content/jmAppApiCrypto.ts`：签名和解密纯函数。
- `src/main/content/jmAppApiProfiles.ts`：唯一 profile owner 与 runtime version。
- `src/main/content/jmAppApiDomainResolver.ts`：候选 origin 校验和 `/setting` 探测。
- `src/main/content/jmAppApiTransport.ts`：限制大小、redirect、timeout、envelope 解密。
- `src/main/content/jmAppApiSchemas.ts`：endpoint parser 和现有 DTO 映射。
- `src/main/content/jmAppApiProvider.ts`：实现 `ContentProvider`。
- `src/main/contentGateway.ts`：三 provider chain 和 endpoint 熔断。
- `src/main/contentApi.ts`：组装匿名 session/provider。
- `src/main/__tests__/fixtures/content-api/synthetic/`：无真实账号数据的 fixture。
- `src/main/__tests__/jmAppApi*.test.ts`：协议、transport、schema、gateway 测试。

### Task 1: 受控移植协议纯函数

**Files:**
- Create: `src/main/content/jmAppApiCrypto.ts`
- Create: `src/main/content/jmAppApiProfiles.ts`
- Create: `src/main/__tests__/jmAppApiCrypto.test.ts`

**Interfaces:**
- Produces: `createApiToken(tsSeconds, secret)`、`createTokenParam(tsSeconds, version, includeVersion)`、`decryptApiPayload(ciphertext, ts, secret)`。
- Produces: `JmApiProfile { id; signSecret; dataSecret; bootstrapVersion; tokenParamStyle }`、`withRuntimeVersion(profile, version)`。

- [ ] **Step 1: 从历史测试提取非敏感金样并写红灯**

使用 `git show codex/online-account-completion:src/main/__tests__/accountCryptoCore.test.ts` 和 `accountProtocolProfiles.test.ts` 审核测试；fixture 仅保留合成时间戳、密文和预期 JSON，不写真实账号或 session。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/jmAppApiCrypto.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 人工移植最小核心**

只移植 `md5Hex`、token、严格 base64、AES-256-ECB decrypt、version 校验和 profile registry；错误统一为 `JmApiProtocolError`，错误码限定 `INVALID_BASE64 | DECRYPT_FAILED | INVALID_VERSION`。

- [ ] **Step 4: 运行绿灯并安全扫描**

Run: `npx tsx src/main/__tests__/jmAppApiCrypto.test.ts`

Run: `rg -n 'password|username|cookie|avs' src/main/content src/main/__tests__/jmAppApiCrypto.test.ts`

Expected: 测试 PASS；安全扫描无用户凭据。

- [ ] **Step 5: 提交**

```powershell
git add src/main/content/jmAppApiCrypto.ts src/main/content/jmAppApiProfiles.ts src/main/__tests__/jmAppApiCrypto.test.ts
git commit -m "feat: 添加匿名内容 API 协议核心"
```

### Task 2: 可信 origin 与受限 transport

**Files:**
- Create: `src/main/content/jmAppApiDomainResolver.ts`
- Create: `src/main/content/jmAppApiTransport.ts`
- Create: `src/main/__tests__/jmAppApiTransport.test.ts`

**Interfaces:**
- Produces: `JmApiRoute { apiOrigin; imageOrigin; profile }`。
- Produces: `JmApiFetchPort.send(request): Promise<{ status; headers; bodyText }>`。
- Produces: `JmAppApiTransport.request(endpoint, query, signal): Promise<unknown>`。

- [ ] **Step 1: 写 transport 红灯测试**

覆盖：userinfo、HTTP、非默认端口、IP literal、子域欺骗、3xx、超大 body、timeout、401/403、坏 envelope、错误 padding、AbortSignal 和 runtime version 更新。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/jmAppApiTransport.test.ts`

Expected: FAIL，resolver/transport 不存在。

- [ ] **Step 3: 实现严格请求描述符**

```ts
export interface JmApiEndpoint {
  key: 'setting' | 'search' | 'category' | 'detail' | 'pages'
  path: string
  method: 'GET'
  timeoutMs: number
  maxResponseBytes: number
}
```

读取 body 时累计字节，超过上限立即 abort；redirect 非 2xx 直接 `UPSTREAM_CHANGED`。每次请求只选择一个已验证 route/profile，不在单请求中无限轮询。

- [ ] **Step 4: 运行绿灯**

Run: `npx tsx src/main/__tests__/jmAppApiTransport.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/main/content/jmAppApiDomainResolver.ts src/main/content/jmAppApiTransport.ts src/main/__tests__/jmAppApiTransport.test.ts
git commit -m "feat: 添加受限匿名 API 传输层"
```

### Task 3: 逐 endpoint schema 映射

**Files:**
- Create: `src/main/content/jmAppApiSchemas.ts`
- Create: `src/main/__tests__/fixtures/content-api/synthetic/setting.json`
- Create: `src/main/__tests__/fixtures/content-api/synthetic/search.json`
- Create: `src/main/__tests__/fixtures/content-api/synthetic/category.json`
- Create: `src/main/__tests__/fixtures/content-api/synthetic/album.json`
- Create: `src/main/__tests__/fixtures/content-api/synthetic/comic-read.json`
- Create: `src/main/__tests__/jmAppApiSchemas.test.ts`

**Interfaces:**
- Produces: `parseSettingPayload`、`parseListPayload`、`parseAlbumPayload`、`parseComicReadPayload`。
- Returns: existing `GatewayListResult`、`MangaDetail`、`ChapterPagesResult`。

- [ ] **Step 1: 写 parser 红灯测试**

每个 parser 同时测试正确 fixture 和字段缺失/类型错误/重复页面索引/非 HTTPS 图片/页数矛盾。章节断言 `pages.map(p => p.index)` 严格等于 `0..n-1`，不得排序修复上游乱序。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/jmAppApiSchemas.test.ts`

Expected: FAIL，parser 不存在。

- [ ] **Step 3: 实现显式字段 parser**

不用 `as MangaDetail` 绕过校验。所有 ID 转成非空数字字符串；未知可选文本映射为 `''` 或 `undefined` 必须与现有 DTO 约定一致；`price/purchased` 不进入公共 DTO。

- [ ] **Step 4: 运行绿灯和现有内容校验**

Run: `npx tsx src/main/__tests__/jmAppApiSchemas.test.ts`

Run: `npx tsx src/main/__tests__/contentValidation.test.ts`

Run: `npx tsx src/main/__tests__/imageCorrectnessContract.test.ts`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/main/content/jmAppApiSchemas.ts src/main/__tests__/fixtures/content-api/synthetic src/main/__tests__/jmAppApiSchemas.test.ts
git commit -m "feat: 映射匿名内容 API 响应"
```

### Task 4: Provider 与三级回退

**Files:**
- Create: `src/main/content/jmAppApiProvider.ts`
- Modify: `src/main/contentGateway.ts`
- Modify: `src/main/contentApi.ts`
- Modify: `src/main/__tests__/contentGateway.test.ts`
- Create: `src/main/__tests__/jmAppApiProvider.test.ts`

**Interfaces:**
- Changes: `ContentProviderName = 'api' | 'direct' | 'browser'`。
- Changes: `GatewayOptions { api?: ContentProvider; direct; browser; ... }`。
- Produces: endpoint health window `{ attempts: 100; fallbackRate; disabledUntil }`。

- [ ] **Step 1: 写三级回退红灯测试**

断言 API 成功不调用 direct/browser；API schema 失败调用 direct；direct 失败调用 browser；缓存命中不调用任何 provider；API 最近 100 次 fallback >10% 时该 endpoint 暂停。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/contentGateway.test.ts`

Expected: FAIL，provider 类型不接受 api。

- [ ] **Step 3: 实现 endpoint 级 provider chain**

GatewayResult 增加完整尝试链但 UI 只消费最终 provider/fallback；失败 reason 使用受限枚举，不记录 URL/响应正文。熔断按 endpoint 分开，不允许 detail 漂移禁用 search。

- [ ] **Step 4: 运行绿灯**

Run: `npx tsx src/main/__tests__/jmAppApiProvider.test.ts`

Run: `npx tsx src/main/__tests__/contentGateway.test.ts`

Run: `npx tsx src/main/__tests__/contentApiContract.test.ts`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add src/main/content/jmAppApiProvider.ts src/main/contentGateway.ts src/main/contentApi.ts src/main/__tests__/contentGateway.test.ts src/main/__tests__/jmAppApiProvider.test.ts
git commit -m "feat: 接入匿名 API 三级内容回退"
```

### Task 5: 真实只读逐端点发布门禁

**Files:**
- Create: `docs/performance/2026-09-03-anonymous-api-validation.md`

- [ ] **Step 1: 先验证 `/setting`**

同 origin/profile 连续 10 次，记录状态、延迟和 runtime version；不得记录盐、完整 URL 或解密正文。

- [ ] **Step 2: 依次验证 search/category、album、comic_read**

每类至少 10 次；同一时刻与 BrowserWindow 结果对照 ID、顺序、总页数、章节、页面数组和 scrambleId。任一 endpoint 不一致只禁用该 endpoint。

- [ ] **Step 3: 运行 100 次稳定性样本**

发布阈值：成功率 ≥95%；p95 ≤1.5s 或比 BrowserWindow 快 ≥40%；fallback 附加开销 p95 ≤250ms。

- [ ] **Step 4: 全量门禁**

Run: `Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object { npx tsx $_.FullName }`

Run: `npm run build`

Expected: 全部通过。

- [ ] **Step 5: 提交验证报告**

```powershell
git add docs/performance/2026-09-03-anonymous-api-validation.md
git commit -m "docs: 记录匿名 API 逐端点验证"
```

## Plan Acceptance

- 匿名 API 不依赖账号或 warmup。
- 每个 endpoint 都有严格 schema、独立开关、健康窗口和回退。
- API 与可信 BrowserWindow 的页面顺序和 scrambleId 完全一致。
- 没有真实账号数据、敏感盐扩散、任意 origin 或完整内容 URL 日志。
