import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchImageStream } from '../imageStreamFetch'

const url = 'https://cdn-msp.18comic.vip/a.jpg'
const jpeg = new Uint8Array([255, 216, 255, 224, 1, 2])

test('duplicate consumers receive independent streams and cache only complete images', async () => {
  let cached = 0
  const result = await fetchImageStream(url, async () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }), { cache: async () => { cached++ } })
  const a = result.takeStream!()
  const b = result.takeStream!()
  assert.deepEqual(await new Response(a).arrayBuffer(), await new Response(b).arrayBuffer())
  await result.done
  assert.equal(cached, 1)
})

test('total timeout remains active after response headers', async () => {
  let canceled = false
  const result = await fetchImageStream(url, async () => new Response(new ReadableStream({ cancel() { canceled = true } }), { headers: { 'content-type': 'image/jpeg' } }), { totalMs: 15, firstByteMs: 100 })
  await assert.rejects(new Response(result.takeStream!()).arrayBuffer(), /timeout/)
  await result.done
  assert.equal(canceled, true)
})

test('aborting before response headers settles the fetch promptly', async () => {
  const controller = new AbortController()
  const pending = fetchImageStream(url, async () => new Promise<Response>(() => {}), { signal: controller.signal })
  controller.abort()
  const result = await pending
  assert.equal(result.status, 499)
})

test('oversized and invalid images never enter the cache', async () => {
  for (const body of [jpeg, new TextEncoder().encode('<html>bad</html>')]) {
    let cached = false
    const result = await fetchImageStream(url, async () => new Response(body, { headers: { 'content-type': 'image/jpeg' } }), { maxBytes: 4, cache: async () => { cached = true } })
    await assert.rejects(new Response(result.takeStream!()).arrayBuffer())
    await result.done
    assert.equal(cached, false)
  }
})
