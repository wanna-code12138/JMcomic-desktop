import type { AccountService } from './accountService'
import type { FavoriteFolder, FolderMutation, TagMutation, HistoryMutation, EditableProfile, ProfileMutation } from '../../shared/accountContracts'
import { createAccountOperations } from './accountOperations'
import { AccountError, accountError } from './accountErrors'
import { id, parseLibrary, rows } from './accountParser'
import { record } from '../comments/commentParser'
import type { AccountEndpoint } from './accountTransport'
import { accountTextKey } from './accountText'

function text(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new AccountError('INVALID_INPUT')
  return value
}
const profileKeys = ['nickName', 'aboutMe', 'website'] as const
function narrowProfile(raw: unknown, input = false): EditableProfile {
  const value = record(raw)
  if (input && Object.keys(value).some(key => !(profileKeys as readonly string[]).includes(key))) throw new AccountError('INVALID_INPUT')
  try {
    return { nickName: text(value.nickName, 120, true), aboutMe: text(value.aboutMe, 2000, true), website: text(value.website, 500, true) }
  } catch { throw new AccountError(input ? 'INVALID_INPUT' : 'PROTOCOL') }
}
export function createAccountManagement(service: AccountService) {
  const { scope, operate } = createAccountOperations(service)
  async function folders(generation: number): Promise<FavoriteFolder[]> {
    scope(generation)
    const raw = await service.request('favorites', { page: '1', folder_id: '0', o: 'mr' }, generation); scope(generation)
    const list = record(raw).folder_list
    if (!Array.isArray(list) || list.length > 1000 || list.some(row => !/^\d{1,12}$/.test(String(record(row).FID ?? record(row).id)))) throw new AccountError('PROTOCOL')
    return parseLibrary(raw, 1, service.imageOrigin()).folders
  }
  async function member(kind: 'favorites' | 'history', albumId: string, generation: number, folderId = '0'): Promise<boolean> {
    const seen = new Set<string>(), deadline = Date.now() + 15_000
    for (let page = 1; page <= 50 && Date.now() < deadline; page++) {
      scope(generation)
      const params: Record<string, string> = { page: String(page) }
      if (kind === 'favorites') { params.folder_id = folderId; params.o = 'mr' }
      const result = parseLibrary(await service.request(kind, params, generation), page, service.imageOrigin(), kind); scope(generation)
      if (result.items.some(item => item.id === albumId)) return true
      const previous = seen.size; result.items.forEach(item => seen.add(item.id))
      if (result.total !== null && seen.size >= result.total) return false
      if (!result.hasMore && result.total === null) return false
      if (previous === seen.size || !result.hasMore) break
    }
    throw new AccountError('UNAVAILABLE')
  }
  async function reconcile<T>(endpoint: AccountEndpoint, params: Record<string, string>, generation: number, read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
    let failure: unknown
    try { await service.request(endpoint, params, generation) } catch (error) { failure = accountError(error) }
    scope(generation)
    let after: T
    try { after = await read() } catch { scope(generation); throw new AccountError('OUTCOME_UNKNOWN') }
    scope(generation)
    if (!matches(after)) throw failure instanceof AccountError && !['NETWORK', 'PROTOCOL'].includes(failure.code) ? failure : new AccountError('OUTCOME_UNKNOWN')
    return after
  }
  async function tags(generation: number): Promise<string[]> {
    scope(generation)
    const raw = await service.request('tags', {}, generation); scope(generation)
    const list = rows(raw)
    if (!Array.isArray(record(raw).list) || (record(raw).list as unknown[]).length > 1000) throw new AccountError('PROTOCOL')
    return [...new Set(list.map(row => { const tag = record(row).tag; if (typeof tag !== 'string' || !tag || tag.length > 80) throw new AccountError('PROTOCOL'); return tag }))]
  }
  async function profile(generation: number): Promise<EditableProfile> {
    scope(generation)
    const raw = await service.request('profile', { uid: id(service.getState().profile?.uid) }, generation); scope(generation)
    return narrowProfile(raw)
  }
  return { folders, tags, profile,
    async folder(query: FolderMutation): Promise<FavoriteFolder[]> {
      if (!['add', 'rename', 'move', 'delete'].includes(query.action)) throw new AccountError('INVALID_INPUT')
      if (query.action !== 'add' && (id(query.folderId) === '0')) throw new AccountError('INVALID_INPUT')
      const name = query.action === 'add' || query.action === 'rename' ? text(query.name, 80).trim() : ''
      if (query.action === 'move') id(query.albumId)
      if (query.action === 'delete' && query.confirmed !== true) throw new AccountError('INVALID_INPUT')
      return operate(query.generation, query.operationId, 'folders', JSON.stringify(query), async () => {
        const before = await folders(query.generation)
        if (query.action === 'add' && before.some(folder => accountTextKey(folder.name) === accountTextKey(name))) throw new AccountError('CONFLICT')
        if (query.action !== 'add' && !before.some(folder => folder.id === query.folderId)) throw new AccountError('CONFLICT')
        if (query.action === 'rename' && before.some(folder => folder.id !== query.folderId && accountTextKey(folder.name) === accountTextKey(name))) throw new AccountError('CONFLICT')
        if (query.action === 'rename' && accountTextKey(before.find(folder => folder.id === query.folderId)!.name) === accountTextKey(name)) return before
        if (query.action === 'delete') {
          const raw = await service.request('favorites', { page: '1', folder_id: query.folderId, o: 'mr' }, query.generation); scope(query.generation)
          const contents = parseLibrary(raw, 1, service.imageOrigin())
          if (contents.total !== 0 || contents.items.length !== 0 || contents.hasMore) throw new AccountError('NOT_EMPTY')
        }
        if (query.action === 'move') {
          if (await member('favorites', query.albumId, query.generation, query.folderId)) return before
          if (!await member('favorites', query.albumId, query.generation)) throw new AccountError('CONFLICT')
          await reconcile('folder', { type: 'move', folder_id: query.folderId, aid: query.albumId }, query.generation,
            () => member('favorites', query.albumId, query.generation, query.folderId), Boolean)
          return folders(query.generation)
        }
        const params: Record<string, string> = { type: query.action === 'rename' ? 'edit' : query.action === 'delete' ? 'del' : 'add' }
        if (query.action !== 'add') params.folder_id = query.folderId
        if (name) params.folder_name = name
        return reconcile('folder', params, query.generation, () => folders(query.generation), after =>
          query.action === 'add' ? after.some(folder => accountTextKey(folder.name) === accountTextKey(name) && !before.some(old => old.id === folder.id)) :
            query.action === 'delete' ? !after.some(folder => folder.id === query.folderId) : after.some(folder => folder.id === query.folderId && accountTextKey(folder.name) === accountTextKey(name)))
      })
    },
    async tag(query: TagMutation): Promise<string[]> {
      const tag = text(accountTextKey(text(query.tag, 80).trim()), 80)
      if (tag.includes(',') || /[\r\n]/.test(tag) || typeof query.desired !== 'boolean') throw new AccountError('INVALID_INPUT')
      return operate(query.generation, query.operationId, 'tags', JSON.stringify(query), async () => {
        const before = await tags(query.generation)
        if (before.includes(tag) === query.desired) return before
        return reconcile('tagsUpdate', { type: query.desired ? 'add' : 'remove', tags: tag }, query.generation, () => tags(query.generation), after => after.includes(tag) === query.desired)
      })
    },
    async removeHistory(query: HistoryMutation): Promise<{ removed: true }> {
      id(query.albumId); if (query.confirmed !== true) throw new AccountError('INVALID_INPUT')
      return operate(query.generation, query.operationId, 'history', JSON.stringify(query), async () => {
        if (await member('history', query.albumId, query.generation)) await reconcile('historyDelete', { id: query.albumId }, query.generation,
          () => member('history', query.albumId, query.generation), present => !present)
        return { removed: true }
      })
    },
    async editProfile(query: ProfileMutation): Promise<EditableProfile> {
      const expected = narrowProfile(query.expected, true), value = narrowProfile(query.value, true)
      if (value.website) { let url: URL; try { url = new URL(value.website) } catch { throw new AccountError('INVALID_INPUT') }; if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new AccountError('INVALID_INPUT') }
      return operate(query.generation, query.operationId, 'profile', JSON.stringify(query), async () => {
        const before = await profile(query.generation)
        if (profileKeys.some(key => before[key] !== expected[key])) throw new AccountError('CONFLICT')
        const changed = profileKeys.filter(key => before[key] !== value[key])
        if (!changed.length) return before
        const params: Record<string, string> = { uid: id(service.getState().profile?.uid) }
        changed.forEach(key => { params[key] = value[key] })
        return reconcile('profileUpdate', params, query.generation, () => profile(query.generation), after => profileKeys.every(key => key === 'website' ? after[key] === value[key] : accountTextKey(after[key]) === accountTextKey(value[key])))
      })
    }
  }
}
