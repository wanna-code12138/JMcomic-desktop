import React from 'react'
import { ArrowDownload20Regular, BookOpen20Regular, FullScreenMaximize20Regular, FullScreenMinimize20Regular, MoreHorizontal20Regular } from '@fluentui/react-icons'
import type { ReaderPreferences, ReaderState } from '../../../shared/readerContracts'

export default function ReaderToolbar({ reader, preferences, fullscreen, downloadLabel, exiting,
  change, toggleDirectory, toggleFullscreen, download }: {
  reader: ReaderState; preferences: ReaderPreferences; fullscreen: boolean; downloadLabel: string
  exiting?: boolean
  change: (patch: Partial<ReaderPreferences>) => void
  toggleDirectory: () => void; toggleFullscreen: () => void; download: (chooseFormat?: boolean) => void
}): JSX.Element {
  return <header className="reader-toolbar" id="reader-tools" data-exiting={exiting} aria-hidden={exiting || undefined}
    ref={element => { if (element) element.inert = Boolean(exiting) }} aria-label="阅读工具栏">
      <select aria-label="阅读模式" value={preferences.readerMode} onChange={event => change({ readerMode: event.target.value as ReaderPreferences['readerMode'] })}>
        <option value="scroll">连续滚动</option><option value="single">单页阅读</option>
      </select>
      <select aria-label="图片适配" value={preferences.readerFit} onChange={event => change({ readerFit: event.target.value as ReaderPreferences['readerFit'] })}>
        <option value="width">适合宽度</option><option value="height">适合高度</option><option value="original">原始尺寸</option>
      </select>
      <div className="reader-zoom"><button aria-label="缩小" onClick={() => change({ readerZoom: preferences.readerZoom - 0.1 })}>−</button>
        <button aria-label="重置缩放" onClick={() => change({ readerZoom: 1 })}>{Math.round(preferences.readerZoom * 100)}%</button>
        <button aria-label="放大" onClick={() => change({ readerZoom: preferences.readerZoom + 0.1 })}>＋</button></div>
      <button onClick={toggleDirectory} aria-label="目录与缩略图" title="目录与缩略图"><BookOpen20Regular /></button>
      <button onClick={toggleFullscreen} aria-label={fullscreen ? '退出全屏' : '全屏阅读'} title="全屏 · F">{fullscreen ? <FullScreenMinimize20Regular /> : <FullScreenMaximize20Regular />}</button>
      <details className="reader-more-settings"><summary aria-label="阅读设置" title="阅读设置"><MoreHorizontal20Regular /></summary>
        <div className="reader-settings-menu">
          <strong>阅读设置</strong>
          <label>最大宽度<select aria-label="最大阅读宽度" value={preferences.readerMaxWidth} onChange={(event) => change({ readerMaxWidth: Number(event.target.value) })}>
            {[480, 640, 800, 960, 1200, 1600, 2400].map((width) => <option key={width} value={width}>{width} px</option>)}
          </select></label>
          <label>翻页方向<select aria-label="阅读方向" value={preferences.readerDirection} onChange={(event) => change({ readerDirection: event.target.value as 'ltr' | 'rtl' })}>
            <option value="ltr">从左向右</option><option value="rtl">从右向左</option>
          </select></label>
          {!reader.local && <><button onClick={() => download()} disabled={downloadLabel === '准备下载'} aria-label="下载本章"><ArrowDownload20Regular />下载本章</button>
            <button onClick={() => download(true)} disabled={downloadLabel === '准备下载'}>选择下载格式…</button>
            {downloadLabel !== '下载本章' && <small role="status">{downloadLabel}</small>}</>}
          <small>方向键翻页 · H 工具栏 · F 全屏 · Ctrl + 滚轮缩放</small>
        </div>
      </details>
  </header>
}
