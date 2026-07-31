// 把 content/ 下的 Markdown 与 JSON 编译成 src/content.ts。
// 这是原来 Go API 三个读取接口（/posts、/profile、/settings）的构建时替身：
// 数据变成同步可用的模块，所以 lib.ts 的 hook 不再需要异步，预渲染也没有数据预填问题。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { renderMarkdown } from './markdown.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(ROOT, 'content')
const POSTS_DIR = join(CONTENT, 'posts')
const NOTES_DIR = join(CONTENT, 'notes')
const OUT = join(ROOT, 'src', 'content.ts')

const readJson = (name) => JSON.parse(readFileSync(join(CONTENT, name), 'utf8'))

/** frontmatter 的 date 可能被 YAML 解析成 Date，统一成 ISO 串。 */
function toIso(value, file) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${file}: frontmatter 的 date 无法解析：${JSON.stringify(value)}`)
  }
  return date.toISOString()
}

function requireField(data, field, file) {
  if (data[field] === undefined || data[field] === '') {
    throw new Error(`${file}: frontmatter 缺少必填字段 ${field}`)
  }
  return data[field]
}

/** 与页面上显示的口径一致：按正文字数估阅读时长，最少 3 分钟。 */
function estimateMinutes(markdown) {
  return Math.max(3, Math.ceil(markdown.length / 450))
}

const files = readdirSync(POSTS_DIR)
  .filter((name) => name.endsWith('.md') && !name.endsWith('.en.md'))
  .sort()

const posts = []
/** 英文版覆盖字段，只有写了 <slug>.en.md 或英文 frontmatter 的文章才会有条目。 */
const enOverrides = {}
for (const file of files) {
  const slug = file.replace(/\.md$/, '')
  const { data, content } = matter(readFileSync(join(POSTS_DIR, file), 'utf8'))

  if (data.draft === true) {
    console.log(`  跳过草稿：${slug}`)
    continue
  }

  // 可选的英文版：content/posts/<slug>.en.md，缺失的字段读取时回退中文。
  let en = { data: {}, content: '' }
  try {
    en = matter(readFileSync(join(POSTS_DIR, `${slug}.en.md`), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const publishedAt = toIso(requireField(data, 'date', file), file)
  const body = content.trim()
  const bodyEn = en.content.trim()

  // 正文在构建时编译成 HTML 并抽出目录，浏览器端因此既不需要 Markdown 解析器，
  // 也不需要携带 Markdown 原文。
  const { html, toc } = renderMarkdown(body)

  posts.push({
    id: slug,
    slug,
    title: requireField(data, 'title', file),
    excerpt: requireField(data, 'excerpt', file),
    html,
    toc,
    readingMinutes: estimateMinutes(body),
    category: requireField(data, 'category', file),
    tags: data.tags ?? [],
    coverUrl: requireField(data, 'cover', file),
    coverAlt: data.coverAlt ?? '',
    status: 'published',
    publishedAt,
    createdAt: publishedAt,
    updatedAt: publishedAt,
  })

  const override = {}
  if (en.data.title) override.title = en.data.title
  if (en.data.excerpt) override.excerpt = en.data.excerpt
  if (en.data.tags) override.tags = en.data.tags
  if (en.data.coverAlt) override.coverAlt = en.data.coverAlt
  if (bodyEn) {
    const rendered = renderMarkdown(bodyEn)
    override.html = rendered.html
    override.toc = rendered.toc
    override.readingMinutes = estimateMinutes(bodyEn)
  }
  if (Object.keys(override).length) enOverrides[slug] = override
}

// 列表按发布时间倒序：文章页的「上一篇 / 下一篇」依赖这个顺序。
posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

const noteFiles = readdirSync(NOTES_DIR)
  .filter((name) => name.endsWith('.md') && !name.endsWith('.en.md'))
  .sort()

const notes = []
const enNoteOverrides = {}
for (const file of noteFiles) {
  const slug = file.replace(/\.md$/, '')
  const { data, content } = matter(readFileSync(join(NOTES_DIR, file), 'utf8'))
  const date = toIso(requireField(data, 'date', file), file)
  const body = content.trim()
  const rendered = renderMarkdown(body)

  notes.push({
    slug,
    title: requireField(data, 'title', file),
    date,
    group: requireField(data, 'group', file),
    groupOrder: Number(data.groupOrder ?? 0),
    noteOrder: Number(data.noteOrder ?? 0),
    coverUrl: data.cover ?? '',
    coverAlt: data.coverAlt ?? '',
    html: rendered.html,
    toc: rendered.toc,
    readingMinutes: estimateMinutes(body),
  })

  try {
    const en = matter(readFileSync(join(NOTES_DIR, `${slug}.en.md`), 'utf8'))
    const enBody = en.content.trim()
    const override = {}
    if (en.data.title) override.title = en.data.title
    if (en.data.group) override.group = en.data.group
    if (en.data.coverAlt) override.coverAlt = en.data.coverAlt
    if (enBody) {
      const enRendered = renderMarkdown(enBody)
      override.html = enRendered.html
      override.toc = enRendered.toc
      override.readingMinutes = estimateMinutes(enBody)
    }
    if (Object.keys(override).length) enNoteOverrides[slug] = override
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

notes.sort((a, b) =>
  a.groupOrder - b.groupOrder ||
  a.noteOrder - b.noteOrder ||
  b.date.localeCompare(a.date))

const profileZh = readJson('profile.zh.json')
const profileEn = readJson('profile.en.json')
const settings = readJson('settings.json')

const banner = `// 此文件由 scripts/build-content.mjs 从 content/ 生成，不要手改。
// 要改内容请改 content/ 下的 Markdown 和 JSON，然后重新构建。
`

const source = `${banner}
import type { Note, Page, Post, Profile, ProfileLocale, SiteSettings } from './types'

const RAW_POSTS: Post[] = ${JSON.stringify(posts, null, 2)}

/** 英文版覆盖：只有写了 content/posts/<slug>.en.md 的文章才在这里出现，其余直接复用中文对象。 */
const EN_OVERRIDES: Record<string, Partial<Post>> = ${JSON.stringify(enOverrides, null, 2)}

function page(items: Post[]): Page<Post> {
  return { items, page: 1, pageSize: items.length, total: items.length }
}

export const POSTS: Record<ProfileLocale, Page<Post>> = {
  zh: page(RAW_POSTS),
  en: page(RAW_POSTS.map((post) => (EN_OVERRIDES[post.slug] ? { ...post, ...EN_OVERRIDES[post.slug] } : post))),
}

const RAW_NOTES: Note[] = ${JSON.stringify(notes, null, 2)}

const EN_NOTE_OVERRIDES: Record<string, Partial<Note>> = ${JSON.stringify(enNoteOverrides, null, 2)}

export const NOTES: Record<ProfileLocale, Note[]> = {
  zh: RAW_NOTES,
  en: RAW_NOTES.map((note) => (EN_NOTE_OVERRIDES[note.slug] ? { ...note, ...EN_NOTE_OVERRIDES[note.slug] } : note)),
}

const PROFILE_ZH: Profile = ${JSON.stringify(profileZh, null, 2)}

/** 英文简历只存填写过的字段，其余在这里回退到中文。 */
const PROFILE_EN_OVERRIDES: Partial<Profile> = ${JSON.stringify(profileEn, null, 2)}

export const PROFILE: Record<ProfileLocale, Profile> = {
  zh: PROFILE_ZH,
  en: { ...PROFILE_ZH, ...PROFILE_EN_OVERRIDES },
}

export const SETTINGS: SiteSettings = ${JSON.stringify(settings, null, 2)}

/** 构建当天（UTC）。归档页的热力图以此为终点——用 new Date() 的话预渲染时刻和访问时刻
 *  不是同一天就会 hydration 失败。 */
export const BUILD_DATE = ${JSON.stringify(new Date().toISOString().slice(0, 10))}
`

writeFileSync(OUT, source)
console.log(`content.ts 已生成：${posts.length} 篇文章、${notes.length} 篇笔记、${profileZh.projects.length} 个项目`)
