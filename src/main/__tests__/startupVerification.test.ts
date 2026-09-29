import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { loadModule } from './helpers/loadModule'
import { createWarmupCoordinator } from '../sessionWarmup'

test('the real application starts verification before online prewarm, after applying proxy settings', async () => {
  const calls: string[] = []
  const app = Object.assign(new EventEmitter(), { whenReady: () => Promise.resolve(), quit() {}, exit() {} })
  class Window extends EventEmitter {
    webContents = { setWindowOpenHandler() {}, send() {}, isDestroyed: () => false }
    constructor() { super(); calls.push('window') }
    loadFile() { calls.push('renderer') }
    show() {}
    setTitleBarOverlay() {}
    static getAllWindows() { return [] }
  }
  const noop = () => {}
  loadModule('src/main/index.ts', {
    electron: { app, BrowserWindow: Window, dialog: { showErrorBox: (...args: unknown[]) => { throw Error(String(args)) } }, shell:{}, ipcMain:{handle:noop} },
    '@electron-toolkit/utils': { is: { dev:false } },
    './ipc': { registerIpcHandlers:noop },
    './performanceDiagnosticsIpc': { registerPerformanceDiagnosticsIpc:noop },
    './database': { closeDatabase:noop, getDatabaseRecoveryNotice:()=>'' },
    './networkProbe': { startPeriodicProbe:noop, applyManualProxy:async()=>{ calls.push('proxy') } },
    './imageProtocol': { registerImageProtocol:noop, registerImageScheme:noop },
    './localImageProtocol': { registerLocalImageProtocol:noop, registerLocalImageScheme:noop },
    './imageLoader': { setImageCacheLimit:noop },
    './settingsStore': { getSettings:async()=>({cacheLimitMb:100,proxyEnabled:false,proxyUrl:''}) },
    './windowChrome': { applyWindowBackground:noop, backgroundMaterialFor:noop, windowBackgroundColorFor:noop },
    './downloadManager': { initDownloadManager:()=>calls.push('downloads'), stopDownloadManager:noop, resumeDownloadManager:noop },
    './shutdownController': { createShutdownController:()=>({prepare:async()=>{}}) },
    './downloadExport': { registerDownloadExport:noop, stopDownloadExports:noop, resumeDownloadExports:noop },
    './contentApi': { warmAnonymousContentProvider:async()=>{calls.push('prewarm')} },
    './sessionWarmup': { warmupSession:()=>{ calls.push('verification'); return new Promise(()=>{}) } }
  }, 'const __dirname = "test-main"')
  await new Promise(resolve=>setImmediate(resolve))
  assert.ok(calls.indexOf('verification') >= 0, `startup must start verification: ${calls}`)
  assert.ok(calls.indexOf('proxy') < calls.indexOf('window'), 'configure the network before rendering starts requests')
  assert.ok(calls.indexOf('verification') < calls.indexOf('prewarm'), 'verification must be scheduled before background online work')
  assert.ok(calls.includes('downloads'), 'local recovery must continue while startup verification is pending')
})

test('background fallbacks join startup verification but cannot open another dialog after failure', async () => {
  let attempts = 0
  let finish!: (value: any) => void
  const coordinator = createWarmupCoordinator({runVerification:()=>{
    attempts++
    return new Promise(resolve=>{finish=resolve})
  }})
  const window = {} as any
  const startup = coordinator.ensureWarmup('startup', window)
  assert.strictEqual(coordinator.ensureWarmup('browser-fallback', window), startup)
  finish({phase:'failed',reason:'timeout',retryable:true})
  await startup
  void coordinator.ensureWarmup('browser-fallback', window)
  assert.equal(attempts, 1, 'background content requests must not unexpectedly reopen verification')
  const retry = coordinator.retryWarmup(window)
  assert.equal(attempts, 2, 'an explicit retry can show verification again')
  finish({phase:'verified',verifiedAt:1,evidence:'known-page'})
  await retry
})
