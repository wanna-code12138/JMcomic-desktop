import { ipcMain, net, safeStorage, session, type WebContents } from 'electron'
import { join } from 'node:path'
import { getAppDataDir } from '../dataPaths'
import { createJmApiFetchPort } from '../content/jmAppApiFetchPort'
import { createJmAppApiTransport, JM_API_ENDPOINTS } from '../content/jmAppApiTransport'
import { BUILTIN_JM_API_PROFILES, withRuntimeVersion } from '../content/jmAppApiProfiles'
import { parseSettingPayload } from '../content/jmAppApiSchemas'
import { validateTrustedImageUrl } from '../../shared/imageUrlCore'
import { createSessionVault } from './sessionVault'
import { createAccountSessionFactory } from './accountSession'
import { createAccountService, type AccountService } from './accountService'
import { createAccountLibrary } from './accountLibrary'
import { createAccountActivity } from './accountActivity'
import { CREDENTIAL_ORIGINS } from './accountTransport'
import { AccountError } from './accountErrors'
import { registerAccountHandlers } from './accountIpc'
import { accountProxyRegistry } from './sessionProxyRegistry'

let account: AccountService | undefined

export function initializeAccount(getContents: () => WebContents | undefined): void {
  const vault = createSessionVault(join(getAppDataDir(), 'online-session-v1.bin'), {
    available: () => safeStorage.isEncryptionAvailable(), encrypt: value => safeStorage.encryptString(value), decrypt: value => safeStorage.decryptString(value)
  })
  const createSession = createAccountSessionFactory({ openSession: (partition, options) => session.fromPartition(partition, options),
    register: target => accountProxyRegistry.register(target),
    async discover(saved, signal) {
      const origins = saved ? [saved.origin] : CREDENTIAL_ORIGINS
      for (const origin of origins) {
        if (!(CREDENTIAL_ORIGINS as readonly string[]).includes(origin)) throw new AccountError('FORBIDDEN')
        signal?.throwIfAborted()
        try {
          const profile = BUILTIN_JM_API_PROFILES.find(profile => profile.id === saved?.profileId) ?? BUILTIN_JM_API_PROFILES[0]
          const route = { apiOrigin: origin, imageOrigin: 'https://cdn-msp.18comic.vip', profile }
          const transport = createJmAppApiTransport({ route, fetchPort: createJmApiFetchPort((url, init) => net.fetch(url, init)),
            maxNetworkAttempts: 1, endpoints: { setting: { ...JM_API_ENDPOINTS.setting, timeoutMs: 4000 } } })
          const setting = parseSettingPayload(await transport.request('setting', {}, signal))
          const image = setting.imgHost ? validateTrustedImageUrl(setting.imgHost.includes('://') ? setting.imgHost : `https://${setting.imgHost}`) : null
          if (!image) throw new AccountError('PROTOCOL')
          return { ...route, imageOrigin: new URL(image).origin, profile: withRuntimeVersion(profile, setting.jm3Version) }
        } catch { signal?.throwIfAborted() }
      }
      throw new AccountError('NETWORK')
    }
  })
  account = createAccountService({ vault, createSession, publish: state => {
    const contents = getContents()
    if (contents && !contents.isDestroyed()) contents.send('account:changed', state)
  } })
  accountProxyRegistry.onPause(paused => account?.setNetworkPaused(paused))
  registerAccountHandlers(ipcMain, getContents, account, createAccountLibrary(account), createAccountActivity(account))
  void account.restore().catch(() => {})
}

export async function clearOnlineAccount(): Promise<void> { if (account) await account.logout() }
export async function closeOnlineAccount(): Promise<void> { if (account) await account.close() }
