import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { lockAccountDataDirectory } from '../account/accountInstance'

const events: string[] = []
const app = { setPath(name: string, value: string) { events.push(`${name}:${value}`) }, requestSingleInstanceLock() { events.push('lock'); return false } }
assert.equal(lockAccountDataDirectory(app, resolve('work/account-instance-test')), false, '第二个进程不得同时操作同一会话文件')
assert.equal(events.length, 2)
assert.ok(events[0].startsWith('userData:'))
assert.equal(events[1], 'lock', '必须先确定数据目录再申请单实例锁')
console.log('PASS account instance: data directory before lock, second process rejected')
