import React from 'react'
import { makeStyles, tokens, Text } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: tokens.colorNeutralForeground3, gap: '12px' }
})

export default function CategoriesPage(): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.root}>
      <Text size={600} weight="semibold">分类浏览</Text>
      <div className={styles.placeholder}>
        <Text size={400}>🏷️ 分类功能开发中</Text>
        <Text size={200}>即将支持按标签、类型筛选漫画</Text>
      </div>
    </div>
  )
}
