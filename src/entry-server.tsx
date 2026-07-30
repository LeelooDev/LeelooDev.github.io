// 预渲染入口：scripts/prerender.mjs 在 Node 里调用 render()，把每个路由
// 渲染成完整 HTML（含正文）。不 import styles.css——样式由客户端产物注入。
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { App } from './App'
import { LanguageProvider } from './i18n'
import { pageMeta } from './meta'

export function render(url: string) {
  // 预渲染固定用中文：客户端首帧同样是中文，挂载后才按 localStorage 切英文，
  // 这样 hydrate 不会 mismatch。
  const html = renderToString(
    <StrictMode>
      <LanguageProvider>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </LanguageProvider>
    </StrictMode>,
  )
  return { html, meta: pageMeta(url, 'zh') }
}

export { allRoutes } from './routes'
export { POSTS, PROFILE, SETTINGS } from './content'
