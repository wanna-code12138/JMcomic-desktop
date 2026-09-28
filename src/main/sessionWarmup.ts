import { BrowserWindow, WebContentsView, session, ipcMain } from 'electron'
import {
  reduceWarmupState,
  type WarmupState,
  type WarmupReason,
  type WarmupEvent
} from '../shared/sessionWarmupContracts'

export type WarmupListener = (state: WarmupState) => void

export interface WarmupCoordinatorOptions {
  runVerification?: (
    reason: WarmupReason,
    hostWindow: BrowserWindow,
    attempt: number
  ) => Promise<WarmupState>
}

export interface WarmupCoordinator {
  getWarmupState(): WarmupState
  ensureWarmup(reason: WarmupReason, hostWindow: BrowserWindow): Promise<WarmupState>
  retryWarmup(hostWindow: BrowserWindow): Promise<WarmupState>
  subscribeWarmup(listener: WarmupListener): () => void
  reset(): void
}

export function createWarmupCoordinator(options?: WarmupCoordinatorOptions): WarmupCoordinator {
  let state: WarmupState = { phase: 'idle' }
  const listeners = new Set<WarmupListener>()
  let activeAttempt: Promise<WarmupState> | null = null
  let currentAttempt = 0
  let generation = 0

  function dispatch(event: WarmupEvent): WarmupState {
    const next = reduceWarmupState(state, event)
    state = next
    for (const listener of listeners) {
      try {
        listener(state)
      } catch (err) {
        console.error('[sessionWarmup] listener error:', err)
      }
    }
    return state
  }

  function getWarmupState(): WarmupState {
    return state
  }

  function subscribeWarmup(listener: WarmupListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function reset(): void {
    generation++
    activeAttempt = null
    currentAttempt = 0
    dispatch({ type: 'reset' })
  }

  async function executeVerification(
    reason: WarmupReason,
    hostWindow: BrowserWindow
  ): Promise<WarmupState> {
    currentAttempt++
    const token = generation
    dispatch({ type: 'start', reason, attempt: currentAttempt })

    if (options?.runVerification) {
      const result = await options.runVerification(reason, hostWindow, currentAttempt)
      if (generation !== token) return state
      state = result
      for (const listener of listeners) {
        try {
          listener(state)
        } catch {}
      }
      return state
    }

    return defaultElectronVerification(reason, hostWindow, (event) => generation === token ? dispatch(event) : state)
  }

  function ensureWarmup(reason: WarmupReason, hostWindow: BrowserWindow): Promise<WarmupState> {
    if (state.phase === 'verified') {
      return Promise.resolve(state)
    }
    if (activeAttempt) {
      return activeAttempt
    }
    const pending = executeVerification(reason, hostWindow).finally(() => {
      if (activeAttempt === pending) activeAttempt = null
    })
    activeAttempt = pending
    return activeAttempt
  }

  function retryWarmup(hostWindow: BrowserWindow): Promise<WarmupState> {
    if (activeAttempt) {
      return activeAttempt
    }
    return ensureWarmup('manual', hostWindow)
  }

  return {
    getWarmupState,
    ensureWarmup,
    retryWarmup,
    subscribeWarmup,
    reset
  }
}

/**
 * 默认 Electron WebContentsView 验证逻辑
 */
async function defaultElectronVerification(
  _reason: WarmupReason,
  hostWindow: BrowserWindow,
  dispatch: (event: WarmupEvent) => WarmupState
): Promise<WarmupState> {
  if (hostWindow.isDestroyed()) {
    return dispatch({ type: 'fail', reason: 'window-closed', retryable: true })
  }

  const { getActiveDomain } = await import('./networkProbe')
  const domain = getActiveDomain()
  const targetUrl = `https://${domain}/`

  return new Promise<WarmupState>((resolve) => {
    let resolved = false
    let viewDestroyed = false

    const view = new WebContentsView({
      webPreferences: {
        session: session.defaultSession,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    const TITLE_BAR_HEIGHT = 32
    const updateBounds = (): void => {
      if (hostWindow.isDestroyed() || viewDestroyed) return
      const [w, h] = hostWindow.getContentSize()
      const height = Math.max(0, h - TITLE_BAR_HEIGHT)
      const viewWidth = Math.min(w, Math.round((height * 9) / 16))
      view.setBounds({
        x: Math.round((w - viewWidth) / 2),
        y: TITLE_BAR_HEIGHT,
        width: viewWidth,
        height
      })
    }

    try {
      hostWindow.contentView.addChildView(view)
      updateBounds()
      hostWindow.on('resize', updateBounds)
    } catch {
      return resolve(dispatch({ type: 'fail', reason: 'window-closed', retryable: true }))
    }

    const cleanup = (): void => {
      try {
        hostWindow.off('resize', updateBounds)
      } catch {}
      try {
        if (!viewDestroyed) {
          hostWindow.contentView.removeChildView(view)
          view.webContents.close()
          viewDestroyed = true
        }
      } catch {}
    }

    const finishVerified = async (): Promise<void> => {
      if (resolved) return
      resolved = true
      cleanup()

      try {
        const { invalidateCookieCache } = await import('./httpClient')
        invalidateCookieCache()
      } catch {}

      const nextState = dispatch({
        type: 'verified',
        evidence: 'known-page',
        verifiedAt: Date.now()
      })

      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
          w.webContents.send('app:warmupDone')
          w.webContents.send('app:warmupStateChanged', nextState)
        }
      })

      resolve(nextState)
    }

    const finishFailed = (reason: 'timeout' | 'window-closed' | 'network-error'): void => {
      if (resolved) return
      resolved = true
      cleanup()

      const nextState =
        reason === 'timeout'
          ? dispatch({ type: 'timeout' })
          : dispatch({ type: 'fail', reason, retryable: true })

      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
          w.webContents.send('app:warmupStateChanged', nextState)
        }
      })

      resolve(nextState)
    }

    view.webContents.on('did-finish-load', () => {
      view.webContents
        .executeJavaScript(`
        (function() {
          var checkCount = 0;
          var iv = setInterval(function() {
            checkCount++;
            var title = document.title;
            var body = document.body ? document.body.innerText : '';
            if (title &&
                title.indexOf('Just a moment') === -1 &&
                title.indexOf('Checking') === -1 &&
                title.indexOf('Attention Required') === -1 &&
                title.indexOf('DDoS') === -1 &&
                body.indexOf('Enable JavaScript and cookies to continue') === -1 &&
                (body.length > 500 || title.length > 5)) {
              clearInterval(iv);
              window.__jm_warmup_done = true;
            }
            if (checkCount > 120) {
              clearInterval(iv);
              window.__jm_warmup_timeout = true;
            }
          }, 1000);
        })();
      `)
        .catch(() => {})
    })

    const checkInterval = setInterval(async () => {
      if (viewDestroyed || hostWindow.isDestroyed()) {
        clearInterval(checkInterval)
        finishFailed('window-closed')
        return
      }

      try {
        const result = await view.webContents.executeJavaScript(
          '(function(){ return { done: window.__jm_warmup_done || false, timeout: window.__jm_warmup_timeout || false }; })()'
        )

        if (result.done) {
          clearInterval(checkInterval)
          setTimeout(finishVerified, 1000)
        }
        if (result.timeout) {
          clearInterval(checkInterval)
          // 严格：超时转为 failed(timeout)，绝不能伪装为 verified
          finishFailed('timeout')
        }
      } catch {
        // view 页面导航中，继续轮询
      }
    }, 1500)

    // 2 分钟安全总超时
    const safetyTimeout = setTimeout(() => {
      clearInterval(checkInterval)
      finishFailed('timeout')
    }, 120000)

    view.webContents.on('destroyed', () => {
      viewDestroyed = true
      clearTimeout(safetyTimeout)
      clearInterval(checkInterval)
      finishFailed('window-closed')
    })

    view.webContents.loadURL(targetUrl).catch(() => {
      clearTimeout(safetyTimeout)
      clearInterval(checkInterval)
      finishFailed('network-error')
    })
  })
}

// ─── 全局单例协调器 ──────────────────────────────────────────────
const globalWarmupCoordinator = createWarmupCoordinator()

export const getWarmupState = globalWarmupCoordinator.getWarmupState
export const ensureWarmup = globalWarmupCoordinator.ensureWarmup
export const retryWarmup = globalWarmupCoordinator.retryWarmup
export const subscribeWarmup = globalWarmupCoordinator.subscribeWarmup

// 向后兼容接口
export function isSessionWarmedUp(): boolean {
  return getWarmupState().phase === 'verified'
}

export async function warmupSession(hostWindow: BrowserWindow): Promise<void> {
  await ensureWarmup('startup', hostWindow)
}

// ─── IPC 注册 ──────────────────────────────────────────────────
if (ipcMain) {
  ipcMain.handle('session:warmupStatus', () => {
    return getWarmupState()
  })

  ipcMain.handle('session:warmupRetry', async () => {
    const hostWindow = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    if (!hostWindow) {
      return { phase: 'failed', reason: 'window-closed', retryable: true }
    }
    return retryWarmup(hostWindow)
  })
}
