/** Detach this subscriber without cancelling a shared operation used by another caller. */
export function waitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason ?? new Error('已取消'))
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    operation.then((value) => { signal.removeEventListener('abort', abort); resolve(value) },
      (error) => { signal.removeEventListener('abort', abort); reject(error) })
  })
}
