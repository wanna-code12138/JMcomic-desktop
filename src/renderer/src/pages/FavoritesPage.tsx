import React from 'react'
import { makeStyles, tokens, Text, Button } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: tokens.colorNeutralForeground3, gap: '12px' }
})

export default function FavoritesPage(): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.root}>
      <Text size={600} weight="semibold">我的收藏</Text>
      <div className={styles.placeholder}>
        <Text size={400}>❤️ 收藏列表</Text>
        <Text size={200}>登录后可同步您的禁漫天堂收藏</Text>
        <Button appearance="primary" style={{ marginTop: '16px' }}>登录账户</Button>
      </div>
    </div>
  )
}
