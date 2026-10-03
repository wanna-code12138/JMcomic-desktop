import assert from 'node:assert/strict'
import { buildDetailMetadataExtractionScript } from '../mangaDetailMetadataCore'

type FakeElement = { textContent: string }

function elements(values: string[]): FakeElement[] {
  return values.map((textContent) => ({ textContent }))
}

function runExtraction(): { author: string; tags: string[] } {
  const document = {
    querySelectorAll(selector: string): FakeElement[] {
      if (selector === '[data-type="author"] a[name="vote_"].visible') {
        return elements([' MALPOI ', '達蘭', 'NTR', 'MALPOI', ''])
      }
      if (selector === '[data-type="tags"] a[name="vote_"].visible') {
        return elements(['韓漫', '連載中', '剧情', '恋爱', '熟女', '像评论的长标签', '韓漫'])
      }
      throw new Error(`unexpected broad selector: ${selector}`)
    }
  }

  return Function(
    'document',
    `${buildDetailMetadataExtractionScript()}\nreturn { author: author, tags: tags };`
  )(document) as { author: string; tags: string[] }
}

const result = runExtraction()
assert.equal(result.author, 'MALPOI, 達蘭')
console.log('  PASS: detail author keeps only the first two canonical visible values')

assert.deepEqual(result.tags, ['韓漫', '連載中', '剧情', '恋爱', '熟女'])
console.log('  PASS: detail tags keep only the first five canonical visible values')
