import { createHash } from 'crypto'
import { readFileSync } from 'fs'

export function calculateStripCount(
  scrambleId: number,
  aid: number,
  filename: string
): number {
  if (scrambleId === 0 || aid < scrambleId) return 0
  if (aid < 268850) return 10
  const modulo = aid < 421926 ? 10 : 8
  const hash = createHash('md5').update(String(aid) + filename).digest('hex')
  return (hash.charCodeAt(hash.length - 1) % modulo) * 2 + 2
}

export function buildSourceRowOrder(height: number, count: number): number[] {
  const output = new Array<number>(height)
  const base = Math.floor(height / count)
  const remainder = height % count

  for (let g = 0; g < count; g++) {
    let stripHeight = base
    let destinationY = base * g
    const sourceY = height - base * (g + 1) - remainder
    if (g === 0) stripHeight += remainder
    else destinationY += remainder

    for (let row = 0; row < stripHeight; row++) {
      output[destinationY + row] = sourceY + row
    }
  }

  return output
}

export function sourceRegionSha256(
  path: string,
  startMarker: string,
  endMarker?: string
): string {
  const source = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n')
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error(`missing start marker: ${startMarker}`)
  const end = endMarker ? source.indexOf(endMarker, start) : source.length
  if (end < 0) throw new Error(`missing end marker: ${endMarker}`)
  return createHash('sha256').update(source.slice(start, end)).digest('hex')
}
