import assert from 'node:assert/strict'
import { parseLibrary } from '../account/accountParser'
import type { LibraryKind } from '../../shared/accountContracts'

const origin = 'https://cdn-msp12.jmdanjonproxy.xyz'
const payload = (kind: LibraryKind, image: unknown) => ({
  [kind === 'tracking' ? 'item' : 'list']: [{ id: '123456', name: '封面回归样本', image }],
  [kind === 'tracking' ? 'totalCnt' : 'total']: '1'
})

for (const kind of ['favorites', 'history', 'tracking'] as const) {
  // Live account lists return image="", rather than omitting the optional field.
  for (const image of ['', '   \t\n', undefined, null, 0, {}]) {
    const album = parseLibrary(payload(kind, image), 1, origin, kind).items[0]
    assert.equal(album.coverUrl, `${origin}/media/albums/123456.jpg`, `${kind}: 未提供封面时必须按作品编号生成图片路径，不能请求 CDN 根目录`)
  }
  assert.equal(parseLibrary(payload(kind, '/media/albums/custom.jpg'), 1, origin, kind).items[0].coverUrl, `${origin}/media/albums/custom.jpg`)
  assert.equal(parseLibrary(payload(kind, ' https://cdn-msp.18comic.vip/media/albums/custom.jpg '), 1, origin, kind).items[0].coverUrl,
    'https://cdn-msp.18comic.vip/media/albums/custom.jpg', '保留服务器明确给出的可信封面地址')
  for (const image of ['https://untrusted.example/cover.jpg', 'http://cdn-msp.18comic.vip/cover.jpg', 'https://user:pass@cdn-msp.18comic.vip/cover.jpg']) {
    assert.equal(parseLibrary(payload(kind, image), 1, origin, kind).items[0].coverUrl, '', '不能通过封面回退绕过原有图片来源限制')
  }
}
console.log('PASS online covers: blank/missing fields in favorites, history and tracking; explicit paths and trusted origins')
