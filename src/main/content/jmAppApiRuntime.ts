import type { ContentProvider } from '../contentGateway'
import { validateTrustedImageUrl } from '../../shared/imageUrlCore'
import { createJmAppApiProvider } from './jmAppApiProvider'
import { JM_API_ORIGINS, validateApiOrigin } from './jmAppApiDomainResolver'
import { BUILTIN_JM_API_PROFILES, withRuntimeVersion } from './jmAppApiProfiles'
import { parseSettingPayload } from './jmAppApiSchemas'
import { createJmAppApiTransport, JM_API_ENDPOINTS, type JmApiFetchPort } from './jmAppApiTransport'

export interface AnonymousApiProvider extends ContentProvider {
  prewarm(): Promise<void>
}

export function createAnonymousApiProvider(fetchPort: JmApiFetchPort): AnonymousApiProvider {
  let selected: ContentProvider | null = null
  let selectedUntil = 0
  let unavailableUntil = 0
  let pending: Promise<ContentProvider> | null = null

  async function discover(): Promise<ContentProvider> {
    for (const candidate of JM_API_ORIGINS) {
      const trusted = validateApiOrigin(candidate)
      if (!trusted.ok || !trusted.origin) continue
      const route = {
        apiOrigin: trusted.origin, imageOrigin: 'https://cdn-msp.18comic.vip',
        profile: BUILTIN_JM_API_PROFILES[0]
      }
      try {
        const probe = createJmAppApiTransport({
          route, fetchPort, maxNetworkAttempts: 1,
          endpoints: { setting: { ...JM_API_ENDPOINTS.setting, timeoutMs: 3000 } }
        })
        const setting = parseSettingPayload(await probe.request('setting'))
        if (!setting.imgHost) continue
        const imageUrl = validateTrustedImageUrl(setting.imgHost.includes('://') ? setting.imgHost : `https://${setting.imgHost}`)
        if (!imageUrl) continue
        route.imageOrigin = new URL(imageUrl).origin
        route.profile = withRuntimeVersion(route.profile, setting.jm3Version)
        const provider = createJmAppApiProvider(createJmAppApiTransport({ route, fetchPort }), route.imageOrigin)
        selected = provider
        selectedUntil = Date.now() + 10 * 60_000
        return provider
      } catch {
        // Anonymous bootstrap failures cannot expose response text or URLs.
      }
    }
    unavailableUntil = Date.now() + 60_000
    throw new Error('anonymous-api-unavailable')
  }

  function getProvider(): Promise<ContentProvider> {
    if (selected && Date.now() < selectedUntil) return Promise.resolve(selected)
    if (Date.now() < unavailableUntil) return Promise.reject(new Error('anonymous-api-unavailable'))
    if (!pending) pending = discover().finally(() => { pending = null })
    return pending
  }

  return {
    async prewarm() { await getProvider() },
    async homepage(category) {
      if (category === 'recommended') throw new Error('api-homepage-recommendation-unsupported')
      return (await getProvider()).homepage(category)
    },
    async search(request) {
      if (request.category && request.category !== '0') throw new Error('api-search-filter-unsupported')
      return (await getProvider()).search(request)
    },
    async category(request) {
      if (request.subCategory || (request.tag && request.category && request.category !== '0')) throw new Error('api-category-filter-unsupported')
      return (await getProvider()).category(request)
    },
    async detail(id) { return (await getProvider()).detail(id) },
    async pages(url) { return (await getProvider()).pages(url) }
  }
}
