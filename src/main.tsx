import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Písma přibalená k aplikaci (fungují i bez Google Fonts, včetně češtiny)
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
