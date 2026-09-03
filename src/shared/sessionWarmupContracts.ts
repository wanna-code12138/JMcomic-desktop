export type WarmupPhase = 'idle' | 'verifying' | 'verified' | 'failed' | 'expired'

export type WarmupEvidence = 'known-page' | 'validated-cookie'

export type WarmupReason = 'startup' | 'browser-fallback' | 'image-auth' | 'manual'

export type WarmupFailureReason =
  | 'timeout'
  | 'window-closed'
  | 'network-error'
  | 'navigation-error'
  | 'challenge-failed'

export type WarmupState =
  | { phase: 'idle' }
  | {
      phase: 'verifying'
      attempt: number
      reason?: WarmupReason
      startedAt?: number
    }
  | {
      phase: 'verified'
      verifiedAt: number
      evidence?: WarmupEvidence
    }
  | {
      phase: 'failed'
      reason: WarmupFailureReason
      retryable: boolean
      attempt?: number
      error?: string
    }
  | {
      phase: 'expired'
      reason: 'challenge' | 'ttl'
      expiredAt?: number
    }

export type WarmupEvent =
  | {
      type: 'start'
      attempt?: number
      reason?: WarmupReason
    }
  | {
      type: 'verified'
      evidence: WarmupEvidence
      verifiedAt?: number
    }
  | {
      type: 'timeout'
    }
  | {
      type: 'fail'
      reason: WarmupFailureReason
      error?: string
      retryable?: boolean
    }
  | {
      type: 'challenge'
    }
  | {
      type: 'expire'
      reason?: 'challenge' | 'ttl'
    }
  | {
      type: 'reset'
    }

export function reduceWarmupState(state: WarmupState, event: WarmupEvent): WarmupState {
  if (event.type === 'reset') {
    return { phase: 'idle' }
  }

  switch (state.phase) {
    case 'idle': {
      if (event.type === 'start') {
        return {
          phase: 'verifying',
          attempt: event.attempt ?? 1,
          reason: event.reason,
          startedAt: Date.now()
        }
      }
      throw new Error('WARMUP_INVALID_TRANSITION')
    }

    case 'verifying': {
      if (event.type === 'verified') {
        if (!event.evidence) {
          throw new Error('WARMUP_INVALID_TRANSITION: missing evidence')
        }
        return {
          phase: 'verified',
          verifiedAt: event.verifiedAt ?? Date.now(),
          evidence: event.evidence
        }
      }
      if (event.type === 'timeout') {
        return {
          phase: 'failed',
          reason: 'timeout',
          retryable: true
        }
      }
      if (event.type === 'fail') {
        return {
          phase: 'failed',
          reason: event.reason,
          retryable: event.retryable ?? true,
          error: event.error
        }
      }
      throw new Error('WARMUP_INVALID_TRANSITION')
    }

    case 'verified': {
      if (event.type === 'challenge') {
        return {
          phase: 'expired',
          reason: 'challenge'
        }
      }
      if (event.type === 'expire') {
        return {
          phase: 'expired',
          reason: event.reason ?? 'ttl'
        }
      }
      if (event.type === 'start') {
        // 重新强制刷新验证
        return {
          phase: 'verifying',
          attempt: event.attempt ?? 1,
          reason: event.reason,
          startedAt: Date.now()
        }
      }
      throw new Error('WARMUP_INVALID_TRANSITION')
    }

    case 'failed': {
      if (event.type === 'start') {
        const nextAttempt = typeof state.attempt === 'number' ? state.attempt + 1 : (event.attempt ?? 1)
        return {
          phase: 'verifying',
          attempt: nextAttempt,
          reason: event.reason,
          startedAt: Date.now()
        }
      }
      throw new Error('WARMUP_INVALID_TRANSITION')
    }

    case 'expired': {
      if (event.type === 'start') {
        return {
          phase: 'verifying',
          attempt: event.attempt ?? 1,
          reason: event.reason,
          startedAt: Date.now()
        }
      }
      throw new Error('WARMUP_INVALID_TRANSITION')
    }

    default:
      throw new Error('WARMUP_INVALID_TRANSITION')
  }
}
