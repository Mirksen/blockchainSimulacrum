import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { telemetry, installErrorTracking } from './lib/telemetry'

telemetry.start()
const stopErrorTracking = installErrorTracking()
if (import.meta.hot) import.meta.hot.dispose(stopErrorTracking)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
)
