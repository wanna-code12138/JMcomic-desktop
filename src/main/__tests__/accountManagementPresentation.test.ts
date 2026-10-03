import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AccountPage from '../../renderer/src/pages/AccountPage'
import OnlineLibraryPanel from '../../renderer/src/components/OnlineLibraryPanel'
import { useAccountStore } from '../../renderer/src/stores/accountStore'

useAccountStore.setState({ state: { generation: 1, phase: 'authenticated', remembered: false,
  profile: { uid: '7', username: 'synthetic', nickname: '测试账户', level: null, coins: null, experience: null, favorites: null, favoriteLimit: null, checkedAt: 0 } } })
const serverHook = React.useSyncExternalStore
try {
  React.useSyncExternalStore = (_subscribe, getSnapshot) => getSnapshot()
  const page = renderToStaticMarkup(React.createElement(AccountPage))
  assert.ok(page.includes('收藏标签'), '账户收藏标签应有独立入口')
  assert.ok(page.includes('资料'), '资料应有明确入口')
  const library = renderToStaticMarkup(React.createElement(OnlineLibraryPanel, { kind: 'favorites', visible: true }))
  assert.ok(library.includes('管理在线收藏夹'), '在线收藏夹管理应与本地收藏区分')
  console.log('PASS management navigation: account tags/profile and online folder controls')
} finally { React.useSyncExternalStore = serverHook }
