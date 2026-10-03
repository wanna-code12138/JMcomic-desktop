# PDF 1.1.0 独立媒体验收

验收日期：2026-09-29。范围：只读检查真实下载流程生成的 PDF，生成逐页渲染图；未修改业务代码、输入 PDF 或依赖。

## 输入与工具

- 最终输入：`D:/soft/Opencode/JMComic/outputs/reader-qa/110-pdf-ui-final/two-chapter-sample.pdf`
- SHA-256：`719bb20d5068bf8734563ddf3918af6e1565e5a6dd328637523cea1a6eee81da`
- 文件大小：59,601 字节；PDF 1.3；6 页；未加密；Creator/Producer 均为 JMComic Desktop。
- 已完整阅读 PDF 技能，使用预装 Poppler `pdfinfo`、`pdftoppm` 和预装 Python `pypdf`、Pillow。
- 全页渲染命令：`pdftoppm -r 96 -png <input.pdf> outputs/reader-qa/pdf-visual-110/page`。该分辨率与此样本源图像素尺寸一致。
- `page-1.png` 至 `page-6.png` 全部来自 final 输入，并已逐页目检。此前 green 样本的渲染已由 final 渲染替换。

## 验收结果

媒体验收通过：6 页均能完整渲染；无空白页、旋转错误、比例失真、额外页边空白或 PDF 造成的裁切。样本自身是分格和色带构成的合成图片，不含文字内容；底部未闭合的分格来自源图本身，非 PDF 截断。

| PDF 页 | 章节 | 期望 fixture 索引 | 原图及 96 DPI 渲染尺寸 | PDF MediaBox/CropBox | 独立目检 |
| --- | --- | --- | --- | --- | --- |
| 1 | 第一章 | 0 | 720 × 1800 px | 540 × 1350 pt | 灰色分格完整，无空白或额外裁切 |
| 2 | 第一章 | 1 | 720 × 2100 px | 540 × 1575 pt | 浅绿分格完整，长宽比正确 |
| 3 | 第一章 | 2 | 720 × 2400 px | 540 × 1800 pt | 较长绿色分格完整，长宽比正确 |
| 4 | 第二章 | 37 | 720 × 2100 px | 540 × 1575 pt | 章节首图完整，长宽比正确 |
| 5 | 第二章 | 38 | 720 × 2400 px | 540 × 1800 pt | 较长绿色分格完整，长宽比正确 |
| 6 | 第二章 | 39 | 720 × 1800 px | 540 × 1350 pt | 青色分格完整，无多余尾页 |

书签有且仅有两个，顺序和跳转目标为：

1. `第一章 · 出发` → PDF 第 1 页。
2. `第二章 · 抵达` → PDF 第 4 页。

中文书签编码正确。每页仅嵌入一张图片，MediaBox 与 CropBox 相同，旋转为 0。内容矩阵使图片覆盖完整页面，按 0.75 pt/px 等比放置。

除目检外，对每页图像的 FlateDecode 数据和间接 DecodeParms 进行了独立解码，并按 `scripts/reader-smoke.cjs` 的 fixture 公式生成期望 RGB 字节：6 页全部逐字节相等，解码字节数依次为 3,888,000、4,536,000、5,184,000、4,536,000、5,184,000、3,888,000。由此核对原始图像没有遗漏像素、损坏或有损重编码。第 2/4 页和第 3/5 页像素相同是 fixture 取模配色的既定结果，不能凭这一样本区分这些等像素页面间的交换。

## 范围与限制

- 本样本覆盖三种纵向长图比例，没有横向图片。fixture 横图条件为 `index % 6 === 5`，本次每章 3 页对应索引 `[0,1,2,37,38,39]`，未触发该条件。因此本报告不声称已经验证横图、EXIF 旋转或透明 PNG 的视觉结果。
- Poppler 的显示重采样会在分格边界产生少量过渡像素，所以无损性依据是嵌入图像的解码字节比较，而非渲染 PNG 与源图逐字节比较。
- 本环境 `pypdf` 的便捷 `page.images[].image` 提取没有正确应用此样本的间接 DecodeParms；检查采用显式解析 DecodeParms 后的 FlateDecode，不将这一工具提取差异当作 PDF 渲染缺陷。Poppler 全部 6 页均正常渲染。
- `110-pdf-ui-final/result.json` 在检查时仍记录后续 UI 操作 `showTools` 的 `pointer target must be visible and unobscured` 失败，位置为 `scripts/pdf-download-smoke.cjs:28`。PDF 文件和媒体检查结果通过，不代表该次完整 UI smoke 已通过。
