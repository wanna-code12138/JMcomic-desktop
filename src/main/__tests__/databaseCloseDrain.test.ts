import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDatabaseWriteCoordinator } from '../databaseWriteCoordinator'

test('close follows the replacement flush published by a completing writer', async () => {
  let releaseFirst!: () => void, releaseSecond!: () => void, secondStarted!: () => void
  const firstGate = new Promise<void>(resolve => { releaseFirst=resolve })
  const secondGate = new Promise<void>(resolve => { releaseSecond=resolve })
  const second = new Promise<void>(resolve => { secondStarted=resolve })
  let writes=0,closed=false
  const coordinator=createDatabaseWriteCoordinator({debounceMs:10000,writer:async()=>{
    if(++writes===1)await firstGate;else{secondStarted();await secondGate}
  }})
  coordinator.schedule('history')
  const first=coordinator.flush()
  coordinator.schedule('history')
  const closing=coordinator.close().then(()=>{closed=true})
  releaseFirst();await second
  await new Promise(resolve=>setTimeout(resolve,5))
  const closedEarly=closed
  releaseSecond();await Promise.all([first,closing])
  assert.equal(closedEarly,false,'a new in-flight flush must be awaited even when dirty is already cleared')
  assert.equal(writes,2)
})
