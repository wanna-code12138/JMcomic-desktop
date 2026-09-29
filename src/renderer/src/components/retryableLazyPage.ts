import React from 'react'

export function createRetryableLazyPage<Props extends object = {}>(loader: () => Promise<{ default: React.ComponentType<Props> }>) {
  let attempt = -1
  let component: React.LazyExoticComponent<React.ComponentType<Props>> | null = null
  return {
    get(nextAttempt: number): React.LazyExoticComponent<React.ComponentType<Props>> {
      if (!component || attempt !== nextAttempt) {
        attempt = nextAttempt
        component = React.lazy(loader)
      }
      return component
    }
  }
}
