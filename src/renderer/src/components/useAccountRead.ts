import React from 'react'
import type { AccountReply } from '../../../shared/accountContracts'
import { useAccountStore } from '../stores/accountStore'

export function useAccountRead<T>(visible: boolean, load: (generation: number) => Promise<AccountReply<T>>) {
  const state = useAccountStore(store => store.state)
  const [value, setValue] = React.useState<{ generation: number; data: T } | null>(null)
  const [error, setError] = React.useState(''), [loading, setLoading] = React.useState(false), [revision, setRevision] = React.useState(0)
  React.useEffect(() => {
    if (!visible || state.phase !== 'authenticated') return
    let cancelled = false
    setLoading(true); setError(''); setValue(null)
    void load(state.generation).then(reply => {
      if (cancelled) return
      if (reply.ok) setValue({ generation: state.generation, data: reply.data }); else setError(reply.error)
    }).catch(() => { if (!cancelled) setError('加载失败，请稍后重试。') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [visible, state.generation, state.phase, load, revision])
  return { data: value?.generation === state.generation ? value.data : null, error, loading,
    refresh: () => setRevision(value => value + 1),
    replace: (data: T) => { if (useAccountStore.getState().state.generation === state.generation) setValue({ generation: state.generation, data }) } }
}
