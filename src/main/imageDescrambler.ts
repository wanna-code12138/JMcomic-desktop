import * as crypto from 'crypto'
import sharp from 'sharp'

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex')
}

function getNum(scrambleId: number, aid: number, filename: string): number {
  if (scrambleId === 0) return 0
  if (aid < scrambleId) return 0
  if (aid < 268850) return 10
  const x = aid < 421926 ? 10 : 8
  const s = md5(`${aid}${filename}`)
  const num = s.charCodeAt(s.length - 1) % x
  return num * 2 + 2
}

export async function descrambleImage(
  inputBuffer: Buffer,
  scrambleId: number,
  imageUrl: string
): Promise<Buffer> {
  const aidMatch = imageUrl.match(/\/(?:photos?|albums?)\/(\d+)\//)
  const aid = aidMatch ? parseInt(aidMatch[1]) : 0
  const filename = imageUrl.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''

  const c = getNum(scrambleId, aid, filename)
  if (c === 0) return inputBuffer

  const metadata = await sharp(inputBuffer).metadata()
  const w = metadata.width!
  const h = metadata.height!
  const stripH = Math.floor(h / c)
  const f = h % c

  const composites: { input: Buffer; top: number; left: number }[] = []
  for (let g = 0; g < c; g++) {
    let sh = stripH
    const srcY = h - stripH * (g + 1) - f
    let dstY = stripH * g
    if (g === 0) {
      sh += f
    } else {
      dstY += f
    }
    const strip = await sharp(inputBuffer)
      .extract({ left: 0, top: srcY, width: w, height: sh })
      .toBuffer()
    composites.push({ input: strip, top: dstY, left: 0 })
  }

  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
  })
    .composite(composites)
    .png()
    .toBuffer()
}
