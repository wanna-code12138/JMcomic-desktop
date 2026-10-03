import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8').replace(/^\s*#.*$/gm, '')
const steps = workflow.split(/^      - name: /m).slice(1)
const position = pattern => steps.findIndex(step => pattern.test(step))

test('release gates include all discovered tests and type checking before packaging', () => {
  const build = position(/run: npm run package/)
  for (const command of [/run: npm test\s*$/m, /run: npm run typecheck\s*$/m]) {
    const gate = position(command)
    assert.ok(gate >= 0 && gate < build, `Missing pre-package gate: ${command}`)
  }
})

test('release publishes only after the actual EXE smoke test and includes notes and checksums', () => {
  const publish = position(/gh release create/)
  const smoke = position(/node scripts\/package-launch-smoke\.mjs .*--fixture/)
  assert.ok(smoke >= 0 && smoke < publish, 'The delivered EXE must be checked before publishing')
  assert.match(steps[publish], /--verify-tag/)
  assert.match(steps[publish], /--notes-file/)
  assert.match(workflow, /SHA256SUMS\.txt/)
  assert.match(workflow, /Tag and package version mismatch/)
})
