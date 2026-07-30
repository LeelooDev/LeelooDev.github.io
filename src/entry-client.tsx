// 浏览器入口：接管预渲染好的 HTML。用 hydrateRoot 而不是 createRoot，
// 这样首屏文字不会被重新挂载时清空再重画。
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { LanguageProvider } from './i18n'
import './styles.css'

hydrateRoot(
  document.getElementById('root')!,
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
)
