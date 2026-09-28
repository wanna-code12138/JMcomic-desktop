import React from 'react'
import { drawDescrambledImage } from '../../../shared/imageDescrambleCore'
import { toProxyUrl } from '../utils/image'
import { recordRendererSpan } from '../performance/rendererMetrics'
import type { PageDimensions } from './readerLayout'

export default function ReaderImage({ imageUrl, index, scrambleId, priority, onReady }: {
  imageUrl: string; index: number; scrambleId: number; priority: 'critical' | 'near'
  onReady: (dimensions: PageDimensions) => void
}): JSX.Element {
  const [attempt, setAttempt] = React.useState(0)
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const [scrambled, setScrambled] = React.useState(false)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const image = React.useRef<HTMLImageElement>(null)
  const notify = React.useRef(onReady)
  notify.current = onReady
  // Priority is selected at mount; changing the current page must not reload a decoded image.
  const [source] = React.useState(() => toProxyUrl(imageUrl, priority))
  const perf = React.useRef<ReturnType<typeof recordRendererSpan>>()
  const frame = React.useRef<number>()
  React.useEffect(() => {
    setStatus('loading')
    perf.current = recordRendererSpan('reader.image', { source: imageUrl.startsWith('jmlocal:') ? 'local' : 'online' })
    const element = canvas.current
    const request = image.current
    return () => {
      perf.current?.finish('cancelled')
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
      if (element) { element.width = 0; element.height = 0 }
      request?.removeAttribute('src')
    }
  }, [imageUrl, attempt])
  const fail = (): void => { setStatus('error'); perf.current?.finish('error') }
  const loaded = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    const image = event.currentTarget
    try {
      if (!canvas.current || !image.naturalWidth) throw new Error('图片解码失败')
      perf.current?.mark('decoded')
      const canvasPerf = recordRendererSpan('reader.canvas', { width: image.naturalWidth, height: image.naturalHeight })
      const decoded = drawDescrambledImage(canvas.current, image, scrambleId, imageUrl)
      canvasPerf.finish('ok', { scrambled: decoded })
      setScrambled(decoded)
      setStatus('ready')
      notify.current({ width: image.naturalWidth, height: image.naturalHeight })
      frame.current = requestAnimationFrame(() => perf.current?.finish('ok', { scrambled: decoded }))
    } catch { fail() }
  }
  const src = attempt === 0 ? source : `${source}${source.includes('?') ? '&' : '?'}retry=${attempt}`
  return <div className="reader-image" data-reader-image-status={status}>
    <img ref={image} key={attempt} src={src} alt={`第 ${index + 1} 页`} onLoad={loaded} onError={fail}
      crossOrigin="anonymous" draggable={false} decoding="async"
      style={{ visibility: status === 'ready' && !scrambled ? 'visible' : 'hidden' }} />
    <canvas ref={canvas} role="img" aria-label={`第 ${index + 1} 页`} style={{ display: status === 'ready' && scrambled ? 'block' : 'none' }} />
    {status === 'loading' && <div className="reader-image-state" role="status"><span className="reader-loading-dot" />正在加载第 {index + 1} 页</div>}
    {status === 'error' && <div className="reader-image-state" role="alert"><strong>这一页暂时无法显示</strong><span>其他页面仍可继续阅读</span><button onClick={() => setAttempt((value) => value + 1)}>重试第 {index + 1} 页</button></div>}
  </div>
}
