# 1.1.0 视觉探索提示词

日期：2026-09-29。使用内置 image_gen 工具；未使用 API 密钥或 CLI 回退。概念稿随后获准实施，正式图标已生成并接入应用。

界面图已目检：三栏结构、新标签入口、继续阅读、收藏/离线入口和最近关闭均可辨认。图片中的示例章节数、书名、页面文案只用于构图，功能与最终文案以设计文档为准。

图标已目检：书页与书签轮廓清楚；透明边缘仍有少量生成杂点。此图仅用于确认造型和颜色，正式图标需继续清理并验证各尺寸，不能直接当作合格 ICO 发布。

## 正式图标

最终原图 `build/icon-source.png`，使用下列内置 image_gen 提示词重新生成平面版本。先前针对边缘的局部修改未获得足够干净的结果，未采用。正式版本经项目 `scripts/build-icon.mjs` 转换为 16/24/32/48/64/128/256/1024 PNG 和七尺寸 ICO，原图透明度保留。已核对 256px 轮廓，全部尺寸与 ICO 条目验证通过。

```text
Use case: logo-brand. Final production icon for a polished Windows desktop comic reader. A crisp, flat geometric application icon. One cobalt blue rounded square with smooth edges, centered, filling 84 percent of square canvas. A simple symmetrical white open book made of just two bold page silhouettes, with a small amber bookmark on the right page. Perfect clean cutout on transparent background, fully transparent 8 percent margin. Hard clean edges with normal antialiasing only. Flat blue and white solid fills, no gradients, no texture, no noise, no brushwork, no shadows, no glow, no bevels, no particles, no stray marks, no text, no letters. Must look excellent at 16px and 32px. Vector-like logo rendered as PNG.
```

## 界面概念图

输出：[workspace-concept.png](workspace-concept.png)

```text
Use case: ui-mockup. Create one premium, highly polished, realistic Chinese Windows desktop manga reading app UI concept screenshot for JMComic Desktop 1.1.0. This is a visual design proposal, not marketing. Landscape 16:10, full app window edge-to-edge with compact 32px Windows title bar. Inspired by the clarity, tab ergonomics and disciplined density of Microsoft Edge and VS Code, with an original visual identity. Light theme: warm off-white chrome, white content, graphite typography, precise pale hairline dividers, restrained cobalt-blue action accent. No glass blur, no bright gradients, no giant empty panels. Native Segoe UI/Microsoft YaHei-like legible Chinese typography. Layout: left 64px icon navigation rail (home, books, search, heart, downloads, settings); middle 340px artwork detail pane with small tasteful blue-green coastal landscape manga cover, title 山间来信, author and short description, blue 开始阅读 button, subtle 下载 button, chapters 第一章 启程 / 第二章 海风 / 第三章 归途. Right about 70 percent width reading workspace with a compact 40px Edge-like tab strip: pinned 山间来信 tab, 海边日记 tab, active 新标签页 tab each with a subtle X, plus + button and far right compact all-tabs dropdown and expand/hide icons. Display a beautifully designed NEW TAB PAGE within reader workspace: small icon of an open book, title 继续你的阅读, compact search field 搜索作品名称或输入编号, one horizontal 继续阅读 row for 山间来信 with slim progress indicator 第 8 / 36 页 and action 继续, then two understated shortcuts 我的收藏 and 离线书库, then a compact 最近关闭 section with two text rows. Strong alignment, generous but practical whitespace, no huge dashboard cards or filler. Middle/detail and right workspace share a thin draggable divider with subtle handle. Draw controls with one coherent crisp 1.5px outline icon language. Native window controls at top right. Screen title JMComic Desktop. Small app icon is a folded open book inside cobalt rounded square with small warm amber bookmark. No people, no sexual content; all cover imagery is original landscape illustration. Tiny version 1.1.0 in status area only. Make it believable, usable and elegant; no floating editorial annotations, no perspective or device frame.
```

## 应用图标概念图

输出：[app-icon-concept.png](app-icon-concept.png)

```text
Use case: logo-brand. Asset type: Windows desktop application icon proposal for JMComic Desktop, a comic book reader. Generate a single centered, beautifully precise app icon, 1024x1024 square image, with truly transparent background outside the icon. The icon itself occupies about 88 percent of canvas width and height: a cobalt blue rounded square tile with gently rounded corners, almost flat with a restrained soft tonal change from brighter upper left to deeper lower right, no glossy plastic and no surrounding drop shadow. A bold white open-book mark formed by two clean folded pages, elegant negative space suggesting an M at the fold. Small warm amber bookmark ribbon attached to the top of the right page, simple single folded notch. Highly legible silhouette at 16px and 32px, broad shapes, thick clean contours, no fine lines, no letters or words, no extra floating book pages. Modern Windows fluent craftsmanship, original brand mark, visually coherent with a clean graphite / warm white / cobalt manga reading application. Straight-on perfectly square framing, no perspective, no mockup, no device, no text, no watermark. Keep the center of gravity balanced and the book about 62 percent of tile width.
```
