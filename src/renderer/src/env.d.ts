/// <reference types="vite/client" />

import type { ElectronAPI } from '../../preload/index'

declare global {
  interface DownloadedFileAvailability {
    available?: boolean
    availabilityReason?: 'missing-root' | 'missing-chapter' | 'missing-pages'
  }

  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
