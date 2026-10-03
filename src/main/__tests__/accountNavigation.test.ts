import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AppNavigation from '../../renderer/src/components/AppNavigation'

const html = renderToStaticMarkup(React.createElement(AppNavigation))
assert.ok(html.includes('aria-label="账户"'), '正常导航中必须有可访问的账户入口')
assert.ok(html.includes('aria-label="收藏"'), '本地收藏入口保留')
console.log('PASS account navigation accessibility')
