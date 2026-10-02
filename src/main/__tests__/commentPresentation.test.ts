import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommentItem } from '../../renderer/src/components/CommentItem'
import type { ComicComment } from '../../shared/commentContracts'

const comment: ComicComment = { id: '1', author: '测试读者', text: '尚未展开的剧透正文', createdAt: '2026-10-02', spoiler: true, likes: 2,
  replies: [{ id: '2', author: '回复者', text: '默认折叠的回复正文', createdAt: '', spoiler: false, likes: null, replies: [] }] }
const html = renderToStaticMarkup(React.createElement(CommentItem, { comment }))
assert.equal(html.includes(comment.text), false, '剧透在展开前不能进入可读正文')
assert.ok(html.includes('显示剧透'))
assert.equal(html.includes(comment.replies[0].text), false, '回复默认折叠')
assert.ok(html.includes('展开 1 条回复'))
const plain = renderToStaticMarkup(React.createElement(CommentItem, { comment: { ...comment, spoiler: false, text: '<script>alert(1)</script>' } }))
assert.ok(plain.includes('&lt;script&gt;'))
assert.equal(plain.includes('<script>'), false)
console.log('PASS comment presentation: spoiler hidden, replies collapsed, escaped plain text')
