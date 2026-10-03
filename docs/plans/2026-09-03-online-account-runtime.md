# Online Account Runtime Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 在匿名内容链路稳定后，以独立 Session、加密保存和 generation lease 恢复可选在线账号的登录与只读能力，默认不启用任何远端写操作。

**Architecture:** 以 `codex/online-account-completion` 作为审计素材而非直接合并来源；先重建共享契约和纯协议核心，再建立独立 Electron Session、safeStorage vault、单一账号状态机和每请求 generation 双检。第一里程碑只交付登录/恢复/退出、账号概览、在线收藏/历史只读；所有写能力保持 unavailable。

**Tech Stack:** Electron Session/safeStorage、Node crypto、TypeScript、Zustand、React/Fluent UI、tsx 合成 fixture 测试。

## Global Constraints

- 本计划必须在用户再次明确批准后才能执行；当前文档不构成账号访问授权。
- 自动测试零真实账号请求；真实验证只用用户主动提供的测试账号和明确批准的只读端点。
- renderer 永远不能读取密码、Cookie、AVS、profile salts 或原始 session。
- 账号 Session 与匿名抓取 defaultSession 隔离；退出必须清内存、Session 和 vault。
- generation 在发送前和提交状态前双重检查；旧请求只能得到 `STALE_SESSION`。
- 第一里程碑所有远端写 capability 为 `unavailable`；购买、签到、评论、点赞、收藏写、历史删均不接线。
- `price/purchased` 空值映射为 unknown，任何权益不确定都 fail-closed。

---

## File Structure

- `src/shared/accountContracts.ts`：最小 phase/result/status/read DTO 和 IPC 常量。
- `src/main/account/cryptoCore.ts`、`protocolProfiles.ts`：从历史分支逐文件审计移植。
- `src/main/account/sessionVaultCore.ts`、`electronSessionVault.ts`：safeStorage 抽象。
- `src/main/account/accountSessionLease.ts`：generation 双检。
- `src/main/account/accountTransportCore.ts`、`electronAccountFetch.ts`：受限传输。
- `src/main/account/accountRuntime.ts`、`accountService.ts`：单一生命周期状态机。
- `src/main/account/libraryCore.ts`、`libraryService.ts`：收藏/历史只读 parser/service。
- `src/main/account/accountIpc.ts`：最小 IPC。
- `src/renderer/src/stores/accountStore.ts`：renderer 状态镜像。
- `src/renderer/src/components/account/`：登录、概览、在线收藏/历史只读 UI。
- `src/main/__tests__/fixtures/account/synthetic/`：仅合成 fixture。

### Task 0: 批准与历史分支审计门

- [ ] **Step 1:** 用户明确批准“登录、恢复、退出和只读账号数据”；未批准即停止。
- [ ] **Step 2:** 用 `git diff main...codex/online-account-completion -- src/main/account src/shared/accountContracts.ts src/main/__tests__` 列出历史实现，不 checkout、不 merge、不 cherry-pick 整体提交。
- [ ] **Step 3:** 建立保留/重写/删除矩阵；经济写入、评论写入、签到和购买模块全部标记删除/不移植。
- [ ] **Step 4:** 阅读历史 `docs/research/2026-08-29-online-account-design-issues.md` 和 `docs/plans/2026-09-03-online-account-progress.md`，把 401 竞态、AVS 半过期和权益未知列为阻塞验收。

### Task 1: 最小共享契约与 capability fail-closed

**Files:**
- Create: `src/shared/accountContracts.ts`
- Create: `src/main/__tests__/accountCapabilityGating.test.ts`

**Interfaces:**
- Produces: `AccountPhase`、`AccountResult<T>`、`AccountStatusDto`、`GenerationInput`。
- Capability 仅包含 `identity.login`、`identity.profile.read`、`library.favorites.read`、`history.read`。

- [ ] **Step 1: 写红灯测试**

```ts
const anonymous = createInitialAccountStatus()
assert.equal(anonymous.phase, 'anonymous')
assert.equal(anonymous.capabilities['library.favorites.read'], 'unavailable')
assert.equal(canInvokeWriteCapability(anonymous, 'library.favorites.write'), false)
```

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/accountCapabilityGating.test.ts`

Expected: FAIL，契约不存在。

- [ ] **Step 3: 实现最小契约并跑绿灯**

任何未声明 capability 默认 unavailable；不得从历史分支移植 purchase/economy/write DTO。

- [ ] **Step 4: 提交**

```powershell
git add src/shared/accountContracts.ts src/main/__tests__/accountCapabilityGating.test.ts
git commit -m "feat: 定义只读在线账号能力边界"
```

### Task 2: 协议核心与受限 transport

**Files:**
- Create: `src/main/account/cryptoCore.ts`
- Create: `src/main/account/protocolProfiles.ts`
- Create: `src/main/account/accountTransportCore.ts`
- Create: `src/main/account/electronAccountFetch.ts`
- Create: `src/main/__tests__/accountCryptoCore.test.ts`
- Create: `src/main/__tests__/accountTransport.test.ts`

- [ ] **Step 1:** 从历史分支逐函数移植测试，先确认缺模块红灯。
- [ ] **Step 2:** 移植 token/AES/profile；profile salts 只能存在 `protocolProfiles.ts`。
- [ ] **Step 3:** transport 只注册已批准的 read endpoint；manual redirect、10s timeout、响应大小上限、AbortSignal、401/403→AUTH_REQUIRED。
- [ ] **Step 4:** 运行 `npx tsx src/main/__tests__/accountCryptoCore.test.ts` 和 `npx tsx src/main/__tests__/accountTransport.test.ts`，预期 PASS。
- [ ] **Step 5:** 安全扫描 `rg -n 'password|Cookie|AVS' src/main/account`，除受控输入/内部类型外不得记录或回传。
- [ ] **Step 6:** 提交 `feat: 添加隔离账号协议传输层`。

### Task 3: safeStorage vault 与独立 Session

**Files:**
- Create: `src/main/account/sessionVaultCore.ts`
- Create: `src/main/account/electronSessionVault.ts`
- Create: `src/main/account/accountSessionLease.ts`
- Create: `src/main/__tests__/accountSessionVault.test.ts`
- Create: `src/main/__tests__/accountSessionLease.test.ts`

**Interfaces:**
- Produces: `SessionVault.load/save/clear`，结果区分 none/encrypted/memory-only/unreadable。
- Produces: `AccountSessionLease.begin()`、`assertCurrent(generation)`、`invalidate()`。

- [ ] **Step 1:** 写 vault/lease 红灯，覆盖 safeStorage unavailable、密文损坏、clear、旧 generation 发送前/响应后双检。
- [ ] **Step 2:** 运行两个测试，预期 FAIL。
- [ ] **Step 3:** 实现 `persist:jmcomic-account` 独立 partition；不得使用 defaultSession Cookie。
- [ ] **Step 4:** 运行两个测试，预期 PASS。
- [ ] **Step 5:** 提交 `feat: 隔离并加密在线账号会话`。

### Task 4: 单一登录生命周期状态机

**Files:**
- Create: `src/main/account/accountRuntime.ts`
- Create: `src/main/account/accountService.ts`
- Create: `src/main/__tests__/accountService.test.ts`
- Create: `src/main/__tests__/accountRuntimeStartup.test.ts`

**Interfaces:**
- Produces: `initialize()`、`login(input)`、`logout(expectedGeneration)`、`retryValidation(expectedGeneration)`、`getStatus()`、`subscribe()`。

- [ ] **Step 1:** 写 100 次可控竞态红灯：login 成功后旧验证 401 返回，不得把新 session 设 expired。
- [ ] **Step 2:** 写 AVS 半过期矩阵：一端点 200、一端点 401 时统一进入 verification-required，不宣布 authenticated。
- [ ] **Step 3:** 运行测试，预期 FAIL。
- [ ] **Step 4:** 实现状态机；每个异步边界检查 generation；authenticated 只能由最小认证端点集合全部通过产生。
- [ ] **Step 5:** 运行测试 100 次，预期零 flaky、全部 PASS。
- [ ] **Step 6:** 提交 `fix: 统一在线账号登录验证生命周期`。

### Task 5: 收藏与历史只读服务

**Files:**
- Create: `src/main/account/libraryCore.ts`
- Create: `src/main/account/libraryService.ts`
- Create: synthetic favorites/history fixtures
- Create: `src/main/__tests__/accountLibraryParser.test.ts`
- Create: `src/main/__tests__/accountLibraryService.test.ts`

- [ ] **Step 1:** 从历史分支筛选只读 parser 测试；移除所有 set/delete/move/tag mutation 测试。
- [ ] **Step 2:** 红灯覆盖空页、畸形项、未知 continuation、401、旧 generation、取消。
- [ ] **Step 3:** 实现 `listFavorites(query)` 和 `listHistory(query)`；无写方法导出。
- [ ] **Step 4:** 运行两个测试，预期 PASS。
- [ ] **Step 5:** 提交 `feat: 添加在线收藏与历史只读服务`。

### Task 6: 最小 IPC 和 renderer UI

**Files:**
- Create: `src/main/account/accountIpc.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/stores/accountStore.ts`
- Create: `src/renderer/src/components/account/AccountPanel.tsx`
- Create: `src/renderer/src/components/account/OnlineFavoritesView.tsx`
- Create: `src/renderer/src/components/account/OnlineHistoryView.tsx`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Modify: `src/renderer/src/pages/FavoritesPage.tsx`
- Create: `src/main/__tests__/accountIpcContract.test.ts`
- Create: `src/main/__tests__/accountUiContract.test.ts`

- [ ] **Step 1:** 写 IPC allowlist 红灯，只允许 status/login/logout/retry/listFavorites/listHistory。
- [ ] **Step 2:** 断言 preload 不暴露 Cookie/AVS/password getter；password 只作为 login invoke 参数且不存 renderer store。
- [ ] **Step 3:** 实现局部错误、取消和 generation 输入；UI phase 明确区分 anonymous/authenticating/authenticated/verification-required/expired/error。
- [ ] **Step 4:** 运行 IPC/UI 契约和 build，预期 PASS。
- [ ] **Step 5:** 提交 `feat: 接入只读在线账号界面`。

### Task 7: 真实只读验证门

- [ ] **Step 1:** 再次取得用户对测试账号与具体只读端点的授权。
- [ ] **Step 2:** 验证登录、重启恢复、AVS 过期、退出和网络失败；不点击任何收藏/删除/签到/评论/购买操作。
- [ ] **Step 3:** 连续执行 100 次 generation 竞态自动测试；登录/退出循环无旧请求污染。
- [ ] **Step 4:** 确认退出后内存状态 anonymous、独立 Session Cookie 清空、vault 按用户选择清理。
- [ ] **Step 5:** 全量测试、build、隐私扫描通过后，创建只读验证报告。

## Plan Acceptance

- 登录成功后不会因旧 401 在数秒内回退；100 次竞态零污染。
- AVS 半过期映射为一致状态，renderer 无原始凭据。
- 收藏和历史只有只读能力；全部远端写 capability unavailable。
- 退出后内存、Session、vault 一致；自动测试零真实账号请求。
- 购买/权益不确定时 fail-closed，经济与公开写操作不在本计划实现。
