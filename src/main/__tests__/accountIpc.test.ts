import assert from 'node:assert/strict'
import { isTrustedAccountSender } from '../account/accountIpc'

const main = { mainFrame: {} }, hidden = { mainFrame: {} }
assert.equal(isTrustedAccountSender({ sender: hidden, senderFrame: hidden.mainFrame }, main), false, '隐藏抓取窗口不能访问账户凭据入口')
assert.equal(isTrustedAccountSender({ sender: main, senderFrame: {} }, main), false, '子 frame 不得调用账户 IPC')
assert.equal(isTrustedAccountSender({ sender: main, senderFrame: main.mainFrame }, main), true)
assert.equal(isTrustedAccountSender({ sender: main, senderFrame: null }, undefined), false)
console.log('PASS account IPC sender: only exact trusted main frame')
