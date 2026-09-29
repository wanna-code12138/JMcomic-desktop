import { parentPort, workerData } from 'node:worker_threads'
import { writePdfPart } from './pdfWriter'
import type { PdfPageSource } from '../shared/pdfContracts'

const controller = new AbortController()
parentPort!.on('message', message => { if (message === 'cancel') controller.abort() })
const { part, pages } = workerData as { part: string; pages: PdfPageSource[] }
void writePdfPart(part, pages, controller.signal, page => parentPort!.postMessage({ page }))
  .then(result => parentPort!.postMessage({ result }), error => parentPort!.postMessage({ error: String(error) }))
  .finally(() => parentPort!.close())
