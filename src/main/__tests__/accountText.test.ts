import assert from 'node:assert/strict'
import { accountTextKey } from '../account/accountText'

assert.equal(accountTextKey('JMDesktop验收标签'), 'JMDesktop驗收標籤', '写入标签需采用服务端回读的繁体键，才能按显示名称取消')
assert.equal(accountTextKey('JMDesktop驗收標籤'), 'JMDesktop驗收標籤')
assert.equal(accountTextKey('https://example.com/path?a=1'), 'https://example.com/path?a=1')
console.log('PASS account text: simplified/traditional identity and unchanged ASCII')
