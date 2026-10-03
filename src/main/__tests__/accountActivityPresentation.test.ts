import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AccountPage from '../../renderer/src/pages/AccountPage'
import CommentComposer from '../../renderer/src/components/CommentComposer'
import { CommentItem } from '../../renderer/src/components/CommentItem'
import { useAccountStore } from '../../renderer/src/stores/accountStore'

useAccountStore.setState({ state: { generation: 1, phase: 'authenticated', remembered: false,
  profile: { uid: '7', username: 'synthetic', nickname: '测试账户', level: null, coins: null, experience: null, favorites: null, favoriteLimit: null, checkedAt: 0 } } })
// Inspect markup for the current browser store snapshot, rather than Zustand's anonymous SSR seed.
const serverHook = React.useSyncExternalStore
React.useSyncExternalStore = (_subscribe, getSnapshot) => getSnapshot()
const page = renderToStaticMarkup(React.createElement(AccountPage))
assert.ok(page.includes('我的评论'), '账户应有我的评论入口')
assert.ok(page.includes('活动'), '账户应有手动签到和任务入口')
const form = renderToStaticMarkup(React.createElement(CommentComposer, { albumId: '123', parentId: '0', onSent() {}, onCancel() {} }))
assert.ok(form.includes('公开发表'), '公开发送必须有明确按钮')
assert.ok(form.includes('maxLength="2000"') || form.includes('maxlength="2000"'))
const comment = renderToStaticMarkup(React.createElement(CommentItem, { comment: { id: '7', author: '读者', parentId: '8', text: '回复内容', createdAt: '', spoiler: false, likes: null, replies: [] }, onReply() {} }))
assert.ok(comment.includes('回复'), '扁平回复应标明回复并提供明确入口')
console.log('PASS activity UI: own comments and activity navigation, explicit public submit, bounded text, reply context')
React.useSyncExternalStore = serverHook
