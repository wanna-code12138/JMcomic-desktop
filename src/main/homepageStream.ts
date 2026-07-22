export function diffCards<T extends { id: string }>(knownIds: Set<string>, current: T[]): T[] {
  return current.filter((c) => !knownIds.has(c.id))
}

export function shouldStopPolling(countHistory: number[], stableCount: number): boolean {
  if (countHistory.length < stableCount) return false
  const lastN = countHistory.slice(-stableCount)
  const first = lastN[0]
  if (first <= 0) return false
  return lastN.every((n) => n === first)
}
