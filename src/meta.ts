// 每个路由的 <title> / description / og:image 单一事实源。
// 预渲染脚本用它把标签写进静态 HTML，SiteLayout 在客户端导航时用同一份逻辑更新
// document.title——两边必须一致，否则 hydrate 后会把预渲染写好的标题覆盖掉。
import { NOTES, POSTS, PROFILE, SETTINGS } from './content'
import type { ProfileLocale } from './types'

export interface PageMeta {
  title: string
  description: string
  /** 绝对路径的社交分享图，没有就不输出 og:image。 */
  image: string
}

const SECTION_TITLES: Record<string, { zh: string; en: string }> = {
  '/articles': { zh: '文章', en: 'Articles' },
  '/projects': { zh: '项目', en: 'Projects' },
  '/archive': { zh: '归档', en: 'Archive' },
  '/notes': { zh: '笔记', en: 'Notes' },
  '/about': { zh: '关于', en: 'About' },
  '/404': { zh: '页面不存在', en: 'Page not found' },
}

/** 去掉尾部斜杠，让 /articles 和 /articles/ 命中同一条规则。 */
function normalize(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

function truncate(text: string, limit = 160) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}

export function pageMeta(pathname: string, lang: ProfileLocale = 'zh'): PageMeta {
  const path = normalize(pathname)
  const site = SETTINGS.siteName
  const siteDescription = lang === 'zh'
    ? SETTINGS.siteDescription
    : 'Notes on design, code, reading, and life.'
  const fallback: PageMeta = { title: site, description: siteDescription, image: '' }

  if (path === '/') return fallback

  const section = SECTION_TITLES[path]
  if (section) {
    return { ...fallback, title: `${section[lang]} · ${site}` }
  }

  const postSlug = path.match(/^\/posts\/(.+)$/)?.[1]
  if (postSlug) {
    const post = POSTS[lang].items.find((item) => item.slug === decodeURIComponent(postSlug))
    if (!post) return fallback
    return {
      title: `${post.title} · ${site}`,
      description: truncate(post.excerpt || SETTINGS.siteDescription),
      image: post.coverUrl,
    }
  }

  const projectIndex = path.match(/^\/projects\/(\d+)$/)?.[1]
  if (projectIndex !== undefined) {
    const project = PROFILE[lang].projects[Number(projectIndex)]
    if (!project) return fallback
    return {
      title: `${project.name} · ${site}`,
      description: truncate(project.description || SETTINGS.siteDescription),
      image: project.coverUrl,
    }
  }

  const noteSlug = path.match(/^\/notes\/(.+)$/)?.[1]
  if (noteSlug) {
    const note = NOTES[lang].find((item) => item.slug === decodeURIComponent(noteSlug))
    if (!note) return fallback
    return {
      title: `${note.title} · ${site}`,
      description: truncate(note.title),
      image: note.coverUrl,
    }
  }

  return fallback
}
