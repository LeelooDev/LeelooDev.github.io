// 数据契约：从 dev-notes 的 @macoazo/api-client 剪裁而来。
// 静态站没有运行时 API，所以只保留公开站读取用得上的类型——
// 去掉了 createApiClient、全部 admin 类型，以及 AI 数字分身相关的字段。

export type PostStatus = 'draft' | 'published'
export type PostCategory = string

/** 正文里的二级标题，id 与 html 中的锚点一一对应。 */
export interface PostHeading {
  id: string
  label: string
}

export interface Post {
  id: string
  slug: string
  title: string
  excerpt: string
  /** 构建时编译好的正文 HTML（已 sanitize、已高亮、已包好代码块外壳）。 */
  html: string
  /** 构建时抽好的目录。 */
  toc: PostHeading[]
  /** 构建时按正文长度估的阅读时长（分钟）。 */
  readingMinutes: number
  category: PostCategory
  tags: string[]
  coverUrl: string
  coverAlt: string
  status: PostStatus
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Note {
  slug: string
  title: string
  date: string
  group: string
  groupOrder: number
  noteOrder: number
  coverUrl: string
  coverAlt: string
  html: string
  toc: PostHeading[]
  readingMinutes: number
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface SiteSettings {
  /** 站点绝对地址，不带尾斜杠。RSS、sitemap 和 og:url 需要它拼绝对链接。 */
  siteUrl: string
  siteName: string
  siteDescription: string
  contactEmail: string
  postsPerPage: number
  allowIndexing: boolean
}

export interface ProfileContact {
  type: string
  label: string
  url: string
}

export interface ProfileProject {
  name: string
  role: string
  period: string
  description: string
  tech: string[]
  link: string
  coverUrl: string
}

export interface ProfileSkillGroup {
  category: string
  items: string[]
}

export interface ProfileExperience {
  org: string
  role: string
  period: string
  description: string
}

export interface ProfileEducation {
  school: string
  degree: string
  period: string
}

export interface ProfileOpenSource {
  repo: string
  description: string
  stars: string
  link: string
}

export interface ProfileNowItem {
  title: string
  note: string
}

export interface ProfileNowSection {
  label: string
  items: ProfileNowItem[]
}

/** 「此刻」页数据：updatedAt 为展示用文本（如 2026-07-07）。 */
export interface ProfileNow {
  updatedAt: string
  sections: ProfileNowSection[]
}

/** 简历内容按语言各存一份；英文未填写的字段在构建时回退中文。 */
export type ProfileLocale = 'zh' | 'en'

export interface Profile {
  name: string
  title: string
  avatarUrl: string
  location: string
  headline: string
  bio: string
  philosophy: string
  contacts: ProfileContact[]
  projects: ProfileProject[]
  skills: ProfileSkillGroup[]
  experience: ProfileExperience[]
  education: ProfileEducation[]
  certificates: string[]
  openSource: ProfileOpenSource[]
  awards: string[]
  facts: string[]
  now: ProfileNow
}
