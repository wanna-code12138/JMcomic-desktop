import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const settings = readFileSync(resolve(process.cwd(), 'src/renderer/src/pages/SettingsPage.tsx'), 'utf-8')
const store = readFileSync(resolve(process.cwd(), 'src/renderer/src/stores/appStore.ts'), 'utf-8')
const home = readFileSync(resolve(process.cwd(), 'src/renderer/src/pages/HomePage.tsx'), 'utf-8')

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

test('recommended tab uses ranked candidate pools while latest and popular keep the existing stream', () => {
  assert.match(home, /if \(tab === 'recommended'\)/)
  assert.match(home, /contentRecommendations\(recommendationTagOffset\.current\)/)
  assert.match(home, /buildRecommendationFeed\(/)
  assert.match(home, /contentHomepageStream\(category\)/)
  assert.match(home, /fetchCategory\(tab, cancelled\)/)
})

test('recommended feed starts at 24 and reveals 12 more through a bottom sentinel', () => {
  assert.match(home, /nextRecommendationVisibleCount\(0, feed\.length\)/)
  assert.match(home, /nextRecommendationVisibleCount\(current, recommendationFeed\.length\)/)
  assert.match(home, /new IntersectionObserver/)
  assert.match(home, /bottomSentinelRef/)
  assert.match(home, /recommendationFeed\.slice\(0, recommendationVisibleCount\)/)
})

test('recommended feed persists exposure timestamps and offers manual refresh', () => {
  assert.match(home, /localStorage\.getItem\(RECOMMENDATION_EXPOSURE_KEY\)/)
  assert.match(home, /localStorage\.setItem\(RECOMMENDATION_EXPOSURE_KEY/)
  assert.match(home, /recordRecommendationExposures\(/)
  assert.match(home, /recommendationRevision/)
  assert.match(home, />换一批<\/Button>/)
})

test('recommended grid contains only ranked cards and no random sentinel', () => {
  assert.doesNotMatch(home, /__random__|RANDOM_CARD|RANDOM_COVER/)
  assert.doesNotMatch(home, /\[RANDOM_CARD,\s*\.\.\.visibleCards\]/)
  assert.match(home, /\{visibleCards\.map\(/)
})

test('leaving the recommended tab invalidates its in-flight request', () => {
  assert.match(home, /if \(tab === 'recommended'\) recommendationRequestId\.current\+\+/)
})

test('home recommendation ranking never reads implicit local-interest APIs', () => {
  assert.doesNotMatch(
    home,
    /favoritesList|historyListLocal|searchHistoryList|downloadList|reading_history|search_history/
  )
})

console.log('\nAll recommendation UI contract tests completed.')
if (process.exitCode) console.log('Some tests failed.')
else console.log('All tests passed!')
