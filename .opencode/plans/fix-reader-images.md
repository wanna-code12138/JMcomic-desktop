# 修复阅读器图片加载问题

## 根因分析

封面图能加载（日志确认 `[jmimg] OK: ... type: image/webp`），但章节图片显示破损图标。两者走同一个 jmimg 处理器，差异在于：

1. **`page_arr` 变量可能不可访问**：`scraperWindow.ts:494` 用 `typeof page_arr !== 'undefined'` 检查，但禁漫天堂可能把 `page_arr` 定义在闭包内。fallback 方法（`data-original`、`img.src`）在 `images: false` 模式下可能产生错误 URL。
2. **Referer 头可能不对**：jmimg 统一用 `https://18comic.vip/` 作为 Referer。封面图在首页展示这是对的，但章节图片在 `/photo/{id}/` 页面展示，CDN 可能检查 Referer 路径。
3. **图片打乱（scramble）**：禁漫天堂的图片被分成条带重排，需 descramble（独立问题，不影响破损图标）。

## 执行步骤

### Step 1：诊断（自动测试）

在 `index.ts` 中临时添加自动测试函数，warmup 完成后自动执行：
- `extractHomepage()` → 取第一个漫画
- `extractMangaDetail()` → 取第一个章节
- `extractChapterPages()` → 打印所有图片 URL 和 debug 信息
- 用 `net.request` 直接请求第一个图片 URL → 打印 HTTP 状态码和 content-type

运行应用，从控制台日志判断根因。

### Step 2：修复 page_arr 提取

在 `scraperWindow.ts` 的 `extractChapterPages` 中：

当 `typeof page_arr === 'undefined'` 时，添加正则 fallback：
```javascript
// 从 HTML 源码正则提取 page_arr
var html = document.documentElement.outerHTML;
var match = html.match(/var page_arr = (\[[\s\S]*?\]);/);
if (match) {
  var arr = JSON.parse(match[1]);
  // 同样从 HTML 提取图片域名
  var domainMatch = html.match(/src="https:\/\/(.*?)\/media\/albums\/blank/);
  var imgDomain = domainMatch ? domainMatch[1] : 'cdn-msp3.18comic.vip';
  arr.forEach(function(f, i) {
    pages.push({ index: i, imageUrl: 'https://' + imgDomain + '/media/photos/' + f });
  });
}
```

### Step 3：修复 Referer

在 `imageProtocol.ts` 中：
- 添加模块级变量 `let currentReferer = ''`
- 导出 `setReferer(url: string)` 函数
- 在 `contentApi.ts` 的 `content:pages` handler 中调用 `setReferer(fullChapterUrl)`
- jmimg 处理器中：对 `/media/photos/` 路径的请求用 `currentReferer` 作为 Referer，`/media/albums/` 继续用首页

### Step 4：图片反打乱

1. `scraperWindow.ts`：提取 `scramble_id`（正则 `var scramble_id = (\d+)`），随 page 数据一起返回
2. `contentApi.ts`：传递 `scrambleId` 给渲染器
3. `ReaderPage.tsx`：`<img onLoad>` 中用 canvas 还原：
   - 将图片分成 10 条横向条带
   - 根据 `scramble_id` 计算重排顺序
   - 用 canvas 重绘并替换 img src

反打乱算法（参考 JMComic Python 项目）：
```
if scramble_id == 0: 不处理
else:
  num_divisions = 10
  for each strip i (0..9):
    source_y = i * (height / 10)
    target_y = (num_divisions - 1 - i) * (height / 10)  // 简化版
    // 实际公式可能更复杂，需根据网站 JS 逆向
```

### Step 5：验证

1. `electron-vite build`
2. 运行应用，进入章节
3. 确认主进程日志：`[jmimg] OK: ... type: image/webp`
4. 确认渲染器：图片正常显示（非破损图标、非打乱）
5. 移除自动测试代码
