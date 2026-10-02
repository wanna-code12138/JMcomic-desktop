// Public GET only. Do not read credentials, Electron data, usernames or comment bodies into output.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { createLoader } = require('./load-source.cjs')
const load = createLoader()
const { createJmAppApiTransport, JM_API_ENDPOINTS } = load('src/main/content/jmAppApiTransport.ts')
const { createJmApiFetchPort } = load('src/main/content/jmAppApiFetchPort.ts')
const { BUILTIN_JM_API_PROFILES, withRuntimeVersion } = load('src/main/content/jmAppApiProfiles.ts')
const { JM_API_ORIGINS } = load('src/main/content/jmAppApiDomainResolver.ts')
const { parseSettingPayload } = load('src/main/content/jmAppApiSchemas.ts')
const result = { at: new Date().toISOString(), runtime: 'Node fetch with existing production signing/decryption/fetch-port modules', credentials: 'omit', realAccountRequests: 0, requests: [] }
function shape(data) {
  const list = Array.isArray(data?.list) ? data.list : []
  return {
    keys: data && typeof data === 'object' ? Object.keys(data).sort() : [],
    total: data?.total ?? null, itemCount: list.length,
    itemKeys: [...new Set(list.flatMap(item => Object.keys(item ?? {})))].sort(),
    embeddedReplyCount: list.reduce((n, item) => n + (Array.isArray(item.replys) ? item.replys.length : 0), 0),
    flatReplyCount: list.filter(item => item.parent_CID && String(item.parent_CID) !== '0').length,
    spoilers: [...new Set(list.map(item => String(item.spoiler)))].sort(),
    idsDigest: crypto.createHash('sha256').update(JSON.stringify(list.map(item => item.CID))).digest('hex')
  }
}
async function main() {
  let route
  let transport
  for (const origin of JM_API_ORIGINS) {
    const candidate = { apiOrigin: origin, imageOrigin: 'https://cdn-msp.18comic.vip', profile: BUILTIN_JM_API_PROFILES[0] }
    const bootstrap = createJmAppApiTransport({ route: candidate, fetchPort: createJmApiFetchPort(fetch), maxNetworkAttempts: 1, endpoints: { setting: { ...JM_API_ENDPOINTS.setting, timeoutMs: 6000 } } })
    try {
      const setting = parseSettingPayload(await bootstrap.request('setting'))
      result.requests.push({ endpoint: 'setting', origin, ok: true, appVersion: setting.jm3Version })
      route = { ...candidate, profile: withRuntimeVersion(candidate.profile, setting.jm3Version) }
      break
    } catch (error) { result.requests.push({ endpoint: 'setting', origin, ok: false, error: String(error.message).slice(0, 100) }) }
  }
  if (route) {
    transport = createJmAppApiTransport({ route, fetchPort: createJmApiFetchPort(fetch), maxNetworkAttempts: 1, endpoints: { forum: { key: 'forum', path: '/forum', method: 'GET', timeoutMs: 10000, maxResponseBytes: 512 * 1024 } } })
    for (const query of [{ aid: '123456', mode: 'all', page: '1' }, { aid: '123456', mode: 'all', page: '2' }, { aid: '123456', mode: 'manhua', page: '1' }, { aid: '123456', mode: 'all', page: '4' }, { aid: '1173049', mode: 'all', page: '1' }]) {
      try { result.requests.push({ endpoint: 'forum', query, ok: true, shape: shape(await transport.request('forum', query)) }) }
      catch (error) { result.requests.push({ endpoint: 'forum', query, ok: false, error: String(error.message).slice(0, 100) }) }
    }
  }
  fs.writeFileSync(path.join(__dirname, '..', 'public-comments-probe.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
