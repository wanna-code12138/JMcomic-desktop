import { createApiToken, createTokenParam, decryptApiPayload } from './jmAppApiCrypto'
import { versionPartFor } from './jmAppApiProfiles'
import type { JmApiRoute } from './jmAppApiDomainResolver'

export interface JmApiEndpoint {
  key: 'setting' | 'search' | 'category' | 'detail' | 'pages'
  path: string
  method: 'GET'
  timeoutMs: number
  maxResponseBytes: number
}

export const JM_API_ENDPOINTS: Record<string, JmApiEndpoint> = {
  setting: {
    key: 'setting',
    path: '/setting',
    method: 'GET',
    timeoutMs: 10_000,
    maxResponseBytes: 64 * 1024
  },
  search: {
    key: 'search',
    path: '/search',
    method: 'GET',
    timeoutMs: 10_000,
    maxResponseBytes: 512 * 1024
  },
  category: {
    key: 'category',
    path: '/categories',
    method: 'GET',
    timeoutMs: 10_000,
    maxResponseBytes: 512 * 1024
  },
  detail: {
    key: 'detail',
    path: '/album',
    method: 'GET',
    timeoutMs: 10_000,
    maxResponseBytes: 256 * 1024
  },
  pages: {
    key: 'pages',
    path: '/chapter',
    method: 'GET',
    timeoutMs: 10_000,
    maxResponseBytes: 512 * 1024
  }
}

export interface JmApiFetchRequest {
  url: string
  method: string
  headers: Record<string, string>
  timeoutMs?: number
  signal?: AbortSignal
}

export interface JmApiFetchPort {
  send(request: JmApiFetchRequest): Promise<{
    status: number
    headers: Record<string, string>
    bodyText: string
  }>
}

export interface JmAppApiTransportDeps {
  route: JmApiRoute
  endpoints?: Record<string, JmApiEndpoint>
  clock?: { nowSeconds: () => number }
  fetchPort: JmApiFetchPort
}

export interface JmAppApiTransport {
  request(
    endpointKey: string,
    query?: Record<string, string>,
    signal?: AbortSignal
  ): Promise<unknown>
}

export function createJmAppApiTransport(deps: JmAppApiTransportDeps): JmAppApiTransport {
  const clock = deps.clock ?? { nowSeconds: () => Math.floor(Date.now() / 1000) }
  const endpoints = deps.endpoints ?? JM_API_ENDPOINTS

  async function request(
    endpointKey: string,
    query: Record<string, string> = {},
    signal?: AbortSignal
  ): Promise<unknown> {
    const endpoint = endpoints[endpointKey]
    if (!endpoint) {
      throw new Error(`ENDPOINT_UNKNOWN:${endpointKey}`)
    }

    if (signal?.aborted) {
      throw signal.reason ?? new Error('Request aborted')
    }

    const maxAttempts = 2 // 首次 + 最多 1 次重试
    let lastError: unknown = null

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) {
        throw signal.reason ?? new Error('Request aborted')
      }

      const ts = clock.nowSeconds()
      const urlObj = new URL(endpoint.path, deps.route.apiOrigin)
      for (const [k, v] of Object.entries(query)) {
        urlObj.searchParams.set(k, v)
      }

      const headers: Record<string, string> = {
        token: createApiToken(ts, deps.route.profile.signSecret),
        tokenparam: createTokenParam(ts, versionPartFor(deps.route.profile, 'GET'), true),
        Accept: 'application/json'
      }

      let response: { status: number; headers: Record<string, string>; bodyText: string }
      try {
        response = await deps.fetchPort.send({
          url: urlObj.href,
          method: endpoint.method,
          headers,
          timeoutMs: endpoint.timeoutMs,
          signal
        })
      } catch (networkErr) {
        lastError = networkErr
        if (attempt === 0 && !signal?.aborted) {
          continue // 仅重试一次
        }
        throw networkErr
      }

      // 3xx Redirection Check
      if (response.status >= 300 && response.status < 400) {
        throw new Error('UPSTREAM_CHANGED')
      }

      // 401 / 403
      if (response.status === 401) throw new Error('UNAUTHORIZED')
      if (response.status === 403) throw new Error('FORBIDDEN')

      // Body Size Limit Check
      if (response.bodyText.length > endpoint.maxResponseBytes) {
        throw new Error('RESPONSE_TOO_LARGE')
      }

      if (response.status !== 200) {
        throw new Error(`HTTP_STATUS_${response.status}`)
      }

      let outer: { code?: unknown; data?: unknown }
      try {
        outer = JSON.parse(response.bodyText)
      } catch {
        throw new Error('BAD_ENVELOPE')
      }

      if (outer.code !== 200 || typeof outer.data !== 'string') {
        throw new Error('BAD_ENVELOPE')
      }

      try {
        return decryptApiPayload(outer.data, ts, deps.route.profile.dataSecret)
      } catch (decryptErr) {
        throw new Error('BAD_ENVELOPE')
      }
    }

    throw lastError ?? new Error('REQUEST_FAILED')
  }

  return { request }
}
