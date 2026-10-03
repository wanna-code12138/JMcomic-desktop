const attempts = new Map()
const browserDetails = []
const titles = { '110001': '多章节合成样本', '110002': '单篇合成样本', '110003': '短暂失败后恢复样本', '110004': '网页回退样本' }

exports.browserDetails = browserDetails
exports.titles = titles
exports.payload = url => {
  const id = url.searchParams.get('id')
  if (url.pathname === '/album') {
    attempts.set(id, (attempts.get(id) || 0) + 1)
    const series = id === '110001'
      ? [{ id: '210001', name: '第一章' }, { id: '210002', name: '第二章' }]
      : id === '110004' || (id === '110003' && attempts.get(id) === 1) ? undefined : []
    return { id, name: titles[id], author: ['测试作者'], series }
  }
  if (url.pathname === '/comic_read') return { id, scramble_id: 0, images: ['0.png', '1.png', '2.png'], total_page: 3 }
  if (['/categories/filter', '/search', '/promote'].includes(url.pathname)) {
    return { total: 4, content: Object.entries(titles).map(([id, name]) => ({ id, name, image: `/media/albums/${id}.png` })) }
  }
  throw Error(`Unexpected detail fixture route: ${url.pathname}`)
}
exports.html = url => {
  const id = url.pathname.match(/^\/album\/(\d+)/)?.[1]
  if (!id) return '<!doctype html><title>测试主页</title><a href="/album/110001">多章节合成样本</a>'
  browserDetails.push(id)
  // Incomplete fallback DOM reproduces the screenshot instead of disguising the invalid API rejection.
  return `<!doctype html><title>合成详情</title><h1 id="book-name">${titles[id]}</h1>${id === '110004' ? '<a href="/photo/110004">開始閱讀</a>' : ''}`
}
