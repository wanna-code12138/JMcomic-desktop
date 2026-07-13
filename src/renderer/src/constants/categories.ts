export interface CategoryOption {
  value: string
  label: string
  subCategories?: { value: string; label: string }[]
}

export const CATEGORIES: CategoryOption[] = [
  { value: '0', label: '全部' },
  {
    value: 'doujin',
    label: '同人',
    subCategories: [
      { value: 'CG', label: 'CG' },
      { value: 'chinese', label: '汉化' },
      { value: 'japanese', label: '日语' }
    ]
  },
  {
    value: 'single',
    label: '单本',
    subCategories: [
      { value: 'chinese', label: '汉化' },
      { value: 'japanese', label: '日语' },
      { value: 'youth', label: 'YOUTH' }
    ]
  },
  {
    value: 'short',
    label: '短篇',
    subCategories: [
      { value: 'chinese', label: '汉化' },
      { value: 'japanese', label: '日语' }
    ]
  },
  { value: 'hanman', label: '韩漫' },
  { value: 'meiman', label: '美漫' },
  {
    value: 'another',
    label: '其他',
    subCategories: [
      { value: 'other', label: '其他漫画' },
      { value: '3d', label: '3D' },
      { value: 'cosplay', label: 'Cosplay' }
    ]
  }
]

export interface OrderOption {
  value: string
  label: string
}

export const ORDERS: OrderOption[] = [
  { value: 'mr', label: '最新' },
  { value: 'mv', label: '最多观看' },
  { value: 'mp', label: '最多图片' },
  { value: 'tf', label: '最多喜欢' },
  { value: 'tr', label: '评分' }
]

export interface TimeOption {
  value: string
  label: string
}

export const TIMES: TimeOption[] = [
  { value: 'a', label: '全部' },
  { value: 't', label: '今天' },
  { value: 'w', label: '本周' },
  { value: 'm', label: '本月' }
]

export const POPULAR_TAGS: string[] = [
  '全彩', '中文', '無修正', '純愛', 'NTR', '後宮', '巨乳', '熟女',
  '校園', '連載', '劇情', '全年齡', 'SM', '調教', '觸手', '百合',
  '貧乳', '偽娘', '性轉', '人外', '足交', '肛交', '束縛', '催眠',
  '藥物', '怪物', '異種姦', '奇幻', '科幻', '武俠', '競技', '遊戲',
  '音聲', 'CG集', '漫畫', '短篇', '單本', '同人', '韓漫', '美漫'
]
