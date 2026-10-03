import React from 'react'
import type { AccountReply } from '../../../shared/accountContracts'
import { useAccountStore } from '../stores/accountStore'

export function useAccountAction() {
  const state = useAccountStore(store => store.state), sending = React.useRef(false)
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState('')
  async function run<T>(action: (generation: number, operationId: string) => Promise<AccountReply<T>>, done: (data: T) => void): Promise<void> {
    if (sending.current || state.phase !== 'authenticated') return
    sending.current = true; setBusy(true); setMessage('')
    try {
      const reply = await action(state.generation, crypto.randomUUID())
      if (useAccountStore.getState().state.generation !== state.generation) return
      if (reply.ok) { done(reply.data); setMessage('已核实并更新。') } else setMessage(reply.error)
    } catch { if (useAccountStore.getState().state.generation === state.generation) setMessage('操作结果尚未确认，请先刷新查看。') }
    finally { sending.current = false; setBusy(false) }
  }
  return { busy, message, run }
}
