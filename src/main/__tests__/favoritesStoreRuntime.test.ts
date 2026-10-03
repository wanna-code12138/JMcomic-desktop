import assert from 'node:assert/strict'
import { test } from 'node:test'
import { useFavoritesStore } from '../../renderer/src/stores/favoritesStore'

test('card mounts initialize favorites once and failed rollback preserves other operations', async () => {
  let lists = 0
  let failA!: (error: Error) => void
  Object.assign(globalThis, { window: { electronAPI: {
    favoritesList: async () => { lists++; return [] },
    favoritesAdd: async (item: { mangaId: string }) => {
      if (item.mangaId === 'a') await new Promise<void>((_resolve, reject) => { failA = reject })
    },
    favoritesRemove: async () => {}
  } } })
  await useFavoritesStore.getState().initialize()
  await useFavoritesStore.getState().initialize()
  assert.equal(lists, 1)
  const a = useFavoritesStore.getState().toggleFavorite({ mangaId: 'a', title: 'A', coverUrl: '' })
  await useFavoritesStore.getState().toggleFavorite({ mangaId: 'b', title: 'B', coverUrl: '' })
  failA(new Error('synthetic failure'))
  await a
  assert.equal(useFavoritesStore.getState().favoriteIds.has('a'), false)
  assert.equal(useFavoritesStore.getState().favoriteIds.has('b'), true)
})
