# 1.1.0 详情加载修复验证

日期：2026-09-29。基于已交付 1.1.0，版本号保留 1.1.0，修复版单独放在 `outputs/releases/1.1.0-detail-fix/`。原成品保留。

成品：[便携 EXE](<../releases/1.1.0-detail-fix/JMComic Desktop Portable 1.1.0.exe>)，108,419,212 字节；[目录版入口](<../releases/1.1.0-detail-fix/win-unpacked/JMComic Desktop.exe>)需要保留整个目录。便携 EXE 的 SHA-256 为 `9382154968a6a50881bb865edd395584d02fd0fc04e68d25a5db40ffc5df6dc0`，两种成品内的 `app.asar` 均为 `45fd12ff24c80421f5cdd08090176537f31618400045ed2b3c0617286bd890c4`。

## 结论与触发条件

分类、主页卡片与新标签页最终都调用相同的 `content:detail`。实测差异来自作品章节结构与网页回退状态。

1. 多章节作品返回非空 `series`，原版通常直接成功。
2. 单篇作品合法返回 `series: []`，原版解析器却抛出 `Album chapters series is empty or missing`，强制转向网页抓取。站点约定是这种作品自身构成一个章节，photo ID 等于 album ID；已与公开接口及 [JMComic-Crawler-Python 的实体实现](https://github.com/hect0x7/JMComic-Crawler-Python/blob/master/src/jmcomic/jm_entity.py)交叉核实。
3. 网页正常且提取到阅读链接时仍可能成功；网页验证未完成时会报验证失败，网页已打开但没提取到章节时会报用户截图中的 `browser-validation:detail-chapters`。
4. 原浏览器提取器把空章节结果也缓存 10 分钟，导致再次打开仍命中坏结果。

## 实网对照

使用独立用户数据目录运行真实应用路由与真实匿名 API/HTML；仅把漫画封面替换为占位图并屏蔽网页图片，没有下载漫画内容或读取个人账户数据。

| 样本 | 入口 | 原版 | 修复版 |
| --- | --- | --- | --- |
| JM1477646，空 series、34 页 | 分类 / 同人 | 失败 | 成功，1 章 |
| 同一本 JM1477646 | 新标签页 | 失败 | 成功，1 章 |
| JM1477645，空 series、22 页 | 分类 / 同人 | 失败 | 成功，1 章 |
| 同一本 JM1477645 | 新标签页 | 失败 | 成功，1 章 |
| JM1449617，178 章 | 分类 / 同人、新标签页 | 均成功 | 均成功 |
| 主页“最新”抽样 | 首页 | JM1468540 成功，10 章 | JM1472020 成功，10 章 |

主页实时排序会变化，因此这两次主页抽样不声称是同一本。真实旧版采用原交付 `app.asar`；新版本采用本次编译产物。见 [旧版实网结果](live-original-110/result.json)、[修复版实网结果](live-fixed-110/result.json)。

旧版隔离环境的网页验证最终超时，两个单篇因此显示“网页验证未完成”；修复版在相同验证尚未完成的状态下已由 API 成功加载这两个单篇。这里没有把该旧版实网错误冒充用户截图的原文。

原始结构抽样另覆盖全部、单本、同人分类。同人前 6 项中有 4 项 `series: []`；修复后逐一识别为单章节，阅读页元数据分别为 34、22、16、27 页，多章节对照仍为 63 章。见 [同人修复前](live-doujin-before.json)、[相同 ID 修复后](live-fixed-schema.json)。首次查询 JM1477644 的页数据出现过图片域名校验失败，第二次查询恢复；该瞬时上游情况未通过放宽域名校验处理。

## 同书入口矩阵与恢复测试

真实 Electron 主进程、preload、渲染器、IPC、网关均运行，只替换外部 API/HTML 为合成数据。单篇 API 返回合法空数组，网页回退夹具刻意返回尚无章节的 DOM，用来稳定重现截图错误。

| 同一合成作品 | 分类 | 首页 | 新标签页 |
| --- | --- | --- | --- |
| 多章节，修复前 | 成功 | 成功 | 成功 |
| 单篇，修复前 | `browser-validation:detail-chapters` | 同左 | 同左 |
| 多章节，修复后 | 成功 | 成功 | 成功 |
| 单篇，修复后 | 成功 | 成功 | 成功 |

证据：[原版矩阵](../reader-qa/detail-entries-before/result.json)、[修复后矩阵](../reader-qa/detail-entries-after/result.json)、[修复后界面](../reader-qa/detail-entries-after/same-book-entry-matrix.png)。修复后合法单篇没有调用浏览器回退；打开阅读器和对应页列表通过，真正的 API 失败仍可由有效网页回退恢复。

失败页新增“重新加载”。原版 [按钮缺失的红灯](../reader-qa/detail-retry-red/result.json)，修复后原页重试恢复通过。浏览器缓存回归先得到空章节、再得到有效章节，确认第二次确实重新请求、有效结果仍可缓存复用。

## 实现与验证

- `jmAppApiSchemas.ts`：仅把显式空数组识别为单篇；章节字段缺失、类型错误、损坏条目仍拒绝。
- `scraperWindow.ts`：只缓存通过详情校验的数据。
- `MangaDetailPage.tsx`：失败态增加重试次数状态，复用现有请求与取消机制。
- 章节解析与缓存回归均先实际失败再修复：[解析红灯](schema-red.txt)、[绿灯](schema-green.txt)、[缓存红灯](cache-red.txt)、[绿灯](cache-green.txt)。
- `npm test`：**TOTAL=82 PASSED=82 FAILED=0**，见[完整结果](full-tests.txt)。
- `npm run typecheck`：退出码 0，见[输出](typecheck.txt)。
- `npm run build`：退出码 0，见[输出](build.txt)。保留原有混合静态/动态导入提示。
- 目录版实际 EXE 已通过单篇分类详情、离线阅读、23 行反打乱金样、CBZ、PDF worker 与正常关闭退出 0，见[实际 EXE 结果](../reader-qa/detail-fix-exe-unpacked/result.json)。成品验证未加载开发源码。
- 便携版实际 EXE 也通过上述完整链路、正常退出 0，见[便携版结果](../reader-qa/detail-fix-exe-portable/result.json)。打包退出码 0，见[构建器输出](package.txt)。

可重复执行的工具在 `scripts/detail-protocol-smoke.cjs`（匿名结构）、`scripts/detail-live-smoke.cjs`（真实入口）和 `scripts/detail-entry-smoke.cjs`（受控矩阵）。受控矩阵通过 `JM_QA_DETAIL_ENTRIES=1` 启动 `scripts/reader-smoke.cjs`，使用新的 `JM_QA_RUN` 可获得全新的隔离缓存。

验收器最初有选择器、隐藏窗口键盘投递和脚本转义问题，已修正后重跑；结论使用本报告链接的最终轮次。没有改动站点的验证流程或放宽错误数据校验。
