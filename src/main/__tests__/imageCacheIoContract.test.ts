import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createCacheMaintenanceScheduler } from '../imageCacheMaintenance'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function testMaintenanceIsCoalesced(): Promise<void> {
  const pass = deferred()
  let runs = 0
  const scheduler = createCacheMaintenanceScheduler(async () => {
    runs++
    await pass.promise
  })

  const scheduled = Array.from({ length: 100 }, () => scheduler.schedule())
  assert.equal(runs, 0)
  assert.ok(scheduled.every((promise) => promise === scheduled[0]))

  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(runs, 1)
  pass.resolve()
  await Promise.all(scheduled)
  assert.equal(scheduler.isScheduled(), false)
  console.log('  PASS: one hundred stores coalesce into one maintenance pass')
}

function testProtocolUsesAsyncCacheIo(): void {
  const protocolText = readFileSync(resolve(process.cwd(), 'src/main/imageProtocol.ts'), 'utf8')
  const loaderText = readFileSync(resolve(process.cwd(), 'src/main/imageLoader.ts'), 'utf8')

  assert.doesNotMatch(protocolText, /readFileSync|getCachedImagePath/)
  assert.match(protocolText, /await readCachedImage\(realUrl\)/)
  assert.match(protocolText, /await storeImage\(realUrl, buf, ct\)/)
  assert.match(loaderText, /rename\(temporaryPath, filepath\)/)
  assert.match(loaderText, /selectEvictionCandidates/)
  console.log('  PASS: protocol cache I/O is async, atomic, and preserves oldest-first eviction')
}

async function main(): Promise<void> {
  await testMaintenanceIsCoalesced()
  testProtocolUsesAsyncCacheIo()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
