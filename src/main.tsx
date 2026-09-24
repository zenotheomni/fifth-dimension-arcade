import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AudioProvider } from './arcade/audio/AudioProvider'
import App from './App'
import './arcade/arcade.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/arcade">
      <AudioProvider>
        <App />
      </AudioProvider>
    </BrowserRouter>
  </StrictMode>,
)
