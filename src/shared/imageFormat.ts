export function imageMimeType(bytes: Uint8Array): string | null {
  const starts = (...values: number[]): boolean => values.every((value, index) => bytes[index] === value)
  const ascii = (start: number, end: number): string => String.fromCharCode(...bytes.subarray(start, end))
  if (starts(255, 216, 255)) return 'image/jpeg'
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return 'image/png'
  if (/^GIF8[79]a/.test(ascii(0, 6))) return 'image/gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(0, 2) === 'BM') return 'image/bmp'
  if (ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32))) return 'image/avif'
  return null
}

export function imageExtension(bytes: Uint8Array): string {
  const mime = imageMimeType(bytes)
  if (!mime) throw new Error('图片内容不是有效的图像格式')
  return mime === 'image/jpeg' ? 'jpg' : mime.slice(6)
}
