import React, { useCallback, useEffect, useRef, useState } from 'react'

interface ZoomableImageProps {
  children: React.ReactNode
  resetKey: number
  onZoomChange?: (zoom: number) => void
  minZoom?: number
  maxZoom?: number
  step?: number
}

export default function ZoomableImage({
  children,
  resetKey,
  onZoomChange,
  minZoom = 1,
  maxZoom = 5,
  step = 0.1
}: ZoomableImageProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const zoomRef = useRef(1)
  const txRef = useRef(0)
  const tyRef = useRef(0)

  const [zoomDisplay, setZoomDisplay] = useState(1)

  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  const applyTransform = useCallback(() => {
    if (!wrapperRef.current) return
    wrapperRef.current.style.transform =
      `translate(${txRef.current}px, ${tyRef.current}px) scale(${zoomRef.current})`
  }, [])

  const clampPan = useCallback(() => {
    const viewport = viewportRef.current
    const wrapper = wrapperRef.current
    if (!viewport || !wrapper) return

    const s = zoomRef.current
    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    const img = wrapper.querySelector('img') as HTMLImageElement | null
    const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null
    const iw = canvas?.offsetWidth || img?.offsetWidth || 0
    const ih = canvas?.offsetHeight || img?.offsetHeight || 0

    const zw = iw * s
    const zh = ih * s

    if (zw > vw) {
      const maxTx = (zw - vw) / 2
      txRef.current = Math.max(-maxTx, Math.min(maxTx, txRef.current))
    } else {
      txRef.current = 0
    }

    if (zh > vh) {
      const maxTy = (zh - vh) / 2
      tyRef.current = Math.max(-maxTy, Math.min(maxTy, tyRef.current))
    } else {
      tyRef.current = 0
    }
  }, [])

  const reset = useCallback(() => {
    zoomRef.current = 1
    txRef.current = 0
    tyRef.current = 0
    setZoomDisplay(1)
    onZoomChange?.(1)
    applyTransform()
  }, [applyTransform, onZoomChange])

  // wheel zoom
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()

      const rect = viewport.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const mx = e.clientX - cx
      const my = e.clientY - cy

      const s0 = zoomRef.current
      const delta = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0
      const s1 = Math.max(minZoom, Math.min(maxZoom, s0 - delta * step))

      if (s1 === s0) return

      txRef.current = mx - (mx - txRef.current) * (s1 / s0)
      tyRef.current = my - (my - tyRef.current) * (s1 / s0)
      zoomRef.current = s1

      clampPan()
      applyTransform()
      setZoomDisplay(s1)
      onZoomChange?.(s1)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [minZoom, maxZoom, step, applyTransform, clampPan, onZoomChange])

  // drag pan
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleMouseDown = (e: MouseEvent): void => {
      e.preventDefault()
      draggingRef.current = true
      dragStartRef.current = {
        x: e.clientX, y: e.clientY,
        tx: txRef.current, ty: tyRef.current
      }
      viewport.style.cursor = 'grabbing'
    }

    const handleMouseMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      txRef.current = dragStartRef.current.tx + (e.clientX - dragStartRef.current.x)
      tyRef.current = dragStartRef.current.ty + (e.clientY - dragStartRef.current.y)
      clampPan()
      applyTransform()
    }

    const handleMouseUp = (): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      viewport.style.cursor = 'grab'
    }

    viewport.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      viewport.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [applyTransform, clampPan])

  const handleDoubleClick = useCallback((): void => {
    reset()
  }, [reset])

  // reset on page change
  useEffect(() => {
    reset()
  }, [resetKey, reset])

  // update cursor style
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.style.cursor = 'grab'
    }
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
  }, [])

  return (
    <div
      ref={viewportRef}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none'
      }}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={wrapperRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          transformOrigin: 'center center'
        }}
        onDragStart={handleDragStart}
      >
        {children}
      </div>
    </div>
  )
}
