import { BrowserWindow, session, ipcMain } from 'electron'
import { getActiveDomain } from './networkProbe'
import { invalidateCookieCache } from './httpClient'

let warmupDone = false
let warmupPromise: Promise<void> | null = null

/**
 * Opens a small visible window showing the JMComic homepage.
 * The user completes the Cloudflare challenge manually (click checkbox).
 * Once passed, the session gets valid cookies, and the window auto-closes.
 *
 * This is much more reliable than trying to programmatically bypass Cloudflare.
 */
export async function warmupSession(): Promise<void> {
  if (warmupDone) return
  if (warmupPromise) return warmupPromise

  warmupPromise = new Promise<void>((resolve) => {
    const domain = getActiveDomain()
    const targetUrl = `https://${domain}/`

    const warmupWin = new BrowserWindow({
      width: 500,
      height: 620,
      resizable: false,
      frame: true,
      center: true,
      title: 'JMComic — 安全验证',
      autoHideMenuBar: true,
      webPreferences: {
        session: session.defaultSession,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    let resolved = false

    const finish = (): void => {
      if (resolved) return
      resolved = true
      warmupDone = true
      invalidateCookieCache() // pick up fresh Cloudflare cookies
      try {
        if (!warmupWin.isDestroyed()) warmupWin.close()
      } catch { /* ok */ }

      // Notify renderer
      const wins = BrowserWindow.getAllWindows()
      wins.forEach((w) => {
        if (w.id !== warmupWin.id) {
          w.webContents.send('app:warmupDone')
        }
      })

      resolve()
    }

    // Inject a hint overlay into the page
    warmupWin.webContents.on('did-finish-load', () => {
      warmupWin.webContents.executeJavaScript(`
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
      if (warmupWin.isDestroyed()) {
        clearInterval(checkInterval)
        finish()
        return
      }

      try {
        const result = await warmupWin.webContents.executeJavaScript(
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
        // Window may be navigating, try again
      }
    }, 1500)

    // Safety timeout: 2 minutes
    setTimeout(() => {
      clearInterval(checkInterval)
      finish()
    }, 120000)

    warmupWin.on('closed', () => {
      clearInterval(checkInterval)
      finish()
    })

    warmupWin.loadURL(targetUrl).catch(() => {
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
