import React from 'react'
import {
  makeStyles,
  tokens,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Input,
  Text,
  Spinner
} from '@fluentui/react-components'
import { Person20Regular, Key20Regular } from '@fluentui/react-icons'

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingTop: '8px'
  },
  inputRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ac-text-2)'
  },
  error: {
    color: 'var(--ac-danger)',
    fontSize: '13px',
    marginTop: '4px'
  }
})

interface LoginDialogProps {
  open: boolean
  onClose: () => void
  onLogin: (username: string, password: string) => Promise<boolean>
}

export default function LoginDialog({ open, onClose, onLogin }: LoginDialogProps): JSX.Element {
  const styles = useStyles()
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const handleLogin = async (): Promise<void> => {
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const ok = await onLogin(username.trim(), password)
      if (ok) {
        onClose()
      } else {
        setError('登录失败，请检查用户名和密码')
      }
    } catch {
      setError('网络错误，请检查连接后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_e, d) => { if (!d.open) onClose() }}>
      <DialogSurface
        style={{
          backgroundColor: 'var(--ac-glass-bg)',
          backdropFilter: 'blur(var(--ac-blur-dialog))',
          WebkitBackdropFilter: 'blur(var(--ac-blur-dialog))',
          border: '1px solid var(--ac-glass-border)',
          boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)',
          borderRadius: 'var(--ac-radius-panel)'
        }}
      >
        <DialogBody>
          <DialogTitle>登录禁漫天堂</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <div className={styles.inputRow}>
                <span className={styles.label}>用户名 / 邮箱</span>
                <Input
                  placeholder="输入用户名或邮箱"
                  value={username}
                  onChange={(_e, d) => setUsername(d.value)}
                  contentBefore={<Person20Regular />}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
                  disabled={loading}
                  autoFocus
                  size="large"
                />
              </div>
              <div className={styles.inputRow}>
                <span className={styles.label}>密码</span>
                <Input
                  type="password"
                  placeholder="输入密码"
                  value={password}
                  onChange={(_e, d) => setPassword(d.value)}
                  contentBefore={<Key20Regular />}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
                  disabled={loading}
                  size="large"
                />
              </div>
              {error && <div className={styles.error}>{error}</div>}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={loading}>
              取消
            </Button>
            <Button appearance="primary" onClick={handleLogin} disabled={loading}>
              {loading ? <Spinner size="tiny" /> : '登录'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
