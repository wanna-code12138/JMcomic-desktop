import assert from 'node:assert/strict'
import { buildDetailMetadataExtractionScript } from '../mangaDetailMetadataCore'

type FakeElement = { textContent: string }

function elements(values: string[]): FakeElement[] {
  return values.map((textContent) => ({ textContent }))
}

function runExtraction(): { author: string; tags: string[] } {
  const document = {
    querySelectorAll(selector: string): FakeElement[] {
      if (selector === '[data-type="author"] a') {
        return elements([' MALPOI ', '達蘭', 'MALPOI', ''])
      }
      if (selector === '[data-type="tags"] a') {
        return elements(['护理师', '欲求不满', '护理师', ' '])
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
console.log('  PASS: detail author excludes works and actor metadata and removes responsive duplicates')

assert.deepEqual(result.tags, ['护理师', '欲求不满'])
console.log('  PASS: detail tags exclude recommendation cards and preserve first-seen order')
