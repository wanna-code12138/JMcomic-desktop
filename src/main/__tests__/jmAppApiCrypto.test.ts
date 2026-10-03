import assert from 'node:assert/strict'
import {
  createApiToken,
  createTokenParam,
  decryptApiPayload,
  md5Hex,
  JmApiProtocolError
} from '../content/jmAppApiCrypto'
import {
  BUILTIN_JM_API_PROFILES,
  versionPartFor,
  withRuntimeVersion
} from '../content/jmAppApiProfiles'

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

const ts = 1_700_000_000
const secret = '185Hcomic3PAPP7R'
const cipher = 'Bob/fxq7S4k4XIKPM3ZhGCjslJARsx9KGCTF9S+3YfUhRdPlMwfRiGmUVPSveubO'

test('uses the documented MD5 and token vectors', () => {
  assert.equal(md5Hex('abc'), '900150983cd24fb0d6963f7d28e17f72')
  assert.equal(createApiToken(ts, secret), '880c64833265ad47a928afcf1b1220f5')
  assert.equal(createTokenParam(ts, '2.0.30', true), '1700000000,2.0.30')
  assert.equal(createTokenParam(ts, '2.0.30', false), '1700000000,')
})

test('decrypts the documented AES-256-ECB payload using ASCII MD5 hex key bytes', () => {
  assert.deepEqual(decryptApiPayload(cipher, ts, secret), { code: 200, message: 'fixture' })
})

test('reports malformed envelope input without exposing payload material', () => {
  for (const [input, timestamp, key] of [
    ['not base64!', ts, secret],
    [cipher, ts + 1, secret],
    [cipher, ts, 'wrong-secret']
  ] as const) {
    assert.throws(() => decryptApiPayload(input, timestamp, key), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(error instanceof JmApiProtocolError)
      assert.match(error.message, /^JM_API_PROTOCOL_ERROR:/)
      assert.doesNotMatch(error.message, /Bob\/fxq7|fixture|wrong-secret/)
      return true
    })
  }
})

test('returns valid non-JSON plaintext as a string', () => {
  assert.equal(decryptApiPayload('N6wRZXmm/yudNuwJZX94BQ==', 1, 'test'), 'plain text')
})

const python = BUILTIN_JM_API_PROFILES.find((profile) => profile.id === 'python-current')!
const java = BUILTIN_JM_API_PROFILES.find((profile) => profile.id === 'java-compat')!

test('keeps GET/POST token parameter style profiles distinct', () => {
  assert.equal(versionPartFor(python, 'GET'), '2.0.30')
  assert.equal(versionPartFor(python, 'POST'), '2.0.30')
  assert.equal(versionPartFor(java, 'GET'), '')
  assert.equal(versionPartFor(java, 'POST'), '2.0.20')
})

test('only accepts a semantic three-part runtime version', () => {
  assert.equal(withRuntimeVersion(python, '2.0.33').bootstrapVersion, '2.0.33')
  for (const version of ['2.0', '2.0.3-beta', '2.0.3.4', '', ' 2.0.3']) {
    assert.throws(() => withRuntimeVersion(python, version), /JM_API_PROTOCOL_ERROR:INVALID_VERSION/)
  }
})

test('built-in profile secret literals have a single owner', () => {
  assert.equal(BUILTIN_JM_API_PROFILES.length, 2)
  assert.equal(python.signSecret, '185Hcomic3PAPP7R')
  assert.equal(java.signSecret, '18comicAPP')
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All tests passed!')
