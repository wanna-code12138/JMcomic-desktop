import { JmApiProtocolError } from './jmAppApiCrypto'

export type TokenParamStyle = 'always-version' | 'get-empty-post-version'

export interface JmApiProfile {
  id: 'python-current' | 'java-compat'
  signSecret: string
  dataSecret: string
  bootstrapVersion: string
  tokenParamStyle: TokenParamStyle
}

/** 协议盐和初始版本号的唯一归属点 */
export const BUILTIN_JM_API_PROFILES: readonly JmApiProfile[] = [
  {
    id: 'python-current',
    signSecret: '185Hcomic3PAPP7R',
    dataSecret: '185Hcomic3PAPP7R',
    bootstrapVersion: '2.0.30',
    tokenParamStyle: 'always-version'
  },
  {
    id: 'java-compat',
    signSecret: '18comicAPP',
    dataSecret: '185Hcomic3PAPP7R',
    bootstrapVersion: '2.0.20',
    tokenParamStyle: 'get-empty-post-version'
  }
]

export function versionPartFor(profile: JmApiProfile, method: 'GET' | 'POST'): string {
  if (profile.tokenParamStyle === 'get-empty-post-version' && method === 'GET') return ''
  return profile.bootstrapVersion
}

export function withRuntimeVersion(profile: JmApiProfile, version: string): JmApiProfile {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new JmApiProtocolError('INVALID_VERSION')
  }
  return { ...profile, bootstrapVersion: version }
}
