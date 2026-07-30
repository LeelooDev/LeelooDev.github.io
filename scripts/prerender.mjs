// 预渲染：把每个路由渲染成带正文的静态 HTML，并顺带产出 RSS、sitemap、robots。
// 依赖 vite build（客户端产物 dist/）和 vite build --ssr（服务端产物 dist-ssr/）都已跑完。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

const { render, allRoutes, POSTS, SETTINGS } = await import(join(ROOT, 'dist-ssr', 'entry-server.js'))

const template = readFileSync(join(DIST, 'index.html'), 'utf8')
for (const marker of ['<!--app-html-->', '<!--app-head-->']) {
  if (!template.includes(marker)) {
    throw new Error(`dist/index.html 里找不到 ${marker}，预渲染无法注入内容`)
  }
}

const SITE = SETTINGS.siteUrl.replace(/\/+$/, '')

const escape = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 站内路径转绝对 URL；已经是绝对地址（含 data:）的原样返回。 */
const absolute = (path) => (/^[a-z][a-z0-9+.-]*:/i.test(path) ? path : `${SITE}${path}`)

function headTags(route, meta) {
  const isPost = route.startsWith('/posts/')
  // 404 页永远不该进索引，其余页面听站点设置的。
  const robots = route === '/404' || !SETTINGS.allowIndexing ? 'noindex,nofollow' : 'index,follow'
  const tags = [
    `<link rel="canonical" href="${escape(absolute(route))}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="${isPost ? 'article' : 'website'}" />`,
    `<meta property="og:site_name" content="${escape(SETTINGS.siteName)}" />`,
    `<meta property="og:title" content="${escape(meta.title)}" />`,
    `<meta property="og:description" content="${escape(meta.description)}" />`,
    `<meta property="og:url" content="${escape(absolute(route))}" />`,
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" />`,
    `<link rel="alternate" type="application/rss+xml" title="${escape(SETTINGS.siteName)}" href="/rss.xml" />`,
  ]
  if (meta.image) tags.push(`<meta property="og:image" content="${escape(absolute(meta.image))}" />`)
  return tags.join('\n    ')
}

/**
 * React 19 会给 <img> 自动生成 <link rel="preload">，renderToString 把它们内联进正文；
 * 而客户端 hydrate 时 React 又会把这些 link 提到 <head>，两边 DOM 于是对不上
 * （React error #418，整棵树退化成客户端渲染，预渲染的收益就白费了）。
 * 这里在构建时先把它们挪进 head——既消除 mismatch，preload 也只有放在 head 才真正提前发请求。
 */
function liftPreloads(html) {
  const links = []
  const body = html.replace(/<link\s[^>]*?rel="preload"[^>]*?>/g, (tag) => {
    links.push(tag)
    return ''
  })
  return { body, links: [...new Set(links)] }
}

function buildPage(route, meta, html) {
  const { body, links } = liftPreloads(html)
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(meta.title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escape(meta.description)}" />`,
    )
    .replace('<!--app-head-->', [...links, headTags(route, meta)].join('\n    '))
    .replace('<!--app-html-->', body)
}

/** 路由 → 产物路径：/ 落在 dist/index.html，其余落在 dist/<route>/index.html。 */
function outputPath(route) {
  return route === '/' ? join(DIST, 'index.html') : join(DIST, route, 'index.html')
}

const routes = allRoutes()
for (const route of routes) {
  const { html, meta } = render(route)
  const file = outputPath(route)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, buildPage(route, meta, html))
}

// GitHub Pages 对未命中的路径返回根目录的 404.html。
{
  const route = '/404'
  const { html, meta } = render(route)
  writeFileSync(join(DIST, '404.html'), buildPage(route, meta, html))
}

// ===== 顺带产出 =====

const posts = POSTS.zh.items

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(SETTINGS.siteName)}</title>
    <link>${SITE}/</link>
    <description>${escape(SETTINGS.siteDescription)}</description>
    <language>zh-CN</language>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
${posts
  .map(
    (post) => `    <item>
      <title>${escape(post.title)}</title>
      <link>${SITE}/posts/${post.slug}</link>
      <guid isPermaLink="true">${SITE}/posts/${post.slug}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <description>${escape(post.excerpt)}</description>
    </item>`,
  )
  .join('\n')}
  </channel>
</rss>
`

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map((route) => {
    const post = posts.find((item) => `/posts/${item.slug}` === route)
    const lastmod = post ? `\n    <lastmod>${post.updatedAt.slice(0, 10)}</lastmod>` : ''
    return `  <url>\n    <loc>${absolute(route)}</loc>${lastmod}\n  </url>`
  })
  .join('\n')}
</urlset>
`

const robots = SETTINGS.allowIndexing
  ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`
  : `User-agent: *\nDisallow: /\n`

writeFileSync(join(DIST, 'rss.xml'), rss)
writeFileSync(join(DIST, 'sitemap.xml'), sitemap)
writeFileSync(join(DIST, 'robots.txt'), robots)
// 不加这个文件，GitHub Pages 会用 Jekyll 处理产物并忽略下划线开头的资源目录。
writeFileSync(join(DIST, '.nojekyll'), '')

console.log(`预渲染 ${routes.length} 个路由 + 404.html，RSS ${posts.length} 篇`)
