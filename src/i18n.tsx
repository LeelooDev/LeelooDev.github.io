import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type Lang = 'zh' | 'en'

// UI 文案字典（数据内容的双语由构建时生成的 content.ts 按语言各存一份提供）。
const MESSAGES = {
  navHome: { zh: '首页', en: 'Home' },
  navArticles: { zh: '文章', en: 'Articles' },
  navProjects: { zh: '项目', en: 'Projects' },
  navArchive: { zh: '归档', en: 'Archive' },
  navNotes: { zh: '笔记', en: 'Notes' },
  navAbout: { zh: '关于', en: 'About' },
  mainNav: { zh: '主导航', en: 'Main navigation' },
  openMenu: { zh: '打开菜单', en: 'Open menu' },
  closeMenu: { zh: '关闭菜单', en: 'Close menu' },
  search: { zh: '搜索', en: 'Search' },
  searchPlaceholder: { zh: '搜索文章、项目、笔记…', en: 'Search articles, projects and notes…' },
  searchResults: { zh: '结果', en: 'RESULTS' },
  searchSuggested: { zh: '推荐', en: 'SUGGESTED' },
  searchNoResults: { zh: '没有结果', en: 'NO RESULTS' },
  searchNoResultsText: {
    zh: '没有匹配的内容，换个关键词试试，比如「AI」或「iOS」。',
    en: 'Nothing matches that query — try a keyword like “AI” or “iOS”.',
  },
  searchOpenHint: { zh: '↵ 打开', en: '↵ OPEN' },
  searchCloseHint: { zh: 'ESC 关闭', en: 'ESC CLOSE' },
  searchToggleHint: { zh: '⌘K 切换', en: '⌘K TOGGLE' },
  typeArticle: { zh: '文章', en: 'ARTICLE' },
  typeProject: { zh: '项目', en: 'PROJECT' },
  typeNote: { zh: '笔记', en: 'NOTE' },
  themeToggle: { zh: '切换主题', en: 'Toggle theme' },
  langToggle: { zh: 'English', en: '中文' },
  footerSitemap: { zh: '站点地图', en: 'SITEMAP' },
  footerElsewhere: { zh: '其他平台', en: 'ELSEWHERE' },
  footerContact: { zh: '联系方式', en: 'CONTACT' },
  siteDescription: {
    zh: '记录设计、代码、阅读和生活。',
    en: 'Notes on design, code, reading, and life.',
  },
  loading: { zh: '正在加载…', en: 'Loading…' },
  loadingArticles: { zh: '正在加载文章…', en: 'Loading articles…' },
  loadError: { zh: '暂时无法连接内容服务，请稍后重试。', en: 'The content service is unreachable — please retry shortly.' },
  profileError: { zh: '暂时无法加载资料，请稍后重试。', en: 'Profile is unavailable right now — please retry shortly.' },

  featuredWriting: { zh: '精选文章', en: 'FEATURED WRITING' },
  featuredBadge: { zh: '精选', en: 'FEATURED' },
  readArticle: { zh: '阅读全文 →', en: 'Read article →' },
  latestArticles: { zh: '最新文章', en: 'LATEST ARTICLES' },
  viewAll: { zh: '查看全部 →', en: 'View all →' },
  selectedProjects: { zh: '精选项目', en: 'SELECTED PROJECTS' },
  skillsLabel: { zh: '技能', en: 'SKILLS' },
  timelineLabel: { zh: '时间线', en: 'TIMELINE' },
  aboutMe: { zh: '关于我', en: 'About me' },
  emailFallback: { zh: '邮箱', en: 'Email' },
  heroArtworkAlt: {
    zh: '缓慢自转的真实三维火星模型',
    en: 'A realistic three-dimensional model of Mars rotating slowly',
  },
  noPosts: { zh: '还没有已发布文章。', en: 'No published articles yet.' },
  coverPlaceholder: { zh: 'cover image', en: 'cover image' },

  articlesTitle: { zh: '文章', en: 'Articles' },
  articlesSub: {
    zh: '关于 iOS、医学影像、AI 工程与全栈开发的长文写作。',
    en: 'Long-form writing on iOS, medical imaging, AI engineering and full-stack development.',
  },
  filterPlaceholder: { zh: '筛选文章…', en: 'Filter articles…' },
  allCategories: { zh: '全部', en: 'All' },
  noMatch: { zh: '没有匹配的文章', en: 'NO ARTICLES MATCH' },
  noMatchText: {
    zh: '没有匹配的文章，换个关键词，或清除下面的筛选条件。',
    en: 'Try a different keyword, or clear the filters below.',
  },
  resetFilters: { zh: '重置筛选', en: 'Reset filters' },
  loadMore: { zh: '加载更多', en: 'Load more' },

  allArticles: { zh: '← 全部文章', en: '← All articles' },
  updatedAt: { zh: '更新于', en: 'Updated' },
  tocLabel: { zh: '目录', en: 'ON THIS PAGE' },
  backTop: { zh: '↑ 回到顶部', en: '↑ Back to top' },
  backTopShort: { zh: '回到顶部', en: 'Back to top' },
  shareLabel: { zh: '分享', en: 'SHARE' },
  copyLink: { zh: '复制链接', en: 'Copy link' },
  copied: { zh: '已复制 ✓', en: 'Copied ✓' },
  copyCode: { zh: '复制', en: 'Copy' },
  aboutMeLink: { zh: '关于我 →', en: 'About me →' },
  prevLabel: { zh: '← 上一篇', en: '← PREVIOUS' },
  nextLabel: { zh: '下一篇 →', en: 'NEXT →' },
  relatedLabel: { zh: '相关文章', en: 'RELATED ARTICLES' },
  postNotFound: { zh: '文章不存在。', en: 'Article not found.' },
  notFoundTitle: { zh: '页面不存在', en: 'Page not found' },
  notFoundText: {
    zh: '这个地址没有对应的页面，可能已经改名或删除了。',
    en: 'There is nothing at this address — it may have been renamed or removed.',
  },
  backHome: { zh: '返回首页', en: 'Back home' },

  projectsTitle: { zh: '项目', en: 'Projects' },
  projectsSub: {
    zh: '精选作品 — 医疗影像、健康平台与实时协同系统。',
    en: 'Selected work — medical imaging, health platforms and real-time collaboration systems.',
  },
  viewDetail: { zh: '查看详情 →', en: 'View detail →' },
  allProjects: { zh: '← 全部项目', en: '← All projects' },
  roleLabel: { zh: '角色', en: 'ROLE' },
  periodLabel: { zh: '时间线', en: 'TIMELINE' },
  stackLabel: { zh: '技术栈', en: 'TECH STACK' },
  projectRepo: { zh: '项目地址 ↗', en: 'Project link ↗' },
  overviewLabel: { zh: '概述', en: 'OVERVIEW' },
  projectShot: { zh: '项目截图', en: 'project screenshot' },

  archiveTitle: { zh: '归档', en: 'Archive' },
  archiveSub: { zh: '全部公开文章，按年份浏览。', en: 'Everything published, browsable by year.' },
  statPosts: { zh: '文章', en: 'ARTICLES' },
  statMinutes: { zh: '阅读分钟', en: 'MINUTES OF READING' },
  statCats: { zh: '分类', en: 'CATEGORIES' },
  statYears: { zh: '写作年份', en: 'YEARS WRITING' },
  activity: { zh: '写作活跃度 — 最近 12 个月', en: 'WRITING ACTIVITY — LAST 12 MONTHS' },
  lessMore: { zh: '少 → 多', en: 'LESS → MORE' },
  tagCloud: { zh: '标签云', en: 'TAG CLOUD' },
  catDist: { zh: '分类', en: 'CATEGORIES' },

  viewProjects: { zh: '查看项目经历', en: 'View project history' },
  experienceLabel: { zh: '经历', en: 'EXPERIENCE' },
  philosophyLabel: { zh: '理念', en: 'PHILOSOPHY' },
  educationLabel: { zh: '教育', en: 'EDUCATION' },
  certificatesLabel: { zh: '证书', en: 'CERTIFICATES' },
  openSourceLabel: { zh: '开源', en: 'OPEN SOURCE' },
  awardsLabel: { zh: '奖项', en: 'AWARDS' },
  factsLabel: { zh: '有趣的事', en: 'INTERESTING FACTS' },

  notesLibrary: { zh: '笔记库', en: 'Notebook' },
  notesEmpty: { zh: '还没有笔记。', en: 'No notes yet.' },
  noteNotFound: { zh: '这篇笔记不存在。', en: 'Note not found.' },
  notesError: { zh: '暂时无法加载笔记。', en: 'Notes are unavailable right now.' },

  figureZoom: { zh: '点击放大', en: 'Click to enlarge' },
  figureViewer: { zh: '插图预览', en: 'Figure viewer' },
  figureClose: { zh: '关闭预览', en: 'Close viewer' },
  figureZoomIn: { zh: '放大', en: 'Zoom in' },
  figureZoomOut: { zh: '缩小', en: 'Zoom out' },
} satisfies Record<string, { zh: string; en: string }>

export type MessageKey = keyof typeof MESSAGES

const CATEGORY_NAMES: Record<string, { zh: string; en: string }> = {
  design: { zh: '设计', en: 'Design' },
  code: { zh: '代码', en: 'Code' },
  life: { zh: '生活', en: 'Life' },
  notes: { zh: '笔记', en: 'Notes' },
}

interface I18n {
  lang: Lang
  toggleLang: () => void
  t: (key: MessageKey) => string
  /** 分类 slug → 当前语言的显示名。 */
  categoryLabel: (category: string) => string
  /** 完整日期：2026年6月8日 / June 8, 2026。 */
  formatDate: (value: string) => string
  /** 列表里的阅读时长：8 分钟 / 8 min。 */
  minutes: (count: number) => string
  /** 文章详情里的阅读时长：8 分钟阅读 / 8 min read。 */
  minutesRead: (count: number) => string
  /** 归档里的文章数：3 篇 / 3 articles。 */
  articleCount: (count: number) => string
}

const I18nContext = createContext<I18n | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  // 首帧必须与预渲染的 HTML 一致（预渲染固定用 zh），否则 hydrate 会 mismatch。
  // 所以读 localStorage 的动作推迟到挂载后，再切到英文。
  const [lang, setLang] = useState<Lang>('zh')
  const restored = useRef(false)

  useEffect(() => {
    if (localStorage.getItem('macoazo-lang') === 'en') setLang('en')
    restored.current = true
  }, [])

  useEffect(() => {
    // 恢复完成前不要回写，否则首帧的 zh 会覆盖掉用户存的 en。
    if (restored.current) localStorage.setItem('macoazo-lang', lang)
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  const toggleLang = useCallback(() => setLang((current) => (current === 'zh' ? 'en' : 'zh')), [])

  const value = useMemo<I18n>(() => ({
    lang,
    toggleLang,
    t: (key) => MESSAGES[key][lang],
    categoryLabel: (category) => CATEGORY_NAMES[category]?.[lang] ?? category,
    formatDate: (value) =>
      // 固定 UTC：文章的发布日期是一个日历日，不该随读者所在时区变成前后一天。
      // 预渲染在 UTC 机器上跑，不固定的话服务端和浏览器会渲染出不同的日期文本（hydration 失败）。
      new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
        .format(new Date(value)),
    minutes: (count) => (lang === 'zh' ? `${count} 分钟` : `${count} min`),
    minutesRead: (count) => (lang === 'zh' ? `${count} 分钟阅读` : `${count} min read`),
    articleCount: (count) => (lang === 'zh' ? `${count} 篇` : `${count} ${count === 1 ? 'article' : 'articles'}`),
  }), [lang, toggleLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within LanguageProvider')
  return context
}
