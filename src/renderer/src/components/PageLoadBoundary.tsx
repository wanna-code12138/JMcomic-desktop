import React from 'react'
import { Button, Spinner, Text } from '@fluentui/react-components'
import { ArrowSync20Regular } from '@fluentui/react-icons'

interface PageLoadBoundaryProps {
  pageName?: string
  children: React.ReactNode | ((attempt: number) => React.ReactNode)
}

interface ErrorBoundaryInternalProps {
  onRetry: () => void
  pageName?: string
  children: React.ReactNode
}

interface ErrorBoundaryInternalState {
  hasError: boolean
  error?: Error
}

class ErrorBoundaryInternal extends React.Component<
  ErrorBoundaryInternalProps,
  ErrorBoundaryInternalState
> {
  constructor(props: ErrorBoundaryInternalProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryInternalState {
    return { hasError: true, error }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: undefined })
    this.props.onRetry()
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '240px',
            gap: '12px'
          }}
        >
          <Text weight="semibold" style={{ color: 'var(--ui-danger)' }}>
            {this.props.pageName ? `加载 ${this.props.pageName} 失败` : '页面模块加载失败'}
          </Text>
          <Text size={200} style={{ color: 'var(--ui-text-tertiary)' }}>
            网络波动或资源更新可能导致文件失效，请重试
          </Text>
          <Button
            size="small"
            appearance="primary"
            icon={<ArrowSync20Regular />}
            onClick={this.handleRetry}
          >
            重试并重新加载
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function PageLoadBoundary({
  pageName,
  children
}: PageLoadBoundaryProps): JSX.Element {
  const [retryKey, setRetryKey] = React.useState(0)

  return (
    <ErrorBoundaryInternal
      key={retryKey}
      pageName={pageName}
      onRetry={() => setRetryKey((k) => k + 1)}
    >
      <React.Suspense
        fallback={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: '200px'
            }}
          >
            <Spinner size="medium" label="页面加载中…" />
          </div>
        }
      >
        {typeof children === 'function' ? children(retryKey) : children}
      </React.Suspense>
    </ErrorBoundaryInternal>
  )
}
