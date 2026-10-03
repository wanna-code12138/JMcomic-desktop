import { createDecipheriv, createHash } from 'node:crypto'

export class JmApiProtocolError extends Error {
  constructor(code: 'INVALID_BASE64' | 'DECRYPT_FAILED' | 'INVALID_VERSION') {
    super(`JM_API_PROTOCOL_ERROR:${code}`)
    this.name = 'JmApiProtocolError'
  }
}

export function md5Hex(input: string): string {
  return createHash('md5').update(input, 'utf8').digest('hex')
}

export function createApiToken(tsSeconds: number, secret: string): string {
  return md5Hex(`${tsSeconds}${secret}`)
}

export function createTokenParam(
  tsSeconds: number,
  appVersion: string,
  includeVersion: boolean
): string {
  return `${tsSeconds},${includeVersion ? appVersion : ''}`
}

function decodeBase64(input: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) {
    throw new JmApiProtocolError('INVALID_BASE64')
  }
  return Buffer.from(input, 'base64')
}

/**
 * API 使用十六进制 MD5 文本的 ASCII 字节作为其 AES-256 密钥；
 * 严禁将其转回 16 字节二进制。
 */
export function decryptApiPayload(
  base64Ciphertext: string,
  tsSeconds: number,
  dataSecret: string
): unknown {
  try {
    const ciphertext = decodeBase64(base64Ciphertext)
    const key = md5Hex(`${tsSeconds}${dataSecret}`)
    const decipher = createDecipheriv('aes-256-ecb', key, null)
    decipher.setAutoPadding(true)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    try {
      return JSON.parse(plaintext) as unknown
    } catch {
      return plaintext
    }
  } catch (error) {
    if (error instanceof JmApiProtocolError) throw error
    throw new JmApiProtocolError('DECRYPT_FAILED')
  }
}
