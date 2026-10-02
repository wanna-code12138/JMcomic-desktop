# 1.3.1 核心实施证据

设计与后续增强已由用户批准。原生桌面控制在本会话禁用，用户进一步明确允许使用 Electron 调试接口逐步操作真实窗口，并逐屏检查截图；交互验收与自动测试分别记录。

## 已执行的先行失败测试与修复验证

下列记录对应实际运行 `node --import tsx src/main/__tests__/<文件名>` 的输出。测试在正常 Windows Node 环境执行；沙箱内 tsx 的用户目录问题已在准备阶段复现。

| 测试 | 实现前观察到的失败 | 实现后实际结果 |
| --- | --- | --- |
| commentParser.test.ts | 主评论不能被丢弃，0 !== 1 | PASS，replys、剧透 1/2、安全正文、分页与坏结构 |
| commentRuntime.test.ts | provider 的 comments 为 undefined | PASS，惰性请求、共享路由发现、取消 |
| commentService.test.ts | 重复打开调用 2 次而非 1 次 | PASS，缓存时限、过期回退、容量、刷新与取消 |
| accountTransport.test.ts | 解密结果 undefined | PASS，精确来源、凭据、重定向、错误分类、体积限制与写请求不重试 |
| accountParser.test.ts | 有效资料库作品数 0 !== 1 | PASS，身份、未知字段、总条数/页数、收藏夹、通知 |
| accountVault.test.ts | 保存后恢复 null | PASS，加密恢复、顺序清理、系统加密不可用、密文损坏 |
| accountService.test.ts | 登录后仍为 anonymous | PASS，认证证明、可选 401、失效、100 次旧响应竞态、退出与代理冻结 |
| accountProxy.test.ts | 新会话未继承 system 代理 | PASS，继承、冻结、连接重置、失败回滚、注销 |
| accountSession.test.ts | Session 尚未实现 | PASS，内存分区、同源完整 Cookie、恢复、释放 |
| accountMutation.test.ts | 写后状态 null !== true | PASS，期望状态、去重、串行、响应丢失后的核对、旧会话 |
| accountIpc.test.ts | 隐藏抓取窗口被允许 | PASS，仅受信主窗口的主 frame |
| accountNavigation.test.ts | 导航没有可访问账户入口 | PASS，账户和原收藏入口 |
| accountStore.test.ts | 身份更新未进入渲染状态 | PASS，代次隔离、退出、迟到初始快照、事件清理 |
| commentPresentation.test.ts | 默认暴露剧透正文 | PASS，剧透隐藏、折叠回复、正文转义 |
| accountInstance.test.ts | 第二进程未被拒绝 | PASS，先确定数据目录再加锁，拒绝第二进程 |

测试期间修正过一个新测试的括号语法错误；该次失败不计入先行行为失败证据。图片默认路径按当前生产 parser 的 `/media/albums/{id}.jpg` 校正。类型检查也发现并修复了新代码的可空 Cookie 标记及桥接类型问题，均未冒充功能红灯。

以上为最初自动化阶段记录；后续真实验证见下文。

第一次全量检查：97 个测试文件，96 通过、1 失败。失败为旧启动测试未给新增 accountRuntime/commentIpc 模块提供外部端口，导致 Node 测试误加载真实 Electron 依赖；补充模拟并保留原顺序断言，新增“实例锁/代理必须先于账户初始化”断言后该文件 2/2 通过。

随后审查新增代理取消登录用例，实际复现 `authenticating !== anonymous`；修复中断后的状态发布，再进行回归。

## 真实窗口与账户验收（2026-10-02 至 10-03）

在独立 `work/1.3.1-live/profile` 数据目录打开 Electron 真实可见窗口，通过用户授权的 CDP 鼠标、键盘输入、滚动和截图逐步操作。不是仅调用 IPC 的脚本测试。未保存账户页面、评论正文或账户列表的截图；保留的两张截图均无个人资料。

- 真实表单登录，不记住模式和记住模式各通过；密码框提交后清空。匿名与无效 Cookie 对照的收藏接口均返回 AUTH_REQUIRED，有效会话通过，默认内容 Session 不含凭据 API 的账户 Cookie。
- 账户概览、收藏（1 项）、现有收藏夹、历史（20 项，总数 20）、追更空/非空、通知（2 项）均通过正常导航打开。真实样本不足以验证历史第二页；分页边界使用合成数据验证。
- 匿名评论样本 123456：第 1/2/3 页各 10 条，第 4 页 4 条；末页禁用下一页；展开 3 条回复，剧透按条隐藏并可手动揭示。第 3 页一次网络错误后手动重试成功。
- 在线收藏添加/撤销成功。追更写入后单作品 GET 仍返回 false，但真实列表包含作品；以列表替代该状态依据。非空追更为 `item`，空列表仅 `totalCnt=0`，均增加失败再修复的回归用例。
- 追更开启已在真实窗口显示“取消追更”。撤销后的回读遇到局部 401 时，界面显示结果待核实，没有重发写请求；手动刷新确认取消。测试结束远端收藏=false、追更总数=0。
- 通知点击“标为已读”后未读按钮由 2 变为 1，无错误；使用同一受信会话恢复原未读状态并回读确认 2 条未读。
- 记住会话文件实际为系统密文，仅包含会话元数据、账户快照和 5 个同源 Cookie，无密码字段。正常关窗重启后无需输入密码，经过远端证明恢复 authenticated；恢复后的 Cookie 仍为 5 个。服务器验证会更新 Cookie 元数据，文件摘要不要求相同。
- 浅色常规窗口与深色 1000×740 小窗口逐屏目检，无水平溢出；本机实际 DPR=2。未改变 Windows 系统 DPI，其余 DPI 不声称已原生验证。
- 退出后账户 UI 清空，phase=anonymous、profile=null，密文文件不存在。该次服务器退出未能在 3 秒内确认，界面准确提示“已在本机退出；未能确认服务器撤销会话”。

补充先行红灯：评论超限标记 undefined、重复页未拒绝；实现后两个测试 PASS。可选只读接口首次 401、证明有效后恢复的用例先报 UNAVAILABLE，再实现单次只读恢复后 PASS；写接口仍只发送一次。

全量验证实际输出：`TOTAL=97 PASSED=97 FAILED=0`，`tsc --noEmit` 通过，生产构建通过。随后只读恢复修复的 accountService 定向测试和新构建通过。保留两条既有 Vite 动态/静态导入提示；未新增依赖。

## 成品回归

标准打包在下载 Electron 时停滞，核实当前本地 Electron 为 43.2.0 后，停止本任务的停滞构建，使用 `npm exec -- electron-builder --win --config.electronDist=node_modules/electron/dist` 完成打包，未修改依赖或打包配置。ASAR 检查：250 packages、858 dependency edges、errors=[]。

`package-launch-smoke.mjs` 对 unpacked EXE 和单文件便携 EXE 均完成 7 项实际应用回归：启动、空 series 详情、23 行像素还原、图片下载/离线读取/CBZ、阅读区工具、独立 PDF worker 和 code=0 正常退出。外部内容与保存对话框是合成响应，这部分是自动化验收。便携目录检查最初仍假设普通 userData，实际发现新固定目录为隔离副本旁的 JMComicData；修正检查器后重跑通过，失败报告单独保留。

另外打开打包的 1.3.1 EXE，确认 `packaged=true`、版本 1.3.1，通过鼠标打开账户页目检；键盘 Tab 从账号框移动到密码框。正常搜索 123456、打开评论，首个网络失败后点击局部重试显示 10 条；再点击“开始阅读”，右侧 3 张图片就绪、中间保留 10 条评论，评论栏宽约 428 CSS px，无窗口水平溢出，无残留验证覆盖层。随后正常关窗。

1.3.1 便携包 SHA256：`08fd685b6f3a1f9b7fe7897426482c6e15c64f84fee388ff61884a8d7071329d`。成品路径 `dist-electron/JMComic Desktop Portable 1.3.1.exe`。本阶段验收完成，后续增强按独立批次推进。
