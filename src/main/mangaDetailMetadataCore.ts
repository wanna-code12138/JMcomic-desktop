const AUTHOR_SELECTOR = '[data-type="author"] a'
const TAG_SELECTOR = '[data-type="tags"] a'

/**
 * 生成在 scraper BrowserWindow 内执行的元数据提取片段。
 * 站点会同时渲染手机端和桌面端元数据，因此必须按首次出现顺序去重。
 */
export function buildDetailMetadataExtractionScript(): string {
  return `
        function collectUniqueMetadata(selector) {
          var values = [];
          var seen = {};
          document.querySelectorAll(selector).forEach(function(el) {
            var value = (el.textContent || '').trim();
            if (!value || seen[value]) return;
            seen[value] = true;
            values.push(value);
          });
          return values;
        }

        var author = collectUniqueMetadata('${AUTHOR_SELECTOR}').join(', ');
        var tags = collectUniqueMetadata('${TAG_SELECTOR}');
  `
}
