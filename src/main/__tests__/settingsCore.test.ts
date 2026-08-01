import assert from 'assert'
import { DEFAULT_SETTINGS, normalizeSettings, validateProxyUrl } from '../settingsCore'

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

// ─── normalizeSettings ─────────────────────────────────────────────

test('empty input returns defaults', () => {
  const s = normalizeSettings({})
  assert.deepStrictEqual(s, DEFAULT_SETTINGS)
})

test('parses stored string values', () => {
  const s = normalizeSettings({
    themeMode: 'dark',
    micaEnabled: 'false',
    solidWindow: 'true',
    proxyEnabled: 'true',
    proxyUrl: 'http://127.0.0.1:7890',
    cacheLimitMb: '2048'
  })
  assert.strictEqual(s.themeMode, 'dark')
  assert.strictEqual(s.micaEnabled, false)
  assert.strictEqual(s.solidWindow, true)
  assert.strictEqual(s.proxyEnabled, true)
  assert.strictEqual(s.proxyUrl, 'http://127.0.0.1:7890')
  assert.strictEqual(s.cacheLimitMb, 2048)
})

test('accepts boolean/number inputs from IPC patch', () => {
  const s = normalizeSettings({ micaEnabled: true, cacheLimitMb: 500 })
  assert.strictEqual(s.micaEnabled, true)
  assert.strictEqual(s.cacheLimitMb, 500)
})

test('invalid values fall back to defaults', () => {
  const s = normalizeSettings({ themeMode: 'neon', micaEnabled: 'maybe', cacheLimitMb: 'abc' })
  assert.strictEqual(s.themeMode, 'system')
  assert.strictEqual(s.micaEnabled, true)
  assert.strictEqual(s.cacheLimitMb, 1000)
})

test('cacheLimitMb clamps to 100..5000', () => {
  assert.strictEqual(normalizeSettings({ cacheLimitMb: 1 }).cacheLimitMb, 100)
  assert.strictEqual(normalizeSettings({ cacheLimitMb: 99999 }).cacheLimitMb, 5000)
})

test('partial patch keeps other settings', () => {
  const base = normalizeSettings({ themeMode: 'dark', micaEnabled: false })
  const merged = normalizeSettings({ ...base, solidWindow: true })
  assert.strictEqual(merged.themeMode, 'dark')
  assert.strictEqual(merged.micaEnabled, false)
  assert.strictEqual(merged.solidWindow, true)
})

// ─── validateProxyUrl ──────────────────────────────────────────────

test('proxy url accepts http proxy', () => {
  assert.strictEqual(validateProxyUrl('http://127.0.0.1:7890'), 'http://127.0.0.1:7890')
})

test('proxy url accepts socks5 proxy', () => {
  assert.strictEqual(validateProxyUrl('socks5://127.0.0.1:1080'), 'socks5://127.0.0.1:1080')
})

test('proxy url normalizes bare host:port', () => {
  assert.strictEqual(validateProxyUrl('127.0.0.1:7890'), 'http://127.0.0.1:7890')
})

test('proxy url rejects missing port', () => {
  assert.strictEqual(validateProxyUrl('http://127.0.0.1'), null)
})

test('proxy url rejects unsupported scheme', () => {
  assert.strictEqual(validateProxyUrl('ftp://127.0.0.1:21'), null)
})

test('proxy url rejects empty input', () => {
  assert.strictEqual(validateProxyUrl(''), null)
  assert.strictEqual(validateProxyUrl('   '), null)
})

console.log('\nAll tests completed.')
if (process.exitCode) {
  console.log('Some tests failed.')
} else {
  console.log('All tests passed!')
}
