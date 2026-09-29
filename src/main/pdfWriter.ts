import PDFDocument from 'pdfkit'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, readFile, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { setImmediate } from 'node:timers/promises'
import type { PdfPageSource, PdfWriteResult } from '../shared/pdfContracts'

interface EmbeddedImage {
  width: number; height: number; orientation?: number
  finalize?: () => void
}

export async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Run in the dedicated worker. At most one decoded image and one unflushed PDF page are retained. */
export async function writePdfPart(part: string, pages: PdfPageSource[], signal?: AbortSignal, progress?: (page: number) => void): Promise<PdfWriteResult> {
  signal?.throwIfAborted()
  if (!pages.length) throw Error('没有可以合并的图片')
  const handle = await open(part, 'wx')
  let complete = false
  const document = new PDFDocument({ autoFirstPage: false, bufferPages: false, compress: true,
    info: { Producer: 'JMComic Desktop', Creator: 'JMComic Desktop' } }) as PDFKit.PDFDocument & { openImage(bytes: Buffer): EmbeddedImage }
  const output = createWriteStream(part, { fd: handle.fd, autoClose: false })
  const closed = new Promise<void>(resolve => output.once('close', resolve))
  const done = pipeline(document, output, { signal })
  void done.catch(() => {})
  try {
    for (let index = 0; index < pages.length; index++) {
      signal?.throwIfAborted()
      const source = pages[index], bytes = await readFile(source.path, { signal })
      const image = document.openImage(bytes)
      let width = image.width, height = image.height
      if (image.orientation && image.orientation > 4) [width, height] = [height, width]
      // PNG alpha/interlace decoders hold several external buffers; V8 heap limits do not cover them.
      const maxPixels = bytes[0] === 137 ? 16_777_216 : 120_000_000
      if (!width || !height || width * height > maxPixels) throw Error('图片尺寸超过 PDF 安全内存限制，请选择逐张图片下载')
      const scale = Math.min(.75, 14400 / Math.max(width, height))
      document.addPage({ size: [width * scale, height * scale], margin: 0 })
      if (source.first && source.chapterTitle) document.outline.addItem(source.chapterTitle)
      // PDFKit 0.20 exposes openImage objects. Waiting for PNG finalization prevents async alpha decoders piling up.
      let embedded: Promise<void> = Promise.resolve()
      if (image.finalize) {
        const finalize = image.finalize
        embedded = new Promise<void>(resolve => { image.finalize = function () { finalize.call(this); resolve() } })
      }
      document.image(image as unknown as Buffer, 0, 0, { width: width * scale, height: height * scale })
      await embedded
      document.flushPages()
      progress?.(index + 1)
      do { await setImmediate(); signal?.throwIfAborted() } while (document.readableLength > 1024 * 1024 || output.writableLength > 1024 * 1024)
    }
    document.end()
    await done
    await handle.sync()
    signal?.throwIfAborted()
    const sha256 = await fileSha256(part)
    complete = true
    return { pages: pages.length, sha256 }
  } finally {
    if (!complete) { document.destroy(); output.destroy(); await done.catch(() => {}); await closed }
    try { await handle.close() } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EBADF') throw error }
    finally { if (!complete) await unlink(part).catch(() => {}) }
  }
}
