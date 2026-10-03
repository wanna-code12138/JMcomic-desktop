import React from 'react'
import { DocumentPdf24Regular, ImageMultiple24Regular } from '@fluentui/react-icons'
import { useDownloadChoice } from './downloadRequest'

export default function DownloadFormatDialog(): JSX.Element {
  const pending = useDownloadChoice(state => state.pending)
  const dialog = React.useRef<HTMLDialogElement>(null)
  const [format, setFormat] = React.useState<'images' | 'pdf'>('images')
  const [remember, setRemember] = React.useState(false)
  React.useEffect(() => {
    if (pending) { setFormat(pending.selected); setRemember(false); dialog.current?.showModal() }
    else dialog.current?.close()
  }, [pending])
  return <dialog ref={dialog} data-download-format-dialog className="workspace-dialog download-format-dialog" aria-label="选择下载格式"
    onCancel={() => pending?.answer(null)}>
    <form onSubmit={event => { event.preventDefault(); pending?.answer({ format, remember }) }}>
      <h2>以什么方式保存？</h2><p className="download-format-title">{pending?.title} · {pending?.count} 章</p>
      <div className="download-format-options" role="radiogroup" aria-label="下载格式">
        <button type="button" role="radio" aria-checked={format === 'images'} data-format-option="images" onClick={() => setFormat('images')}><ImageMultiple24Regular /><span><strong>逐张图片</strong><small>保留漫画与章节文件夹，支持应用内离线阅读。</small></span></button>
        <button type="button" role="radio" aria-checked={format === 'pdf'} data-format-option="pdf" onClick={() => setFormat('pdf')}><DocumentPdf24Regular /><span><strong>合并为一个 PDF</strong><small>所选章节按顺序合并，直接保存到下载根目录。</small></span></button>
      </div>
      <label className="download-remember"><input type="checkbox" aria-label="记住下载格式" checked={remember} onChange={event => setRemember(event.target.checked)} />记住这个选择，下次直接下载</label>
      <p>可以随时在设置中修改，或使用“选择下载格式”。</p>
      <div className="workspace-dialog-actions"><button type="button" onClick={() => pending?.answer(null)}>取消</button><button type="submit" className="primary">开始下载</button></div>
    </form>
  </dialog>
}
