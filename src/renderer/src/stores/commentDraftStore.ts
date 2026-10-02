import { useAccountStore } from './accountStore'

export function createCommentDrafts() {
  const drafts = new Map<string, { text: string; uncertain: boolean }>()
  const read = (key: string): { text: string; uncertain: boolean } => ({ ...(drafts.get(key) ?? { text: '', uncertain: false }) })
  const save = (key: string, value: { text: string; uncertain: boolean }): void => {
    drafts.delete(key); drafts.set(key, value)
    while (drafts.size > 20) drafts.delete(drafts.keys().next().value!)
  }
  return { read,
    write(key: string, text: string) { save(key, { ...read(key), text: text.slice(0, 2000) }) },
    markUncertain(key: string) { save(key, { ...read(key), uncertain: true }) },
    clear() { drafts.clear() }, remove(key: string) { drafts.delete(key) },
    acknowledge(key: string) { save(key, { ...read(key), uncertain: false }) }
  }
}
export const commentDrafts = createCommentDrafts()
useAccountStore.subscribe((next, previous) => { if (next.state.generation !== previous.state.generation) commentDrafts.clear() })
