import { BrowserWindow, WebContentsView, session, ipcMain } from 'electron'
import { getActiveDomain } from './networkProbe'
import { invalidateCookieCache } from './httpClient'

let warmupDone = false
let warmupPromise: Promise<void> | null = null

/**
 * Embeds a WebContentsView into the host window showing the JMComic homepage.
 * The user completes the Cloudflare challenge manually (click checkbox).
 * Once passed, the session gets valid cookies, and the view is removed.
 *
 * This is much more reliable than trying to programmatically bypass Cloudflare.
 */
export async function warmupSession(hostWindow: BrowserWindow): Promise<void> {
  if (warmupDone) return
  if (warmupPromise) return warmupPromise

  warmupPromise = new Promise<void>((resolve) => {
    const domain = getActiveDomain()
    const targetUrl = `https://${domain}/`

    // 内嵌 WebContentsView：加载 JM 首页让用户过 Cloudflare / 18 岁验证。
    // 用 session.defaultSession，cookie 自动共享给 scraperWindow / httpClient。
    const view = new WebContentsView({
      webPreferences: {
        session: session.defaultSession,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    let resolved = false
    let viewDestroyed = false

    // ── bounds：高度顶满标题栏（32px）以下区域，宽度按 9:16 竖屏比例居中 ──
    const TITLE_BAR_HEIGHT = 32
    const updateBounds = (): void => {
      if (hostWindow.isDestroyed() || viewDestroyed) return
      const [w, h] = hostWindow.getContentSize()
      const height = Math.max(0, h - TITLE_BAR_HEIGHT)
      const viewWidth = Math.min(w, Math.round(height * 9 / 16))
      view.setBounds({
        x: Math.round((w - viewWidth) / 2),
        y: TITLE_BAR_HEIGHT,
        width: viewWidth,
        height
      })
    }

    hostWindow.contentView.addChildView(view)
    updateBounds()
    hostWindow.on('resize', updateBounds)

    const finish = (): void => {
      if (resolved) return
      resolved = true
      warmupDone = true
      invalidateCookieCache() // pick up fresh Cloudflare cookies
      try {
        hostWindow.off('resize', updateBounds)
      } catch { /* ok */ }
      try {
        if (!viewDestroyed) {
          hostWindow.contentView.removeChildView(view)
          view.webContents.destroy()
          viewDestroyed = true
        }
      } catch { /* ok */ }

      // Notify renderer of all windows（主窗口本身在等 app:warmupDone）
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('app:warmupDone')
      })

      resolve()
    }

    // Inject a hint overlay into the page
    view.webContents.on('did-finish-load', () => {
      view.webContents.executeJavaScript(`
        (function() {
          // Check every 1s if we passed Cloudflare
          var checkCount = 0;
          var iv = setInterval(function() {
            checkCount++;
            var title = document.title;
            var body = document.body ? document.body.innerText : '';
            // Signs that we passed Cloudflare:
            // - Title doesn't contain "Just a moment" / "Checking" / "Attention Required"
            // - Body has actual content (not just "Enable JavaScript")
            if (title &&
                title.indexOf('Just a moment') === -1 &&
                title.indexOf('Checking') === -1 &&
                title.indexOf('Attention Required') === -1 &&
                title.indexOf('DDoS') === -1 &&
                body.indexOf('Enable JavaScript and cookies to continue') === -1 &&
                (body.length > 500 || title.length > 5)) {
              clearInterval(iv);
              // Tell Electron we're done
              window.__jm_warmup_done = true;
            }
            if (checkCount > 120) { // 2 min timeout
              clearInterval(iv);
              window.__jm_warmup_timeout = true;
            }
          }, 1000);
        })();
      `).catch(() => {})
    })

    // Check page state periodically
    const checkInterval = setInterval(async () => {
      if (viewDestroyed) {
        clearInterval(checkInterval)
        finish()
        return
      }

      try {
        const result = await view.webContents.executeJavaScript(
          '(function(){ return { done: window.__jm_warmup_done || false, timeout: window.__jm_warmup_timeout || false }; })()'
        )

        if (result.done) {
          clearInterval(checkInterval)
          // Short delay for cookies to settle
          setTimeout(finish, 1000)
        }
        if (result.timeout) {
          clearInterval(checkInterval)
          // Even if timeout, accept — cookies may have been set anyway
          finish()
        }
      } catch {
        // View may be navigating, try again
      }
    }, 1500)

    // Safety timeout: 2 minutes
    setTimeout(() => {
      clearInterval(checkInterval)
      finish()
    }, 120000)

    // view.webContents 被销毁时兜底 finish
    view.webContents.on('destroyed', () => {
      viewDestroyed = true
      clearInterval(checkInterval)
      finish()
    })

    view.webContents.loadURL(targetUrl).catch(() => {
      clearInterval(checkInterval)
      finish()
    })
  })

  return warmupPromise
}

export function isSessionWarmedUp(): boolean {
  return warmupDone
}

// IPC
ipcMain.handle('session:warmupStatus', () => {
  return { warmedUp: warmupDone }
})
