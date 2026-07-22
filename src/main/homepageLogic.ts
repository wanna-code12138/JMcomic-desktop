export type HomepageCategory = 'recommended' | 'latest' | 'popular'

export function buildHomepageUrl(domain: string, category: HomepageCategory): string {
  if (category === 'recommended') {
    return `https://${domain}/albums?o=tf`
  }
  const order = category === 'latest' ? 'mr' : 'mv'
  return `https://${domain}/albums?o=${order}`
}

export function buildHomepageCacheKey(category: HomepageCategory): string {
  return `homepage:${category}`
}

interface ScraperCard {
  id: string
  title: string
  coverUrl: string
  author?: string
  chapter?: string
}

export interface MangaCardDataLike {
  id: string
  title: string
  coverUrl: string
  author?: string
  latestChapter?: string
}

export function mapCardToMangaCardData(card: ScraperCard): MangaCardDataLike {
  const { chapter, ...rest } = card
  return { ...rest, latestChapter: chapter }
}
