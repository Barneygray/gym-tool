import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/global.css'

// The outer boundary is the backstop: anything the shell itself throws — a
// chunk that won't load, a bad record read out of storage on boot — lands here
// instead of emptying the page with no way back but killing the app.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
