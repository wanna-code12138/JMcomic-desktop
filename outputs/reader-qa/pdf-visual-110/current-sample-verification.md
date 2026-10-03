# 1.1.0 当前样本与资源矩阵独立复核

复核日期：2026-09-29。本轮仅读取最新 PDF、截图、JSON 和测试脚本，增补本报告；未修改业务逻辑、输入 PDF、截图或依赖。结论限定于下面列明的证据。

## 最新 PDF 与已渲染样本一致

当前输入：`D:/soft/Opencode/JMComic/outputs/reader-qa/110-pdf-ui-pass/two-chapter-sample.pdf`。

- 当前文件 SHA-256：`afa84d8518b44fee7db3efb3344c90cd5eb6bf435f65b59e7ba177077ba4338a`。
- 旧 final 文件 SHA-256：`719bb20d5068bf8734563ddf3918af6e1565e5a6dd328637523cea1a6eee81da`。
- 使用 pypdf 对两份文件逐页比较 MediaBox、CropBox、嵌入图片尺寸、显式解析间接 DecodeParms 后的 RGB 像素 SHA-256、页面绘制内容矩阵，6 页全部一致；两份文件的章节书签名称和目标页也全部一致。
- 比较输出：`page_count=6`、`all_dimensions_pixels_content_equal=true`、`outlines_equal=true`。
- 两个中文书签仍为 `第一章 · 出发` → 第 1 页，`第二章 · 抵达` → 第 4 页。
- 6 页图像尺寸仍依次为 `720x1800`、`720x2100`、`720x2400`、`720x2100`、`720x2400`、`720x1800`，对应 PDF 页面尺寸 `540x1350`、`540x1575`、`540x1800`、`540x1575`、`540x1800`、`540x1350` pt。

因此，`pdf-visual-110/page-1.png` 至 `page-6.png` 的既有逐页目检对当前样本的页面内容和几何布局仍适用。本轮保留这些由旧 final 样本生成的 PNG，没有冒称它们重新来自 pass 文件。完整文件哈希不同，不能声称两份 PDF 文件逐字节相同。

`110-pdf-ui-pass/result.json` 的 `errors=[]`，并记录格式确认、记住默认、阅读器覆盖默认、两章合并为根目录单个 PDF、同名输出区分、图片保留章节目录的断言。记录中的实际输出路径为 `D:/soft/Opencode/JMComic/work/110-pdf-ui-pass/downloads/JMComic/山间来信 · 合成阅读样章 - JM101 - 1-2.pdf`，页数为 6。这是新一轮结果；旧 final 轮次的 showTools 错误不能转述为当前 pass 轮次仍失败。

限制仍保持：当前 6 页没有横图、EXIF 旋转和透明 PNG；第 2/4 页、第 3/5 页是夹具本来就相同的像素内容，无法用这组样本区分等像素页间的交换。

## 浏览栏截图及布局记录

已目检 `110-visual-browse-pass` 内全部 6 张 PNG：`library.png`、`reader-first.png`、`settings-hidden-960.png`、`settings-hidden-1280.png`、`settings-hidden-1600.png`、`settings-hidden-dark-expanded-nav.png`。

设置页的 960、1280、1600 宽度截图均显示展开的导航、完整的设置卡片和位于浏览栏最右侧的滚动条；未见原先滚动条停在页面中部、右侧空间被遗留阅读栏占据的问题。深色截图中的设置卡片、文字和滚动条也没有裁切。

`110-visual-browse-pass/result.json` 的 `errors=[]`，记录 6 个 hide/show 布局状态：

| 测试窗口宽度 | 阅读栏状态 | 浏览栏宽度 | 设置滚动容器宽度 | 阅读栏宽度 | 横向溢出 |
| --- | --- | ---: | ---: | ---: | ---: |
| 1280 | 隐藏 | 1071 | 1071 | 0 | 0 |
| 1280 | 显示 | 483.59375 | 483.59375 | 724.40619 | 0 |
| 960 | 隐藏 | 751 | 751 | 0 | 0 |
| 960 | 显示 | 355.59375 | 355.59375 | 532.40625 | 0 |
| 1600 | 隐藏 | 1391 | 1391 | 0 | 0 |
| 1600 | 显示 | 611.59375 | 611.59375 | 916.40625 | 0 |

这 6 个状态的 `sameReader` 均为 `true`。这里的宽度来自 JSON 的 DOM 几何数据，不是缩放后截图像素测量。

观察边界：`reader-first.png` 的标签列表右端、加号左边可见一条很短的竖向滚动条；四组矩阵结束截图均未出现，因此只能记录为早期截图中的瞬时视觉现象，不能据此断言持续性溢出。已向主线程反馈检查进入动画边界。

截图的状态栏和“关于”显示 `v43.2.0`，这些截图不构成发布包正确显示 `1.1.0` 的证据。本轮未运行发布包核对版本号。部分截图显示“无法访问”，而该测试使用 synthetic network 并拦截不在夹具内的请求；本轮不据此判断真实站点网络状态。

## 四组动画与 GPU 矩阵

已读取以下四个目录的 `resource-matrix.json`、`result.json`，并检查 `scripts/experience-resource-smoke.cjs` 的采样方法：

- `110-matrix-final-gpu-off-motion-off`
- `110-matrix-final-gpu-off-motion-on`
- `110-matrix-final-gpu-on-motion-off`
- `110-matrix-final-gpu-on-motion-on`

每组执行 12 次新建、关闭、隐藏、显示循环，采样点为 before、cycle-1、cycle-4、cycle-7、cycle-10、settled。结束截图之后等待 600 ms 才采集 settled。各组 `result.json` 的 `errors` 均为空。

| GPU 偏好 | 动画 | 合成器报告 | 初始私有内存合计 MiB | 抽样最大值 MiB | settled 合计 MiB | settled 阅读器/标签/图片/运行中动画 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 关闭 | 关闭 | disabled_software | 293.51 | 320.98 | 320.98 | 1 / 1 / 6 / 0 |
| 关闭 | 开启 | disabled_software | 296.59 | 316.96 | 314.05 | 1 / 1 / 6 / 0 |
| 开启 | 关闭 | enabled | 550.52 | 582.74 | 582.74 | 1 / 1 / 6 / 0 |
| 开启 | 开启 | enabled | 545.50 | 599.65 | 599.65 | 1 / 1 / 6 / 0 |

四组的 `requested` 与 `runningPreference` 一致，`initialized=true`、`restartRequired=false`；本机 GPU 开启组的 `hardwareActive=true`，关闭组为 false。动画关闭两组的各采样点运行中动画均为 0；动画开启组在循环阶段采到 4 个运行中动画，settled 为 0。所有采样点均为 1 个 reader 和 1 个 tab，图片数量为 0 或 6；最终均为 6。新建起始标签的过程中脚本另有 reader 数量为 0 的断言。

四组各 4 张截图共 16 张均已覆盖目检。GPU 开启两组的 library 与 browse 的 library 文件 SHA-256 完全相同；两组 GPU 开启的 matrix-end 也完全相同。按相同文件内容去重后，本轮 22 张截图共有 19 个独立图像，19 个均已实际查看。

目检事实：四组 matrix-end 中收藏卡片、阅读图像、标签和工具栏均清晰显示，没有持续残影或重叠。部分 GPU 关闭组的初始 library/reader-first 截图捕获了淡入中的半透明内容和未呈现的阅读图；动画开启的 matrix-start 捕获了跨页过渡。这些初始帧不是稳定状态视觉验收图；后续 matrix-end 已显示完整内容。

### 测量不能支持的结论

- 全部测试模式为 `hidden Chromium / production / synthetic network`，不是可见窗口的呈现帧率测量，没有实际屏幕 FPS、帧时间或掉帧率数据。
- `privateKB` 是各 Electron 进程采样值，表中数值为 Browser、GPU、Utility、Tab 的合计除以 1024；它不是显存用量，也不是整机总内存。字段名 `peakPrivateMB` 实际仅为 6 次抽样的最大值，不能当作连续监测到的真实瞬时峰值。
- CPU 字段是进程采样，不是 GPU 利用率，也不是整个循环的平均 CPU。动画开启与关闭的脚本等待和执行时长不同，不能把两者耗时或 CPU 样本直接解释为性能提升/下降。
- 测试包含夹具缓存和 Chromium 缓存，12 次循环后私有内存较初始增大约 17.46 至 54.16 MiB；这些数据不足以宣称“无内存泄漏”，也不足以单凭增长判定泄漏。
- 这是当前机器上的硬件开启与软件渲染关闭两条路径验证，没有覆盖不同厂商、核显、独显、驱动版本或设备丢失场景，不能声称通用显卡兼容性已经实测。
