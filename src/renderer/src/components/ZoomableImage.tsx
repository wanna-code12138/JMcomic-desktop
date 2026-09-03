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
  const rafIdRef = useRef<number | null>(null)
  const lastZoomNotifyTimeRef = useRef(0)

  const [, setZoomDisplay] = useState(1)

  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const dimensionsRef = useRef({ vw: 0, vh: 0, iw: 0, ih: 0 })

  const updateDimensions = useCallback(() => {
    const viewport = viewportRef.current
    const wrapper = wrapperRef.current
    if (!viewport || !wrapper) return

    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    const img = wrapper.querySelector('img') as HTMLImageElement | null
    const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null
    const iw = canvas?.offsetWidth || img?.offsetWidth || 0
    const ih = canvas?.offsetHeight || img?.offsetHeight || 0

    dimensionsRef.current = { vw, vh, iw, ih }
  }, [])

  const clampPan = useCallback(() => {
    const { vw, vh, iw, ih } = dimensionsRef.current
    const s = zoomRef.current
    const zw = iw * s
    const zh = ih * s

    if (zw > vw && vw > 0) {
      const maxTx = (zw - vw) / 2
      txRef.current = Math.max(-maxTx, Math.min(maxTx, txRef.current))
    } else {
      txRef.current = 0
    }

    if (zh > vh && vh > 0) {
      const maxTy = (zh - vh) / 2
      tyRef.current = Math.max(-maxTy, Math.min(maxTy, tyRef.current))
    } else {
      tyRef.current = 0
    }
  }, [])

  const scheduleTransform = useCallback(() => {
    if (rafIdRef.current !== null) return
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      if (!wrapperRef.current) return
      clampPan()
      wrapperRef.current.style.transform =
        `translate(${txRef.current}px, ${tyRef.current}px) scale(${zoomRef.current})`
    })
  }, [clampPan])

  const notifyZoom = useCallback((s: number) => {
    const now = Date.now()
    if (now - lastZoomNotifyTimeRef.current >= 100) {
      lastZoomNotifyTimeRef.current = now
      setZoomDisplay(s)
    }
    onZoomChange?.(s)
  }, [onZoomChange])

  const reset = useCallback(() => {
    zoomRef.current = 1
    txRef.current = 0
    tyRef.current = 0
    setZoomDisplay(1)
    onZoomChange?.(1)
    if (wrapperRef.current) {
      wrapperRef.current.style.transform = 'translate(0px, 0px) scale(1)'
    }
  }, [onZoomChange])

  // ResizeObserver 缓存尺寸
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const ro = new ResizeObserver(() => {
      updateDimensions()
      clampPan()
      scheduleTransform()
    })

    ro.observe(viewport)
    updateDimensions()

    return () => {
      ro.disconnect()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [updateDimensions, clampPan, scheduleTransform])

  // wheel zoom（通过 rAF 防抖合并）
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      updateDimensions()

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

      scheduleTransform()
      notifyZoom(s1)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [minZoom, maxZoom, step, scheduleTransform, notifyZoom, updateDimensions])

  // Pointer Events 拖动
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    updateDimensions()
    draggingRef.current = true
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: txRef.current,
      ty: tyRef.current
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (viewportRef.current) viewportRef.current.style.cursor = 'grabbing'
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    txRef.current = dragStartRef.current.tx + (e.clientX - dragStartRef.current.x)
    tyRef.current = dragStartRef.current.ty + (e.clientY - dragStartRef.current.y)
    scheduleTransform()
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    if (viewportRef.current) viewportRef.current.style.cursor = 'grab'
  }

  const handleDoubleClick = useCallback((): void => {
    reset()
  }, [reset])

  useEffect(() => {
    reset()
  }, [resetKey, reset])

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.style.cursor = 'grab'
    }
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
        userSelect: 'none',
        touchAction: 'none'
      }}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
      >
        {children}
      </div>
    </div>
  )
}
