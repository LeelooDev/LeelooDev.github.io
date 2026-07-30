import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useI18n, type MessageKey } from '../i18n'
import { readingMinutes, useProfile, usePosts, useSiteSettings } from '../lib'
import { pageMeta } from '../meta'

const NAV_ITEMS: { to: string; key: MessageKey; end?: boolean }[] = [
  { to: '/', key: 'navHome', end: true },
  { to: '/articles', key: 'navArticles' },
  { to: '/projects', key: 'navProjects' },
  { to: '/archive', key: 'navArchive' },
  { to: '/now', key: 'navNow' },
  { to: '/about', key: 'navAbout' },
]

type Theme = 'dark' | 'light'

export function SiteLayout() {
  const { lang, toggleLang, t } = useI18n()
  const { pathname } = useLocation()
  const settings = useSiteSettings()
  const profile = useProfile()
  // 首帧固定 dark 以匹配预渲染结果，真实值由挂载后的 effect 恢复。背景色不会闪：
  // index.html 里的内联脚本在 hydrate 之前就设好了 body[data-theme]。
  const [theme, setTheme] = useState<Theme>('dark')
  const restoredTheme = useRef(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const siteName = settings.data?.siteName ?? 'MacOazo'
  const description = settings.data?.siteDescription ?? '记录支撑创作的小系统，也记录系统之外的生活。'
  const contactEmail = settings.data?.contactEmail ?? 'tiantiancoolcool@gmail.com'

  // 标题走和预渲染同一份 pageMeta，客户端导航后才不会退化成站点名。
  useEffect(() => {
    document.title = pageMeta(pathname, lang).title
    const robots = document.querySelector('meta[name="robots"]') ?? document.head.appendChild(document.createElement('meta'))
    robots.setAttribute('name', 'robots')
    robots.setAttribute('content', settings.data?.allowIndexing === false ? 'noindex,nofollow' : 'index,follow')
  }, [pathname, lang, settings.data?.allowIndexing])

  useEffect(() => {
    if (localStorage.getItem('macoazo-theme') === 'light') setTheme('light')
    restoredTheme.current = true
  }, [])

  useEffect(() => {
    document.body.dataset.theme = theme
    // 恢复完成前不要回写，否则首帧的 dark 会覆盖掉用户存的 light。
    if (restoredTheme.current) localStorage.setItem('macoazo-theme', theme)
  }, [theme])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((open) => !open)
      } else if (event.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const externalContacts = profile.data?.contacts?.filter((contact) => !contact.url.startsWith('mailto:')) ?? []

  return (
    <>
      <header className="site-nav">
        <div className="site-nav-inner">
          <NavLink className="brand" to="/">
            <span className="brand-mark">{siteName[0] ?? 'M'}</span>
            <span className="brand-name">{siteName}</span>
          </NavLink>
          <nav className="nav-links" aria-label={t('mainNav')}>
            {NAV_ITEMS.map(({ to, key, end }) => (
              <NavLink key={to} to={to} end={end}>{t(key)}</NavLink>
            ))}
          </nav>
          <div className="nav-actions">
            <button className="search-btn" onClick={() => setSearchOpen(true)}>
              <span>{t('search')}</span>
              <kbd>⌘K</kbd>
            </button>
            <button className="theme-btn lang-btn" title={t('langToggle')} onClick={toggleLang}>
              {lang === 'zh' ? 'EN' : '中'}
            </button>
            <button
              className="theme-btn"
              title={t('themeToggle')}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? '◐' : '◑'}
            </button>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-brand-row">
              <span className="brand-mark">{siteName[0] ?? 'M'}</span>
              <span>{siteName}</span>
            </div>
            <div className="footer-tagline">{description}</div>
            {profile.data?.location ? <div className="footer-loc">{profile.data.location}</div> : null}
          </div>
          <div className="footer-col">
            <div className="footer-col-label">{t('footerSitemap')}</div>
            <div className="footer-col-links">
              {NAV_ITEMS.map(({ to, key }) => <NavLink key={to} to={to}>{t(key)}</NavLink>)}
            </div>
          </div>
          <div className="footer-col">
            <div className="footer-col-label">{t('footerElsewhere')}</div>
            <div className="footer-col-links">
              {externalContacts.map((contact) => (
                <a key={contact.url} href={contact.url} target="_blank" rel="noreferrer">{contact.label || contact.type}</a>
              ))}
              <a href="/rss.xml">RSS</a>
            </div>
          </div>
          <div className="footer-col" style={{ minWidth: 180 }}>
            <div className="footer-col-label">{t('footerContact')}</div>
            <div className="footer-col-links">
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-bottom-inner">
            <span className="footer-copy">
              {lang === 'zh' ? `© 2026 ${siteName} 保留所有权利。` : `© 2026 ${siteName}. All rights reserved.`}
            </span>
            <span className="footer-motto">DESIGNED IN THE OPEN · BUILT WITH CARE</span>
          </div>
        </div>
      </footer>

      {searchOpen ? <SearchOverlay onClose={() => setSearchOpen(false)} /> : null}
    </>
  )
}

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { t, categoryLabel, minutes } = useI18n()
  const [query, setQuery] = useState('')
  const posts = usePosts()
  const profile = useProfile()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  // 同样要用花括号：简写会把返回值交给 React 当清理函数（见 PostPage 里的同类注释）。
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const allPosts = posts.data?.items ?? []
    const projects = profile.data?.projects ?? []
    const postMatches = (keyword
      ? allPosts.filter((post) =>
          `${post.title} ${post.category} ${post.tags.join(' ')}`.toLowerCase().includes(keyword))
      : allPosts.slice(0, 4)
    ).slice(0, 6).map((post) => ({
      key: `post-${post.slug}`,
      type: t('typeArticle'),
      title: post.title,
      meta: `${categoryLabel(post.category)} · ${minutes(readingMinutes(post))}`,
      go: () => navigate(`/posts/${post.slug}`),
    }))
    const projectMatches = (keyword
      ? projects.filter((project) => `${project.name} ${project.description}`.toLowerCase().includes(keyword))
      : projects.slice(0, 2)
    ).slice(0, 4).map((project, index) => ({
      key: `project-${index}-${project.name}`,
      type: t('typeProject'),
      title: project.name,
      meta: project.role,
      go: () => navigate('/projects'),
    }))
    return [...postMatches, ...projectMatches]
  }, [query, posts.data, profile.data, navigate, t, categoryLabel, minutes])

  const open = (go: () => void) => {
    go()
    onClose()
  }

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={(event) => event.stopPropagation()}>
        <div className="search-input-row">
          <i>→</i>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) open(results[0].go)
            }}
            placeholder={t('searchPlaceholder')}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="search-results">
          <div className="search-hint">{query.trim() ? t('searchResults') : t('searchSuggested')}</div>
          {results.map((result) => (
            <button key={result.key} className="search-result" onClick={() => open(result.go)}>
              <span className="search-result-type">{result.type}</span>
              <span className="search-result-title">{result.title}</span>
              <span className="search-result-meta">{result.meta}</span>
            </button>
          ))}
          {query.trim() && results.length === 0 ? (
            <div className="search-empty">
              <div className="search-empty-label">{t('searchNoResults')}</div>
              <div className="search-empty-text">{t('searchNoResultsText')}</div>
            </div>
          ) : null}
        </div>
        <div className="search-foot">
          <span>{t('searchOpenHint')}</span>
          <span>{t('searchCloseHint')}</span>
          <span>{t('searchToggleHint')}</span>
        </div>
      </div>
    </div>
  )
}
