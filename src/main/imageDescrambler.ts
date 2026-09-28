import { BrowserWindow } from 'electron'
import { md5, buildDescrambleSlices, getDescrambleStripCount, drawDescrambledImage } from '../shared/imageDescrambleCore'
import { imageMimeType } from '../shared/imageFormat'

/** Download and reader execute the same strip calculation and Canvas drawing. */
function buildDescrambleHtml(): string {
  return `<!DOCTYPE html><html><body><script>
const md5 = ${md5.toString()};
const getDescrambleStripCount = ${getDescrambleStripCount.toString()};
const buildDescrambleSlices = ${buildDescrambleSlices.toString()};
const drawDescrambledImage = ${drawDescrambledImage.toString()};
window.doDescramble = async function(base64, scrambleId, url, mime) {
  const image = new Image();
  image.src = 'data:' + mime + ';base64,' + base64;
  await image.decode();
  const canvas = document.createElement('canvas');
  try {
    return drawDescrambledImage(canvas, image, scrambleId, url)
      ? canvas.toDataURL('image/png').split(',')[1] : base64;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    image.src = '';
  }
};
</script></body></html>`
}

let _descrambleWin: BrowserWindow | null = null

function getDescrambleWindow(): BrowserWindow {
  if (_descrambleWin && !_descrambleWin.isDestroyed()) return _descrambleWin

  _descrambleWin = new BrowserWindow({
    show: false,
    width: 200,
    height: 200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      offscreen: true
    }
  })

  _descrambleWin.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildDescrambleHtml())}`
  )

  _descrambleWin.on('closed', () => {
    _descrambleWin = null
  })

  return _descrambleWin
}

async function doDescramble(
  inputBuffer: Buffer,
  scrambleId: number,
  imageUrl: string
): Promise<Buffer> {
  if (scrambleId <= 0) return inputBuffer

  const base64 = inputBuffer.toString('base64')
  const win = getDescrambleWindow()

  // 等待页面加载完成（首次调用时）
  await win.webContents.executeJavaScript('1')

  const resultBase64: string = await win.webContents.executeJavaScript(
    `window.doDescramble(${JSON.stringify(base64)}, ${scrambleId}, ${JSON.stringify(imageUrl)}, ${JSON.stringify(imageMimeType(inputBuffer))})`
  )

  return Buffer.from(resultBase64, 'base64')
}

// 反打乱窗口是单例，多个下载任务并发调用 executeJavaScript 会互相干扰，
// 这里用 Promise 链串行化所有反打乱请求。
let descrambleQueue: Promise<unknown> = Promise.resolve()

/**
 * 反打乱一张图片，与 ReaderImage 调用相同的共享绘制实现。
 * 通过隐藏 BrowserWindow 的 Canvas 输出无损 PNG。
 */
export function descrambleImage(
  inputBuffer: Buffer,
  scrambleId: number,
  imageUrl: string
): Promise<Buffer> {
  const run = descrambleQueue.then(() => doDescramble(inputBuffer, scrambleId, imageUrl))
  descrambleQueue = run.catch(() => {})
  return run
}
