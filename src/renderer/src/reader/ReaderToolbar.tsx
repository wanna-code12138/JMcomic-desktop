import React from 'react'
import { ArrowLeft20Regular, ArrowDownload20Regular, BookOpen20Regular, Dismiss20Regular } from '@fluentui/react-icons'
import type { ReaderPreferences, ReaderState } from '../../../shared/readerContracts'

export default function ReaderToolbar({ reader, preferences, hidden, collapsed, fullscreen, downloadLabel,
  change, close, toggleDirectory, toggleSidebar, toggleFullscreen, download }: {
  reader: ReaderState; preferences: ReaderPreferences; hidden: boolean; collapsed: boolean; fullscreen: boolean; downloadLabel: string
  change: (patch: Partial<ReaderPreferences>) => void
  close: () => void; toggleDirectory: () => void; toggleSidebar: () => void; toggleFullscreen: () => void; download: () => void
}): JSX.Element {
  return <header className={`reader-toolbar ${hidden ? 'reader-chrome-hidden' : ''}`} aria-label="阅读工具栏">
    <div className="reader-toolbar-row">
      <button onClick={close} title="返回"><ArrowLeft20Regular /><span>返回</span></button>
      <div className="reader-heading"><strong>{reader.mangaTitle}</strong><span>{reader.chapterTitle}{reader.local ? ' · 离线阅读' : ''}</span></div>
      <button onClick={toggleDirectory} aria-label="目录与缩略图"><BookOpen20Regular />目录</button>
      <button onClick={toggleSidebar} aria-label={collapsed ? '展开应用侧栏' : '收起应用侧栏'} title={collapsed ? '展开应用侧栏' : '收起应用侧栏'}>☰</button>
      <button onClick={toggleFullscreen} aria-label={fullscreen ? '退出全屏' : '全屏阅读'} title="全屏 · F">{fullscreen ? <Dismiss20Regular /> : '⛶'}</button>
      {!reader.local && <button onClick={download} disabled={downloadLabel !== '下载本章'} aria-label={downloadLabel} title={downloadLabel}><ArrowDownload20Regular /><span>{downloadLabel}</span></button>}
    </div>
    <div className="reader-toolbar-row reader-controls">
      <div className="reader-segments" aria-label="阅读模式">
        <button aria-pressed={preferences.readerMode === 'scroll'} onClick={() => change({ readerMode: 'scroll' })}>连续滚动</button>
        <button aria-pressed={preferences.readerMode === 'single'} onClick={() => change({ readerMode: 'single' })}>单页阅读</button>
      </div>
      <label>适配<select aria-label="图片适配" value={preferences.readerFit} onChange={(event) => change({ readerFit: event.target.value as ReaderPreferences['readerFit'] })}>
        <option value="width">适合宽度</option><option value="height">适合高度</option><option value="original">原始尺寸</option>
      </select></label>
      <div className="reader-zoom"><button aria-label="缩小" onClick={() => change({ readerZoom: preferences.readerZoom - 0.1 })}>−</button>
        <button aria-label="重置缩放" onClick={() => change({ readerZoom: 1 })}>{Math.round(preferences.readerZoom * 100)}%</button>
        <button aria-label="放大" onClick={() => change({ readerZoom: preferences.readerZoom + 0.1 })}>＋</button></div>
      <label>宽度<select aria-label="最大阅读宽度" value={preferences.readerMaxWidth} onChange={(event) => change({ readerMaxWidth: Number(event.target.value) })}>
        {[640, 800, 960, 1200, 1600, 2400].map((width) => <option key={width} value={width}>{width} px</option>)}
      </select></label>
      <label className="reader-direction">方向<select aria-label="阅读方向" value={preferences.readerDirection} onChange={(event) => change({ readerDirection: event.target.value as 'ltr' | 'rtl' })}>
        <option value="ltr">从左向右</option><option value="rtl">从右向左</option>
      </select></label>
      <button aria-pressed={preferences.readerAutoHide} title="阅读时自动隐藏工具栏，移动鼠标或按 Tab 显示" onClick={() => change({ readerAutoHide: !preferences.readerAutoHide })}>自动隐藏</button>
    </div>
  </header>
}
