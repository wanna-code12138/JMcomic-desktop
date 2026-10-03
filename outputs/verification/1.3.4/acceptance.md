# 1.3.4 在线封面修复验收

## 根因与复现

用户截图中的列表标题已显示，封面全部空白。使用 1.3.3 成品的独立真实账户配置复现：GET `/favorite` 的作品 `image` 字段为字符串 `""`；DOM 中图片地址实际指向 `https://cdn-msp12.jmdanjonproxy.xyz/` 的 jmimg 代理，`complete=true`、`naturalWidth=0`、`opacity=0`。

`accountParser.ts` 原先用空值合并运算符处理可选 image，只能识别 null/undefined，不能识别空字符串。三个在线分类共用该解析器。正常匿名列表已将空字符串视为缺失并按作品 ID 生成封面，在线列表缺少这一步。

修改仅把可选 image 规范化为去除首尾空白的字符串；空值和非字符串退回 `/media/albums/<id>.jpg`，明确提供的可信封面仍保留，原有 HTTPS 和域名限制不变。未修改阅读、缓存、账户凭据或在线资料。

## 测试先行

新增 `accountCover.test.ts`，覆盖收藏/历史/追更真实响应结构中的空串、空白、缺失、null、错误类型，明确封面路径和不可信地址。先执行失败：实际 CDN 根地址不等于预期作品图片路径；最小实现后通过，原解析器、收藏/追更变更、资料管理测试同时通过。

补充现有成品回归夹具：收藏、历史、追更均返回 `image=""`，仅正确封面路径能取得 16×23 PNG，CDN 根地址没有合成图片。对旧 1.3.3 便携成品执行新增检查，确实失败于在线收藏的实际解码尺寸：`width=0,height=0`，预期 `16×23`。见 `outputs/reader-qa/1.3.4-cover-baseline/result.json`。这修正了前轮只核对列表而没有验证封面解码的验收缺口。

## 最终验证

`npm run check`：`TOTAL=104 PASSED=104 FAILED=0`；类型检查通过，主进程、Preload、渲染器构建成功。两条原有动态/静态 import 混用提示保留，没有新增依赖或构建配置变更。

`node scripts/verify-package.cjs`：251 个打包依赖、859 条依赖关系，`errors=[]`。使用已有 Electron 43.2.0 完成 1.3.4 便携包构建。

`node scripts/package-launch-smoke.mjs 'dist-electron/JMComic Desktop Portable 1.3.4.exe' 1.3.4-portable-fixture --fixture`：最终 EXE 的 10 项检查全部通过，`errors=[]`，正常关闭退出码 0。三类在线图片都实际解码为 16×23、`opacity=1`；原有离线阅读、CBZ、PDF Worker 及打包依赖路径检查也通过。该自动化使用隔离网络和隐藏窗口，单独于下列真实窗口验收。完整机器记录见 [最终成品结果](../../reader-qa/1.3.4-portable-fixture/result.json)。

## 真实可见窗口验收

2026-10-03，实际启动 `dist-electron/win-unpacked/JMComic Desktop.exe`，运行时确认 `isPackaged=true`、版本 `1.3.4`。与最终便携 EXE 内的 app.asar 哈希一致。使用独立测试配置和用户授权的真实账户；按已批准方式通过 Electron 调试接口逐步发送真实鼠标点击、滚轮输入，并逐屏检查实际窗口截图。以下交互没有用业务 IPC 替代界面按钮。

| 操作 | 实际结果 |
| --- | --- |
| 收藏页切换在线收藏 | 1/1 张封面加载并显示，实际尺寸 400×400，`complete=true`、`opacity=1` |
| 切换历史→在线 | 20/20 张封面实际解码并显示；逐步滚动至中段、末尾目检通过 |
| 刷新在线历史、切回并刷新在线收藏 | 保留正常封面，历史 20/20、收藏 1/1 |
| 追更非空状态 | 初始列表为空；从已有收藏详情临时追更，返回追更页刷新，1/1 张封面显示，尺寸 400×533，`complete=true`、`opacity=1` |
| 恢复追更状态 | 详情页点击取消追更，返回刷新，确认服务器列表恢复 0 条 |
| 退出账户、关闭程序 | 登录表单恢复，密码长度 0，三个在线分类的作品卡片合计 0；加密会话文件删除；正常关闭窗口 |

真实账户的书名、封面截图和会话内容不写入验收产物。此次只临时增删一条追更，已回读确认还原。退出时服务器撤销会话未能确认，界面明确提示“已在本机退出；未能确认服务器撤销会话”；本机退出及凭据清理成功，不将其报告为服务器注销成功。

收尾确认手动验收进程已经退出，会话文件不存在；本轮 `work/1.3.4-live`、`work/1.3.4-cover-baseline`、`work/1.3.4-portable-fixture` 临时配置和副本已清理，保留上述成品与合成数据验证证据。

## 交付文件

- `dist-electron/JMComic Desktop Portable 1.3.4.exe`：108,819,458 字节。
- EXE SHA256：`c2a14d5cc3fc853651240c0ab6338b5d763c4e7dda54fd7480e62cd6fb3d96c9`。
- app.asar SHA256：`69e87ac7f32442eeb819bef84868e102f6fc499eaaedfefa5d6a79baa21328fc`。

本补丁只修复在线封面地址解析；沿用旧 EXE 所在目录中的 `JMComicData` 即可保留数据，无需重建收藏或历史。旧版本成品保留以供比对。
