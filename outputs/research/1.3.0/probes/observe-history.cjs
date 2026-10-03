// Source-only investigation. Synthetic identities, no Electron and no network.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createLoader } = require('./load-source.cjs')
const ref = '6fdc90a7d700480e12480c6bac2fe41380894aed'
const load = createLoader(ref)
const { parseComments } = load('src/main/account/engagementCore.ts')
const { createAccountService } = load('src/main/account/accountService.ts')
const { createAccountSessionLeaseManager } = load('src/main/account/accountSessionLease.ts')
const { createEconomicActivityCoordinator } = load('src/main/account/economicActivityCoordinator.ts')
const turn = () => new Promise(resolve => setImmediate(resolve))

function harness() {
  const calls = { login: 0, profile: 0 }
  const route = { apiHostId: 'synthetic', apiOrigin: 'https://example.invalid', routeKey: 'synthetic', protocolProfileId: 'synthetic', appVersion: '0.0.0' }
  let releaseLogin
  let blockLogin = false
  const client = {
    async loginOnce() {
      calls.login++
      if (blockLogin) await new Promise(resolve => { releaseLogin = resolve })
      return { uid: '101', username: 'synthetic-user', s: 'synthetic-session', coin: '0' }
    },
    async getProfile() { calls.profile++; return { nickName: 'Synthetic' } },
    async logoutOnce() {}
  }
  const manager = createAccountSessionLeaseManager({
    createSession: async () => ({}), registerSession: async () => () => {},
    createClient: () => client, disposeSession: async () => {}
  })
  const service = createAccountService({
    leaseManager: manager, credentialRoute: route, installCandidateAvs: async () => {},
    vault: { load: async () => ({ state: 'missing', persistence: 'none' }), save: async () => ({ persistence: 'none' }), clear: async () => ({ ok: true }) },
    economicActivity: createEconomicActivityCoordinator({ getActiveEconomicSendCount: () => 0 })
  })
  return { service, calls, block: () => { blockLogin = true }, release: () => releaseLogin(), ready: () => Boolean(releaseLogin) }
}

async function main() {
  const observations = []
  const parsed = parseComments({ total: '1', list: [{ CID: '1', UID: '2', AID: '3', content: 'synthetic root', spoiler: '2', replys: [{ CID: '4', UID: '5', content: 'synthetic reply', parent_CID: '1' }] }] })
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].replies.length, 0)
  assert.equal(parsed.items[0].spoiler, false)
  observations.push({ case: 'upstream_replys_and_spoiler_2', expected: { replies: 1, spoiler: true }, observed: { replies: parsed.items[0].replies.length, spoiler: parsed.items[0].spoiler }, finding: 'historical_parser_defects_reproduced' })
  const ordinary = parseComments({ total: '1', list: [{ CID: '6', UID: '7', content: 'ordinary synthetic comment', spoiler: '1' }] })
  assert.equal(ordinary.items[0].spoiler, true)
  observations.push({ case: 'upstream_spoiler_1', expected: { spoiler: false }, observed: { spoiler: true }, finding: 'historical_parser_marks_ordinary_comments_as_spoilers' })
  const malformed = parseComments({ unexpected: 'schema' })
  assert.deepEqual(malformed, { items: [], total: null })
  observations.push({ case: 'malformed_comment_envelope', expected: 'schema_error', observed: 'empty_page', finding: 'schema_failure_can_appear_as_no_comments' })
  const h = harness()
  const login = await h.service.login({ username: 'synthetic-user', password: 'synthetic-only', rememberSession: false, expectedSessionGeneration: 0 })
  assert.equal(login.ok, true)
  const scope = h.service.captureAccountCall(1)
  const before = h.calls.profile
  const validated = await h.service.ensureSessionValidated(scope)
  assert.equal(validated.ok, true)
  assert.equal(h.calls.profile, before)
  observations.push({ case: 'ensureSessionValidated', observed: { phase: h.service.getStatus().phase, additionalNetworkCalls: 0 }, finding: 'local_lease_check_only_not_remote_validation' })
  h.service.noteUpstreamAuthFailure(scope)
  await turn()
  assert.equal(h.service.getStatus().phase, 'verification-required')
  observations.push({ case: 'current_scope_auth_failure', observed: 'whole_account_verification_required', finding: 'no_endpoint_specific_degradation' })
  let staleIgnored = 0
  for (let n = 0; n < 100; n++) {
    const r = harness()
    await r.service.login({ username: 'synthetic-user', password: 'synthetic-only', rememberSession: false, expectedSessionGeneration: 0 })
    const old = r.service.captureAccountCall(1)
    r.block()
    const reauth = r.service.reauthenticate({ password: 'synthetic-only', expectedSessionGeneration: 1 })
    while (!r.ready()) await turn()
    // Queue the old scope's failure while reauthentication owns the lifecycle queue.
    r.service.noteUpstreamAuthFailure(old)
    r.release()
    assert.equal((await reauth).ok, true)
    await turn()
    assert.equal(r.service.getStatus().phase, 'authenticated')
    assert.equal(r.service.getStatus().generation, 2)
    staleIgnored++
  }
  observations.push({ case: 'old_401_queued_during_reauthentication', iterations: staleIgnored, staleIgnored, finding: 'latest_historical_double_check_protects_this_interleaving' })
  const result = { ref, realAccountRequests: 0, synthetic: true, observations }
  fs.writeFileSync(path.join(__dirname, '..', 'history-observations.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
