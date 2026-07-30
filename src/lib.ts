import type { Post } from './types'
import { POSTS, PROFILE, SETTINGS } from './content'
import { useI18n } from './i18n'

/** 阅读时长在构建时就按正文长度算好了，这里只做转发，调用方不用改。 */
export function readingMinutes(post: Post) {
  return post.readingMinutes
}

export function postDate(post: Post) {
  return post.publishedAt ?? post.updatedAt
}

/** 把 bio 拆成首句（hero 主文案）和其余部分。 */
export function splitBio(bio: string): [string, string] {
  const index = bio.indexOf('。')
  if (index === -1) return [bio, '']
  return [bio.slice(0, index + 1), bio.slice(index + 1).trim()]
}

export interface ProjectSection {
  title: string
  text: string
  bullets: string[]
}

/** 把「项目概述：… / 我的职责：… / 核心功能：·…」式的项目描述解析成结构化区块。 */
export function parseProjectDescription(description: string): ProjectSection[] {
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const sections: ProjectSection[] = []
  let current: ProjectSection | null = null
  for (const line of lines) {
    const bullet = line.match(/^[·•-]\s*(.+)$/)
    if (bullet) {
      if (!current) {
        current = { title: '', text: '', bullets: [] }
        sections.push(current)
      }
      current.bullets.push(bullet[1])
      continue
    }
    const labeled = line.match(/^([^：:]{2,10})[：:]\s*(.*)$/)
    if (labeled) {
      current = { title: labeled[1], text: labeled[2], bullets: [] }
      sections.push(current)
    } else if (current && !current.bullets.length) {
      current.text = current.text ? `${current.text}\n${line}` : line
    } else {
      current = { title: '', text: line, bullets: [] }
      sections.push(current)
    }
  }
  return sections
}

/** 项目卡片摘要：优先取「项目概述」正文，避免把标签一起显示。 */
export function projectOverview(description: string) {
  const sections = parseProjectDescription(description)
  return sections.find((section) => section.title.includes('概述') || section.title.includes('描述'))?.text
    ?? sections[0]?.text
    ?? description
}

export function slugifyHeading(text: string) {
  return text.trim().toLowerCase().replace(/[`*_[\]()]/g, '').replace(/\s+/g, '-')
}

// 静态站的数据在构建时就已生成，没有任何异步请求。这三个 hook 保留了原来
// useQuery 结果的字段形状（data / isPending / isError），页面组件因此无需改动。
// 结果对象在模块加载时构造一次，引用保持稳定，不会让下游 useMemo 反复失效。
interface StaticQuery<T> {
  data: T
  isPending: false
  isError: false
}

function settled<T>(data: T): StaticQuery<T> {
  return { data, isPending: false, isError: false }
}

const POSTS_RESULT = { zh: settled(POSTS.zh), en: settled(POSTS.en) }
const PROFILE_RESULT = { zh: settled(PROFILE.zh), en: settled(PROFILE.en) }
const SETTINGS_RESULT = settled(SETTINGS)

export function usePosts() {
  const { lang } = useI18n()
  return POSTS_RESULT[lang]
}

export function useProfile() {
  const { lang } = useI18n()
  return PROFILE_RESULT[lang]
}

export function useSiteSettings() {
  return SETTINGS_RESULT
}
