import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const settings = readFileSync(resolve(process.cwd(), 'src/renderer/src/pages/SettingsPage.tsx'), 'utf-8')
const store = readFileSync(resolve(process.cwd(), 'src/renderer/src/stores/appStore.ts'), 'utf-8')

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (error) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

test('settings renders a recommendation preferences dialog from the shared curated tags', () => {
  assert.match(settings, /Dialog/)
  assert.match(settings, /RECOMMENDATION_TAGS/)
  assert.match(settings, /推荐偏好/)
  assert.match(settings, /最多选择 8 个标签/)
  assert.match(settings, /draftRecommendationTags\.length\} \/ 8/)
})

test('dialog filters tags and prevents a ninth selection', () => {
  assert.match(settings, /recommendationTagQuery/)
  assert.match(settings, /tag\.toLowerCase\(\)\.includes\(recommendationTagQuery\.trim\(\)\.toLowerCase\(\)\)/)
  assert.match(settings, /draftRecommendationTags\.length >= 8/)
  assert.match(settings, /disabled=\{[^}]*draftRecommendationTags\.length >= 8/s)
})

test('dialog keeps edits in draft state and persists only on save', () => {
  assert.match(settings, /setDraftRecommendationTags\(recommendationTags\)/)
  assert.match(settings, /settingsSet\(\{ recommendationTags: draftRecommendationTags \}\)/)
  assert.match(settings, />取消<\/Button>/)
  assert.match(settings, />保存<\/Button>/)
})

test('saving preferences invalidates only the ranked recommendation snapshot', () => {
  assert.match(store, /recommendationRevision: number/)
  assert.match(store, /bumpRecommendationRevision: \(\) => void/)
  assert.match(store, /bumpRecommendationRevision: \(\) => set\(\(state\) => \(\{ recommendationRevision: state\.recommendationRevision \+ 1 \}\)\)/)
  assert.match(settings, /bumpRecommendationRevision\(\)/)
})

console.log('\nAll recommendation UI contract tests completed.')
if (process.exitCode) console.log('Some tests failed.')
else console.log('All tests passed!')
