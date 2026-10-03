import React from 'react'
import { useAppStore } from '../stores/appStore'

export const motionAllowed = (): boolean => document.documentElement.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches
export function animateElement(element: Element, frames: Keyframe[], duration = 180): Animation | undefined {
  if (!motionAllowed()) return
  const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.2,.8,.2,1)' })
  // Occluded software-rendered windows can suspend the document timeline mid-transition.
  // Release the effect on wall time too, so reopening never retains an old partial transform.
  const expiry = setTimeout(() => animation.cancel(), duration + 64)
  animation.finished.finally(() => clearTimeout(expiry)).catch(() => {})
  return animation
}

/** A short, cancellable exit. Hidden content becomes inert immediately and then unmounts. */
export function useExitPresence(visible: boolean): boolean {
  const enabled = useAppStore(state => state.animationsEnabled)
  const [retained, setRetained] = React.useState(visible)
  React.useLayoutEffect(() => {
    if (visible) { setRetained(true); return }
    if (!motionAllowed() || !enabled) { setRetained(false); return }
    const timer = setTimeout(() => setRetained(false), 140)
    return () => clearTimeout(timer)
  }, [visible, enabled])
  return visible || retained
}

/** Animate only header shells. No image/canvas cloning or repeated reader measurements. */
export function useTabMotion(container: React.RefObject<HTMLDivElement>, signature: string): void {
  const previous = React.useRef(new Map<string, { x: number; node: HTMLElement; width: number; height: number }>())
  React.useLayoutEffect(() => {
    const strip = container.current
    if (!strip) return
    const animations: Animation[] = [], ghosts: HTMLElement[] = [], next = new Map<string, { x: number; node: HTMLElement; width: number; height: number }>()
    for (const child of strip.querySelectorAll<HTMLElement>('.reader-tab')) {
      const id = child.querySelector<HTMLElement>('[data-reader-tab]')!.dataset.readerTab!
      const rect = child.getBoundingClientRect(), old = previous.current.get(id)
      next.set(id, { x: rect.x, width: rect.width, height: rect.height, node: child.cloneNode(true) as HTMLElement })
      const delta = old ? old.x - rect.x : 0
      if (!old || Math.abs(delta) > 1) {
        const animation = animateElement(child, [{ opacity: old ? 1 : 0, transform: `translate(${delta}px,${old ? 0 : 7}px)` }, { opacity: 1, transform: 'translate(0,0)' }])
        if (animation) animations.push(animation)
      }
    }
    if (motionAllowed()) for (const [id, item] of previous.current) {
      if (next.has(id)) continue
      const ghost = item.node
      ghost.inert = true; ghost.setAttribute('aria-hidden', 'true'); ghost.removeAttribute('data-active')
      ghost.querySelectorAll('[data-reader-tab],[data-close-reader]').forEach(node => { node.removeAttribute('data-reader-tab'); node.removeAttribute('data-close-reader') })
      Object.assign(ghost.style, { position: 'fixed', left: `${item.x}px`, top: `${strip.getBoundingClientRect().top + 5}px`, width: `${item.width}px`, height: `${item.height}px`, pointerEvents: 'none', zIndex: '51' })
      strip.parentElement!.append(ghost); ghosts.push(ghost)
      const animation = animateElement(ghost, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(7px)' }], 120)
      animation?.finished.finally(() => ghost.remove()).catch(() => {})
      if (animation) animations.push(animation)
    }
    previous.current = next
    return () => { animations.forEach(animation => animation.cancel()); ghosts.forEach(ghost => ghost.remove()) }
  }, [signature, container])
}
