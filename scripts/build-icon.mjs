import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const BUILD_DIR = resolve(ROOT, 'build')
const ICONS_DIR = resolve(BUILD_DIR, 'icons')
const ICO_PATH = resolve(BUILD_DIR, 'icon.ico')

function findEdge() {
  const paths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ]
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  throw new Error('msedge.exe not found')
}

const EDGE_EXE = findEdge()

const PNG_SIZES = [
  { size: 1024, svg: 'icon.svg' },
  { size: 256, svg: 'icon.svg' },
  { size: 128, svg: 'icon.svg' },
  { size: 64, svg: 'icon.svg' },
  { size: 48, svg: 'icon.svg' },
  { size: 32, svg: 'icon-small.svg' },
  { size: 24, svg: 'icon-small.svg' },
  { size: 16, svg: 'icon-small.svg' }
]

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

function pngPath(size) {
  return resolve(ICONS_DIR, `icon-${size}.png`)
}

function svgPath(name) {
  return resolve(BUILD_DIR, name)
}

function readPngDimensions(filePath) {
  const buf = readFileSync(filePath)
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error(`${filePath}: not a PNG`)
  }
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  return { width, height }
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

function renderPng(size, svgFile, workDir) {
  const outPath = pngPath(size)
  const svgAbsPath = svgPath(svgFile).replace(/\\/g, '/')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head>
<body><img src="file:///${svgAbsPath}" width="${size}" height="${size}"></body></html>`

  const htmlPath = resolve(workDir, `icon-${size}.html`)
  writeFileSync(htmlPath, html, 'utf-8')

  const htmlUrl = `file:///${htmlPath.replace(/\\/g, '/')}`

  console.log(`  Rendering ${size}x${size}...`)
  execFileSync(EDGE_EXE, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--user-data-dir=${resolve(workDir, 'edge-profile')}`,
    `--screenshot=${outPath}`,
    `--window-size=${size},${size}`,
    htmlUrl
  ], {
    timeout: 30000,
    stdio: 'pipe'
  })

  if (!existsSync(outPath)) {
    throw new Error(`Failed to render ${size}x${size}: output file not created`)
  }

  const { width, height } = readPngDimensions(outPath)
  if (width !== size || height !== size) {
    throw new Error(
      `Rendered ${size}x${size} but got ${width}x${height} — screenshot may be truncated`
    )
  }
}

function packIco() {
  const entries = []

  for (const size of ICO_SIZES) {
    const pngBuf = readFileSync(pngPath(size))
    entries.push({
      size,
      width: size >= 256 ? 0 : size,
      height: size >= 256 ? 0 : size,
      data: pngBuf
    })
  }

  const iconDirSize = 6
  const entrySize = 16
  const headerSize = iconDirSize + entries.length * entrySize

  let offset = headerSize
  for (const e of entries) {
    e.offset = offset
    offset += e.data.length
  }

  const buf = Buffer.alloc(offset)
  buf.writeUInt16LE(0, 0)
  buf.writeUInt16LE(1, 2)
  buf.writeUInt16LE(entries.length, 4)

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const pos = 6 + i * 16
    buf.writeUInt8(e.width, pos)
    buf.writeUInt8(e.height, pos + 1)
    buf.writeUInt8(0, pos + 2)
    buf.writeUInt8(0, pos + 3)
    buf.writeUInt16LE(1, pos + 4)
    buf.writeUInt16LE(32, pos + 6)
    buf.writeUInt32LE(e.data.length, pos + 8)
    buf.writeUInt32LE(e.offset, pos + 12)
    e.data.copy(buf, e.offset)
  }

  writeFileSync(ICO_PATH, buf)
  console.log(`  Packed ${entries.length} icons -> icon.ico (${(buf.length / 1024).toFixed(1)} KB)`)
}

function generate() {
  ensureDir(ICONS_DIR)

  const workDir = resolve(process.env['TEMP'] || tmpdir(), 'jmcomic-icon-build')
  console.log(`Temp work dir: ${workDir}`)
  rmSync(workDir, { recursive: true, force: true })
  ensureDir(workDir)

  try {
    console.log('\n=== Rendering PNGs ===')
    for (const { size, svg } of PNG_SIZES) {
      renderPng(size, svg, workDir)
    }

    console.log('\n=== Packing ICO ===')
    packIco()

    console.log('\n=== Done ===')
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

function verifyIco() {
  const buf = readFileSync(ICO_PATH)
  const reserved = buf.readUInt16LE(0)
  const type = buf.readUInt16LE(2)
  const count = buf.readUInt16LE(4)

  if (reserved !== 0) throw new Error(`ICO reserved != 0: ${reserved}`)
  if (type !== 1) throw new Error(`ICO type != 1: ${type}`)
  if (count !== ICO_SIZES.length) {
    throw new Error(`ICO count: expected ${ICO_SIZES.length}, got ${count}`)
  }

  const entries = []
  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16
    const w = buf.readUInt8(offset) || 256
    const h = buf.readUInt8(offset + 1) || 256
    const bytesInRes = buf.readUInt32LE(offset + 8)
    const imageOffset = buf.readUInt32LE(offset + 12)
    entries.push({ w, h, bytesInRes, imageOffset })
  }

  const foundSizes = entries.map((e) => Math.max(e.w, e.h)).sort((a, b) => a - b)
  const expected = [...ICO_SIZES].sort((a, b) => a - b)
  if (JSON.stringify(foundSizes) !== JSON.stringify(expected)) {
    throw new Error(`ICO sizes mismatch. Expected ${expected}, got ${foundSizes}`)
  }

  for (const entry of entries) {
    const chunk = buf.subarray(entry.imageOffset, entry.imageOffset + entry.bytesInRes)
    if (chunk.length !== entry.bytesInRes) {
      throw new Error(`Truncated PNG at offset ${entry.imageOffset}`)
    }
    if (chunk[0] !== 0x89 || chunk[1] !== 0x50 || chunk[2] !== 0x4e || chunk[3] !== 0x47) {
      throw new Error(`Entry ${entry.w}x${entry.h}: not PNG data`)
    }
    const pngW = chunk.readUInt32BE(16)
    const pngH = chunk.readUInt32BE(20)
    if (pngW !== entry.w || pngH !== entry.h) {
      throw new Error(
        `Entry declares ${entry.w}x${entry.h} but PNG is ${pngW}x${pngH}`
      )
    }
  }
}

function verify() {
  let fail = false
  console.log('=== Verifying icons ===\n')

  for (const { size } of PNG_SIZES) {
    const path = pngPath(size)
    if (!existsSync(path)) {
      console.log(`  FAIL  icon-${size}.png: missing`)
      fail = true
      continue
    }
    try {
      const { width, height } = readPngDimensions(path)
      if (width !== size || height !== size) {
        console.log(
          `  FAIL  icon-${size}.png: expected ${size}x${size}, got ${width}x${height}`
        )
        fail = true
      } else {
        console.log(`  OK    icon-${size}.png: ${width}x${height}`)
      }
    } catch (e) {
      console.log(`  FAIL  icon-${size}.png: ${e.message}`)
      fail = true
    }
  }

  if (!existsSync(ICO_PATH)) {
    console.log('\n  FAIL  icon.ico: missing')
    fail = true
  } else {
    try {
      verifyIco()
      console.log(`\n  OK    icon.ico: ${ICO_SIZES.length} entries [${ICO_SIZES.join(', ')}]`)
    } catch (e) {
      console.log(`\n  FAIL  icon.ico: ${e.message}`)
      fail = true
    }
  }

  if (fail) {
    console.log('\n=== VERIFY FAILED ===')
    process.exit(1)
  }
  console.log('\n=== VERIFY PASSED ===')
}

const mode = process.argv[2]
if (mode === '--verify') {
  verify()
} else {
  generate()
}
