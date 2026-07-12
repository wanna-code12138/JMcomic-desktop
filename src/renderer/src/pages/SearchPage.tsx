import React from 'react'
import {
  makeStyles, tokens, Input, Button, Text,
  SearchBox
} from '@fluentui/react-components'
import { Search20Regular } from '@fluentui/react-icons'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  searchBar: { maxWidth: '600px', marginBottom: '24px' },
  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: tokens.colorNeutralForeground3, gap: '12px' }
})

export default function SearchPage(): JSX.Element {
  const styles = useStyles()
  const [query, setQuery] = React.useState('')

  return (
    <div className={styles.root}>
      <Text size={600} weight="semibold" style={{ marginBottom: '16px', display: 'block' }}>搜索漫画</Text>
      <div className={styles.searchBar}>
        <SearchBox
          placeholder="输入关键词或车号搜索..."
          value={query}
          onChange={(_e, d) => setQuery(d.value)}
          size="large"
          style={{ width: '100%' }}
        />
      </div>
      <div className={styles.placeholder}>
        <Text size={400}>🔍 输入关键词开始搜索</Text>
        <Text size={200}>支持按标题、作者、标签搜索</Text>
      </div>
    </div>
  )
}
