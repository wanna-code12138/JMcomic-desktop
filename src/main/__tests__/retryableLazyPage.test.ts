import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createRetryableLazyPage } from '../../renderer/src/components/retryableLazyPage'

test('module retry gets a new lazy identity and can recover from a rejected import', async () => {
  let calls = 0
  const page = createRetryableLazyPage(async () => {
    calls++
    if (calls === 1) throw new Error('synthetic failed import')
    return { default: () => React.createElement('span', null, 'loaded') }
  })
  const render = (attempt: number) => renderToString(React.createElement(React.Suspense, { fallback: 'loading' }, React.createElement(page.get(attempt))))
  const original = page.get(0)
  render(0)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(page.get(0), original)
  assert.notEqual(page.get(1), original)
  render(1)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.match(render(1), /<span>loaded<\/span>/)
  assert.equal(calls, 2)
})
