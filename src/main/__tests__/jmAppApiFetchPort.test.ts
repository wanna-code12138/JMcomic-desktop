import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createJmApiFetchPort } from '../content/jmAppApiFetchPort'

const request = { url: 'https://www.cdnhjk.net/setting', method: 'GET', headers: {}, maxResponseBytes: 8 }

test('bounded API fetch uses anonymous manual redirect requests', async () => {
  const port = createJmApiFetchPort(async (_url, init) => {
    assert.equal(init.credentials, 'omit')
    assert.equal(init.redirect, 'manual')
    return new Response('ok', { headers: { 'content-type': 'application/json' } })
  })
  assert.equal((await port.send(request)).bodyText, 'ok')
})

test('bounded API fetch cancels oversized streams before buffering all data', async () => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new TextEncoder().encode('汉汉汉')) },
    cancel() { cancelled = true }
  })
  const port = createJmApiFetchPort(async () => new Response(body))
  await assert.rejects(port.send(request), /RESPONSE_TOO_LARGE/)
  assert.equal(cancelled, true)
})

test('bounded API fetch aborts while reading a stalled response body', async () => {
  const controller = new AbortController()
  let cancelled = false
  const port = createJmApiFetchPort(async () => new Response(new ReadableStream({ cancel() { cancelled = true } })))
  const pending = port.send({ ...request, signal: controller.signal })
  setTimeout(() => controller.abort(new Error('API_TIMEOUT')), 10)
  await assert.rejects(pending, /API_TIMEOUT/)
  assert.equal(cancelled, true)
})
