export interface ComicComment {
  id: string
  author: string
  text: string
  createdAt: string
  spoiler: boolean
  likes: number | null
  replies: ComicComment[]
  albumId?: string
  repliesTruncated?: boolean
}

export interface CommentPage {
  items: ComicComment[]
  page: number
  total: number | null
  hasNext: boolean
  stale?: boolean
  truncated?: boolean
}

export type CommentReply = { ok: true; data: CommentPage } | { ok: false; error: string }
