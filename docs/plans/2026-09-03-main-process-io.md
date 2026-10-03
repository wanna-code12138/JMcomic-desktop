# Main Process I/O Implementation Plan

> **For implementation:** Execute tasks in order, one task at a time, following the test-driven-development skill; keep the checkbox (`- [ ]`) list updated, and verify each task before moving on.

**Goal:** 只在实测越过阈值时消除主进程可感知同步 I/O，并保证阅读进度、下载状态和数据库恢复能力不退化。

**Architecture:** 先给数据库 flush、目录扫描、缓存统计和代理探测分别计时；低于阈值则不改数据库。达到阈值时先采用写入合并与异步文件操作，仍不足才为 sql.js export 设计 Worker/utility process；SQLite 技术迁移必须另立设计。

**Tech Stack:** Electron main、sql.js、Node fs/promises、Worker/utilityProcess（条件）、TypeScript、tsx。

## Global Constraints

- `database.save` p95≤8ms 且 max 不频繁超过16ms时禁止迁移数据库。
- 正常浏览不得出现 >100ms main 同步任务。
- 阅读页码和下载进度允许防抖，但退出前必须有限等待最终 flush。
- 数据库旧版本必须始终可恢复；不允许附带 schema 迁移。
- 不新增 SQLite 依赖；需要迁移时重新设计并申请安装授权。
- 本计划不修改 renderer UI、内容 provider 或图片正确性。

---

## File Structure

- `src/main/ioMetrics.ts`：I/O span 名称和聚合。
- `src/main/databaseWriteCoordinator.ts`：合并、最终 flush 和有限退出等待。
- `src/main/database.ts`：调用 coordinator，不改变 SQL 接口。
- `src/main/downloadManager.ts`、`downloadCore.ts`：异步扫描和批量进度写。
- `src/main/imageLoader.ts`：异步统计遗留路径。
- `src/main/networkProbe.ts`：异步代理/网络探测。
- `src/main/__tests__/databaseWriteCoordinator.test.ts`：合并、错误和退出。
- `src/main/__tests__/mainIoContract.test.ts`：禁止同步热点契约。

### Task 1: 分项测量与执行门

**Files:**
- Create: `src/main/ioMetrics.ts`
- Modify: `src/main/database.ts`
- Modify: `src/main/downloadManager.ts`
- Modify: `src/main/imageLoader.ts`
- Modify: `src/main/networkProbe.ts`
- Create: `docs/performance/2026-09-03-main-io-decision.md`

- [ ] **Step 1: 为四类操作添加 span**

指标固定为 `database.flush`、`download.scan`、`image-cache.scan`、`network.proxy-probe`；metadata 只含 bytes/itemCount/outcome，不含路径、SQL、URL。

- [ ] **Step 2: 采集规模矩阵**

数据库使用当前、10×、100×合成记录；下载目录使用 0/1k/10k 文件；缓存同规模；代理探测 30 次。记录 p50/p95/max 和是否阻塞窗口输入。

- [ ] **Step 3: 作出逐项决策**

低于阈值的模块在报告中标记“不实施”；越过阈值的模块进入对应后续 Task。不得用一个模块的慢证明另一个模块需要重构。

- [ ] **Step 4: 提交测量**

```powershell
git add src/main/ioMetrics.ts src/main/database.ts src/main/downloadManager.ts src/main/imageLoader.ts src/main/networkProbe.ts docs/performance/2026-09-03-main-io-decision.md
git commit -m "perf: 测量主进程 IO 热点"
```

### Task 2: 条件数据库写入协调器

**Files:**
- Conditional Create: `src/main/databaseWriteCoordinator.ts`
- Conditional Create: `src/main/__tests__/databaseWriteCoordinator.test.ts`
- Conditional Modify: `src/main/database.ts`
- Conditional Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `schedule(reason): void`、`flush(): Promise<void>`、`close(timeoutMs): Promise<'flushed' | 'timeout'>`。

- [ ] **Step 1: 写红灯测试**

用 fake exporter/writer/clock，断言 100 次 schedule 合并为一次 export/write；flush 中再次 schedule 会再写一次最新状态；失败不吞掉下一次写；close 最多等待 2000ms；最后页码落盘。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/databaseWriteCoordinator.test.ts`

Expected: FAIL，coordinator 不存在。

- [ ] **Step 3: 最小实现**

```ts
export interface DatabaseWriteCoordinator {
  schedule(reason: 'history' | 'download' | 'favorite' | 'settings'): void
  flush(): Promise<void>
  close(timeoutMs: number): Promise<'flushed' | 'timeout'>
}
```

只允许一个 active flush；dirty generation 确保 flush 期间的新写不丢失；close 不使用无限 await。

- [ ] **Step 4: 运行数据库契约并提交**

Run: `npx tsx src/main/__tests__/databaseWriteCoordinator.test.ts`

Run: `npx tsx src/main/__tests__/personalData.test.ts`

Expected: PASS。

```powershell
git add src/main/databaseWriteCoordinator.ts src/main/database.ts src/main/index.ts src/main/__tests__/databaseWriteCoordinator.test.ts
git commit -m "perf: 合并数据库持久化写入"
```

### Task 3: 条件异步扫描与代理探测

**Files:**
- Conditional Modify: `src/main/downloadManager.ts`
- Conditional Modify: `src/main/downloadCore.ts`
- Conditional Modify: `src/main/imageLoader.ts`
- Conditional Modify: `src/main/networkProbe.ts`
- Create: `src/main/__tests__/mainIoContract.test.ts`

- [ ] **Step 1: 写同步热点红灯契约**

只对已测得越阈值的函数断言不得调用 `readFileSync/writeFileSync/readdirSync/statSync/execFileSync`；不要全仓禁止合理的启动期小文件读取。

- [ ] **Step 2: 运行红灯**

Run: `npx tsx src/main/__tests__/mainIoContract.test.ts`

Expected: FAIL，目标热点仍调用同步 API。

- [ ] **Step 3: 改为异步并加失效规则**

目录统计使用 fs/promises；同路径 scan single-flight；结果按目录 mtime 或显式下载/清缓存事件失效；代理探测用异步 registry/child process 包装并设总超时。

- [ ] **Step 4: 运行相关测试并提交**

Run: `npx tsx src/main/__tests__/mainIoContract.test.ts`

Run: `npx tsx src/main/__tests__/downloadCore.test.ts`

Run: `npx tsx src/main/__tests__/imageCacheIoContract.test.ts`

Expected: PASS。

```powershell
git add src/main/downloadManager.ts src/main/downloadCore.ts src/main/imageLoader.ts src/main/networkProbe.ts src/main/__tests__/mainIoContract.test.ts
git commit -m "perf: 异步化主进程扫描与探测"
```

### Task 4: sql.js Worker 二次决策

- [ ] **Step 1:** 重测 Task 1；若 p95≤8ms 且无窗口卡顿，停止，不创建 Worker。
- [ ] **Step 2:** 若 export 本身仍超阈值，写独立设计比较 Worker 搬运 sql.js 与文件型 SQLite；必须包含数据迁移、崩溃恢复和依赖成本。
- [ ] **Step 3:** 获得用户批准前不得实现任一方案。

### Task 5: 最终门禁

Run: `Get-ChildItem src/main/__tests__/*.test.ts | ForEach-Object { npx tsx $_.FullName }`

Run: `npm run build`

Expected: 全部通过；异常退出后旧数据库可打开；最终页码/下载状态存在；退出等待≤2s；大目录扫描不阻塞输入。

## Plan Acceptance

- 只有超过阈值的 I/O 模块被修改。
- 写入合并不丢最后状态，失败可恢复，退出有上限。
- 正常浏览无 >100ms 主进程同步任务。
- sql.js Worker/SQLite 迁移未获新批准时不实施。
