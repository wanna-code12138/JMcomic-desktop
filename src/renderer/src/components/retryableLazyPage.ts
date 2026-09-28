import React from 'react'

export function createRetryableLazyPage(loader: () => Promise<{ default: React.ComponentType }>) {
  let attempt = -1
  let component: React.LazyExoticComponent<React.ComponentType> | null = null
  return {
    get(nextAttempt: number): React.LazyExoticComponent<React.ComponentType> {
      if (!component || attempt !== nextAttempt) {
        attempt = nextAttempt
        component = React.lazy(loader)
      }
      return component
    }
  }
}
