import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDatabaseWriteCoordinator } from '../databaseWriteCoordinator'

test('a failed flush retains dirty data for retry without another user mutation', async () => {
  let attempts = 0
  const coordinator = createDatabaseWriteCoordinator({ writer: async () => { if (++attempts === 1) throw new Error('disk full') } })
  coordinator.schedule('history')
  await assert.rejects(coordinator.flush(), /disk full/)
  await coordinator.flush()
  assert.equal(attempts, 2)
})
