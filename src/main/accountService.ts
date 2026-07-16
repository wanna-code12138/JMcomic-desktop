import { safeStorage } from 'electron'
import { JmWebAdapter } from './siteAdapter'
import { getActiveDomain } from './networkProbe'
import { invalidateCookieCache } from './httpClient'
import { getDatabase, saveDatabase } from './database'
import type { MangaListItem } from './types'

type PersistMode = 'cookie' | 'credential'

interface AccountState {
  loggedIn: boolean
  username: string | null
  persistMode: PersistMode
}

class AccountService {
  private adapter: JmWebAdapter | null = null
  private _username: string | null = null
  private _persistMode: PersistMode = 'cookie'

  private getAdapter(): JmWebAdapter {
    if (!this.adapter) {
      this.adapter = new JmWebAdapter([getActiveDomain()])
    }
    return this.adapter
  }

  // ── auth 表 key-value helpers ──
  private async authGet(key: string): Promise<string | null> {
    const db = await getDatabase()
    const stmt = db.prepare('SELECT value FROM auth WHERE key = ?')
    stmt.bind([key])
    let val: string | null = null
    if (stmt.step()) val = String(stmt.getAsObject().value ?? '')
    stmt.free()
    return val
  }

  private async authSet(key: string, value: string): Promise<void> {
    const db = await getDatabase()
    db.run('INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)', [key, value])
    saveDatabase()
  }

  private async authDelete(key: string): Promise<void> {
    const db = await getDatabase()
    db.run('DELETE FROM auth WHERE key = ?', [key])
    saveDatabase()
  }

  // ── 启动时从 auth 表恢复会话 ──
  async loadOnStartup(): Promise<void> {
    const mode = await this.authGet('persist_mode')
    this._persistMode = (mode === 'credential') ? 'credential' : 'cookie'

    const username = await this.authGet('username')
    const cookiesJson = await this.authGet('session_cookies')
    if (username && cookiesJson) {
      try {
        const cookies = JSON.parse(cookiesJson) as Record<string, string>
        this.getAdapter()['cookieJar'] = cookies
        this._username = username
      } catch { /* 损坏的 cookie 数据，忽略 */ }
    }
  }

  // ── 登录 ──
  async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.getAdapter().login(username, password)
    if (!result.success) return result

    this._username = username
    invalidateCookieCache()

    // 持久化 cookie + username（两种模式都存）
    const cookies = { ...this.getAdapter()['cookieJar'] }
    await this.authSet('session_cookies', JSON.stringify(cookies))
    await this.authSet('username', username)

    // 凭据模式额外存加密密码
    if (this._persistMode === 'credential' && safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(password)
      await this.authSet('enc_password', enc.toString('base64'))
    }
    return { success: true }
  }

  // ── 退出登录 ──
  async logout(): Promise<void> {
    this.getAdapter()['cookieJar'] = {}
    this._username = null
    await this.authDelete('session_cookies')
    await this.authDelete('username')
    await this.authDelete('enc_password')
    invalidateCookieCache()
  }

  // ── 状态查询 ──
  getStatus(): AccountState {
    return {
      loggedIn: this._username !== null,
      username: this._username,
      persistMode: this._persistMode
    }
  }

  // ── 切换持久化模式 ──
  async setPersistMode(mode: PersistMode): Promise<void> {
    this._persistMode = mode
    await this.authSet('persist_mode', mode)
    // 切到 cookie 模式时删除加密密码
    if (mode === 'cookie') {
      await this.authDelete('enc_password')
    }
  }

  // ── 校验会话有效性 ──
  async validateSession(): Promise<{ valid: boolean; username: string | null }> {
    if (!this._username) return { valid: false, username: null }
    try {
      await this.getAdapter().getFavorites(1)
      return { valid: true, username: this._username }
    } catch {
      // cookie 失效
      if (this._persistMode === 'credential') {
        // 尝试自动重登
        const encPwd = await this.authGet('enc_password')
        if (encPwd && safeStorage.isEncryptionAvailable()) {
          try {
            const password = safeStorage.decryptString(Buffer.from(encPwd, 'base64'))
            const result = await this.login(this._username, password)
            if (result.success) return { valid: true, username: this._username }
          } catch { /* 解密失败，忽略 */ }
        }
      }
      // cookie 模式或重登失败：标记未登录
      this._username = null
      await this.authDelete('session_cookies')
      return { valid: false, username: null }
    }
  }

  // ── 在线收藏/历史转发 ──
  async getFavorites(page = 1): Promise<{ results: MangaListItem[]; totalPages: number }> {
    if (!this._username) throw new Error('未登录')
    return this.getAdapter().getFavorites(page)
  }

  async getHistory(page = 1): Promise<{ results: MangaListItem[]; totalPages: number }> {
    if (!this._username) throw new Error('未登录')
    return this.getAdapter().getHistory(page)
  }
}

export const accountService = new AccountService()
