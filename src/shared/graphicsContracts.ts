export interface GraphicsStatus {
  requested: boolean
  runningPreference: boolean
  restartRequired: boolean
  initialized: boolean
  hardwareActive: boolean | null
  compositor: string
}
