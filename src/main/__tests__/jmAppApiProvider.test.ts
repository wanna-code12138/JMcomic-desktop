import assert from 'node:assert/strict'
import { createJmAppApiProvider } from '../content/jmAppApiProvider'
import type { JmAppApiTransport } from '../content/jmAppApiTransport'

function test(name: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(
    () => console.log(`  PASS: ${name}`),
    (error) => {
      console.log(`  FAIL: ${name}`)
      console.log(error)
      process.exitCode = 1
    }
  )
}

const mockTransport = (handler: (endpoint: string, query?: Record<string, string>) => unknown): JmAppApiTransport => ({
  async request(endpoint: string, query?: Record<string, string>) {
    return handler(endpoint, query)
  }
})

async function main(): Promise<void> {
  await test('homepage calls category endpoint and parses results', async () => {
    const provider = createJmAppApiProvider(
      mockTransport((endpoint, query) => {
        assert.equal(endpoint, 'category')
        assert.equal(query?.c, '0')
        assert.equal(query?.o, 'mr')
        return {
          total: 1,
          content: [{ id: '101', name: '作品A', image: '/media/albums/101.jpg' }]
        }
      }),
      'https://cdn-msp.18comic.vip'
    )

    const cards = await provider.homepage('latest')
    assert.equal(cards.length, 1)
    assert.equal(cards[0].id, '101')
    assert.equal(cards[0].title, '作品A')
    assert.equal(cards[0].coverUrl, 'https://cdn-msp.18comic.vip/media/albums/101.jpg')
  })

  await test('search maps query parameters and parses list result', async () => {
    const provider = createJmAppApiProvider(
      mockTransport((endpoint, query) => {
        assert.equal(endpoint, 'search')
        assert.equal(query?.search_query, '测试')
        assert.equal(query?.page, '2')
        return {
          total: 40,
          content: [{ id: '202', name: '搜索作品', image: '/media/albums/202.jpg' }]
        }
      }),
      'https://cdn-msp.18comic.vip'
    )

    const list = await provider.search({
      query: '测试',
      page: 2,
      mainTag: 0,
      order: 'mr',
      time: 'a'
    })
    assert.equal(list.totalPages, 1) // Anonymous app API uses 80 items per page.
    assert.equal(list.results[0].id, '202')
  })

  await test('detail maps mangaId and parses detail result', async () => {
    const provider = createJmAppApiProvider(
      mockTransport((endpoint, query) => {
        assert.equal(endpoint, 'detail')
        assert.equal(query?.id, '1215915')
        return {
          id: '1215915',
          name: '男人配额制',
          author: 'MALPOI',
          image: '/media/albums/1215915.jpg',
          tags: ['全彩'],
          series: [{ id: '220980', name: '第 1 话' }]
        }
      }),
      'https://cdn-msp.18comic.vip'
    )

    const detail = await provider.detail('1215915')
    assert.equal(detail.id, '1215915')
    assert.equal(detail.title, '男人配额制')
    assert.equal(detail.chapters.length, 1)
    assert.equal(detail.chapters[0].url, '/photo/220980')
  })

  await test('pages extracts chapterId from chapterUrl and parses pages', async () => {
    const provider = createJmAppApiProvider(
      mockTransport((endpoint, query) => {
        assert.equal(endpoint, 'pages')
        assert.equal(query?.id, '220980')
        return {
          id: '220980',
          scramble_id: 220980,
          images: ['00001.webp', '00002.webp']
        }
      }),
      'https://cdn-msp.18comic.vip'
    )

    const pages = await provider.pages('/photo/220980')
    assert.equal(pages.scrambleId, 220980)
    assert.equal(pages.pages.length, 2)
    assert.equal(pages.pages[0].imageUrl, 'https://cdn-msp.18comic.vip/media/photos/220980/00001.webp')
  })
}

main().then(() => {
  if (process.exitCode) console.log('Some tests failed.')
  else console.log('All jmAppApiProvider tests passed!')
})
