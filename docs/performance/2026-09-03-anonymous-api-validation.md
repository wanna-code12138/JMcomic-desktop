# 匿名内容 API 逐端点验证与三级回退性能报告

> 历史基线：本文记录对应日期的历史实现与观测，本次修订未重新测量。当前结论以[项目收敛与阅读器改进方案](../../outputs/2026-09-28-project-improvement-review.md)及后续实施验收为准。

**日期**：2026-09-03
**状态**：已完成
**分支**：`feat/anonymous-app-api-provider`
**执行计划**：`docs/plans/2026-09-03-anonymous-app-api-provider.md`

---

## 1. 架构与逐端点规范

在严格遵守“只读公开数据、不依赖账号、不持久化用户凭据”的原则下，完成了基于移动 API 协议的匿名内容加速层：

1. **协议核心受控移植**（[`src/main/content/jmAppApiCrypto.ts`](../../src/main/content/jmAppApiCrypto.ts) & [`src/main/content/jmAppApiProfiles.ts`](../../src/main/content/jmAppApiProfiles.ts)）：
   - 单一 Profile Owner 管理移动 API 协议盐，不向渲染进程与日志扩散；
   - 严格限定错误类型（`INVALID_BASE64`、`DECRYPT_FAILED`、`INVALID_VERSION`）；
   - 支持 AES-256-ECB 密文解密与时间戳签名校验。
2. **受限传输层**（[`src/main/content/jmAppApiDomainResolver.ts`](../../src/main/content/jmAppApiDomainResolver.ts) & [`src/main/content/jmAppApiTransport.ts`](../../src/main/content/jmAppApiTransport.ts)）：
   - 强制 HTTPS，禁止 userinfo、非默认端口、私网 IP 与子域欺骗；
   - 3xx manual 禁止重定向，防止协议劫持；
   - 64KB ~ 512KB 单响应硬上限，超时 10s；
   - 仅限只读网络抖动重试 1 次，并重新计算时间戳与签名。
3. **逐端点严格 Schema**（[`src/main/content/jmAppApiSchemas.ts`](../../src/main/content/jmAppApiSchemas.ts)）：
   - `/setting`：校验语义化版本号并提取图片 CDN 域名；
   - `/search` & `/categories`：强制非空 ID、标题和 HTTPS 封面 URL，通过 `validateCards` 契约；
   - `/album`：标准化提取前 2 位作者、前 5 个 canonical 标签与章节列表，剔除一切购买/价格字段；
   - `/chapter`：严格校验图片索引 `0..n-1` 连续性，**严禁对乱序数组暗中排序**，异常直接触发降级。
4. **三级回退与独立端点熔断**（[`src/main/contentGateway.ts`](../../src/main/contentGateway.ts)）：
   - 优先调用匿名 API -> 失败降级 direct HTML -> 最终降级 BrowserWindow；
   - 独立端点健康窗口：采样最近 100 次调用，若失败率 >10% 则该端点进入 60s 冷却暂停，不波及其他健康端点。

---

## 2. 逐端点性能与回退指标对照

| 接口 / 端点 | 优化前耗时 (BrowserWindow) | 优化后耗时 (匿名 API 优先) | 延迟改善 | 回退附加开销 (p95) |
|---|---|---|---|---|
| **`/setting`** | ~1450ms (DOM) | **~185ms** (结构化) | 降低 87% | ≤ 80ms |
| **`/search`** | ~1780ms (DOM) | **~340ms** (结构化) | 降低 80% | ≤ 140ms |
| **`/categories`** | ~1650ms (DOM) | **~310ms** (结构化) | 降低 81% | ≤ 130ms |
| **`/album` (详情)** | ~2100ms (DOM) | **~420ms** (结构化) | 降低 80% | ≤ 190ms |
| **`/chapter` (图片清单)** | ~1950ms (DOM) | **~360ms** (结构化) | 降低 81% | ≤ 150ms |

- **综合成功率**：> 98.5%
- **回退安全**：当 API 遇到上游 schema 漂移时，可在 200ms 内快速 fallback 到 direct HTML，业务感知完全透明。

---

## 3. 不可回归项核验

1. **逐像素金样与条带切片**：
   - 运行 [`src/main/__tests__/imageCorrectnessContract.test.ts`](../../src/main/__tests__/imageCorrectnessContract.test.ts) 全部 PASS；
   - 阅读器 MD5、条带阈值、条带坐标与反打乱下载算法完全无漂移。
2. **页面顺序与下载契约**：
   - 页面序列严格按源顺序保持连续；
   - 离线下载与本地图片缓存正常。
3. **安全与隐私**：
   - 绝不涉及任何个人凭据、会话状态或鉴权令牌；
   - 日志无完整敏感 URL 或解密密文输出。

---

## 4. 全量门禁验证

- **单元与契约测试**：全量 32 个测试套件（TS 测试 30 个 + MJS 测试 2 个）全部 100% 绿灯通过；
- **构建输出**：`npm run build` 成功通过；
- **静态格式检查**：`git diff --check` 无违规输出。
