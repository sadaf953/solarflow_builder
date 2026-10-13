import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

import GlobalErrorBoundary from './components/GlobalErrorBoundary'
import { GlobalPopupProvider } from './components/GlobalPopup'
import { setupGlobalErrorHandling } from './utils/globalErrors'
import './index.css'

// Setup global error and unhandled promise rejection listeners
setupGlobalErrorHandling()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <GlobalPopupProvider>
        <App />
      </GlobalPopupProvider>
    </GlobalErrorBoundary>
  </StrictMode>,
)