import type { AccountService } from './accountService'
import type { AccountTask, CommentSubmission, DailyMonth, DailyResult, DailyState } from '../../shared/accountContracts'
import type { CommentPage } from '../../shared/commentContracts'
import { parseCommentPage, record, safeText } from '../comments/commentParser'
import { id, boolean, rows } from './accountParser'
import { createAccountOperations } from './accountOperations'
import { AccountError, accountError } from './accountErrors'
import { validateTrustedImageUrl } from '../../shared/imageUrlCore'

export function parseDaily(raw: unknown): DailyState {
  const data = record(raw)
  if (!/^\d{1,12}$/.test(String(data.daily_id)) || !Array.isArray(data.record)) throw new AccountError('PROTOCOL')
  const days = data.record.flat().slice(0, 42).map(raw => {
    const day = record(raw), date = safeText(day.date, 40)
    if (!date) throw new AccountError('PROTOCOL')
    return { date, signed: boolean(day.signed), bonus: boolean(day.bonus) === true }
  })
  return { id: String(data.daily_id), title: safeText(data.event_name, 160), progress: safeText(data.currentProgress, 40), days }
}
export function parseTasks(raw: unknown): AccountTask[] {
  const data = record(raw)
  if (data.status !== 'ok') throw new AccountError('UNAVAILABLE')
  return rows(raw).map(raw => {
    const item = record(raw)
    return { id: id(item.id), name: safeText(item.name, 200), text: safeText(item.content, 2000), done: boolean(item.done) }
  })
}
export function createAccountActivity(service: AccountService) {
  const { scope, operate } = createAccountOperations(service)
  const uid = (generation: number): string => { scope(generation); return id(service.getState().profile?.uid) }
  async function daily(generation: number): Promise<DailyState> {
    const data = parseDaily(await service.request('daily', { user_id: uid(generation) }, generation)); scope(generation); return data
  }
  return {
    async myComments(page: number, generation: number): Promise<CommentPage> {
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AccountError('INVALID_INPUT')
      const raw = await service.request('myComments', { uid: uid(generation), mode: 'all', page: String(page) }, generation)
      scope(generation)
      try { return parseCommentPage(raw, page) } catch { throw new AccountError('PROTOCOL') }
    },
    async postComment(query: CommentSubmission): Promise<{ status: 'sent' }> {
      id(query.albumId); id(query.parentId)
      if (typeof query.text !== 'string' || !query.text.trim() || query.text.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(query.text)) throw new AccountError('INVALID_INPUT')
      return operate(query.generation, query.operationId, `comment:${query.albumId}`, JSON.stringify(query), async () => {
        let raw: unknown
        try { raw = await service.request('postComment', { aid: query.albumId, comment_id: query.parentId, comment: query.text.trim() }, query.generation) }
        catch (error) {
          scope(query.generation)
          const failure = accountError(error)
          throw ['NETWORK', 'PROTOCOL'].includes(failure.code) ? new AccountError('OUTCOME_UNKNOWN') : failure
        }
        if (record(raw).status !== 'ok') throw new AccountError('UNAVAILABLE')
        return { status: 'sent' }
      })
    },
    daily,
    async checkIn(generation: number, operationId: string): Promise<DailyResult> {
      return operate(generation, operationId, 'daily', 'manual-check-in', async () => {
        const before = await daily(generation)
        let raw: unknown
        try { raw = await service.request('checkIn', { user_id: uid(generation), daily_id: before.id }, generation) }
        catch (error) { scope(generation); const failure = accountError(error); throw ['NETWORK', 'PROTOCOL'].includes(failure.code) ? new AccountError('OUTCOME_UNKNOWN') : failure }
        const message = safeText(record(raw).msg, 300)
        const status = /已[经經]?[签簽]到/.test(message) ? 'already' : /[签簽]到成功/.test(message) ? 'signed' : null
        if (!status) throw new AccountError('OUTCOME_UNKNOWN')
        let calendar: DailyState | null = null
        try { calendar = await daily(generation) } catch { scope(generation) }
        return { status, calendar }
      })
    },
    async years(generation: number): Promise<string[]> {
      const raw = await service.request('dailyYears', { user_id: uid(generation) }, generation)
      scope(generation)
      return rows(raw).map(raw => safeText(record(raw).title, 40)).filter(year => /^\d{4}$/.test(year))
    },
    async history(year: string, generation: number): Promise<DailyMonth[]> {
      scope(generation)
      if (!/^\d{4}$/.test(year)) throw new AccountError('INVALID_INPUT')
      const raw = await service.request('dailyHistory', { data: year }, generation); scope(generation)
      return rows(raw).map(raw => { const row = record(raw); return { id: id(row.id), year: safeText(row.year, 4), month: safeText(row.month, 2), image: validateTrustedImageUrl(String(row.img ?? '')) ?? '' } })
    },
    async tasks(generation: number): Promise<AccountTask[]> {
      scope(generation); const result = parseTasks(await service.request('tasks', { type: '', filter: '' }, generation)); scope(generation); return result
    }
  }
}
