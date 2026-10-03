// Self-contained so the same predicate can run inside the verification WebContents.
export function isVerificationPageReady(page: Document): boolean {
  const text = page.body?.innerText ?? ''
  if (/Just a moment|Checking|Attention Required|DDoS/i.test(page.title)
    || text.includes('Enable JavaScript and cookies to continue')) return false
  const controls = page.querySelectorAll<HTMLElement>('button, a, label, input[type="button"], input[type="submit"]')
  for (const control of controls) {
    if (control.tagName === 'A' && /\/(?:album|photo)\//.test(control.getAttribute('href') ?? '')) continue
    const label = `${control.textContent ?? ''} ${(control as HTMLInputElement).value ?? ''}`
    if (!/(?:我|本人).*(?:18|１８|成年)|(?:已满|已滿|滿|满|over|above).*(?:18|１８)|(?:I am|I'm).*(?:18|adult)/i.test(label)) continue
    const bounds = control.getBoundingClientRect()
    const style = page.defaultView?.getComputedStyle(control)
    if (bounds.width > 0 && bounds.height > 0 && style?.visibility !== 'hidden' && style?.display !== 'none') return false
  }
  return Boolean(page.querySelector('a[href*="/album/"], a[href*="/photo/"]'))
}
