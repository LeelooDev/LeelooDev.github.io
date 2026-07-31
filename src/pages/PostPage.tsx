import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { postDate, readingMinutes, usePosts, useProfile } from '../lib'
import { useCodeCopy } from '../useCodeCopy'
import { useLightbox } from '../useLightbox'

// 正文是 scripts/markdown.mjs 在构建时编译好的 HTML（已 sanitize、已高亮、已包好代码块外壳），
// 所以这里不再需要 react-markdown / rehype 那套运行时依赖。

function useReadingProgress() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const root = document.documentElement
        const max = root.scrollHeight - window.innerHeight
        setProgress(max > 0 ? Math.min(1, root.scrollTop / max) : 0)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return progress
}

export function PostPage() {
  const { t, categoryLabel, formatDate, minutesRead, lang } = useI18n()
  const { slug = '' } = useParams()
  const posts = usePosts()
  const profile = useProfile()
  const progress = useReadingProgress()
  const [linkCopied, setLinkCopied] = useState(false)

  // 静态站的文章列表已按语言在构建时生成，单篇直接从列表里取，不需要额外请求。
  const items = posts.data.items
  const post = useMemo(() => items.find((item) => item.slug === slug) ?? null, [items, slug])
  const contentRef = useCodeCopy()
  useLightbox(contentRef)

  // 必须用花括号：箭头函数简写会把 window.scrollTo 的返回值当成 effect 的清理函数交给
  // React，而它在浏览器里并不总是 undefined，卸载本页时就会 "is not a function" 崩溃。
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [slug])

  if (!post) return <div className="page-status">{t('postNotFound')}</div>

  // 目录在构建时和锚点 id 一起生成，保证两边必然对得上。
  const toc = post.toc

  const index = items.findIndex((item) => item.slug === post.slug)
  const newer = index > 0 ? items[index - 1] : null
  const older = index >= 0 && index < items.length - 1 ? items[index + 1] : null
  const related = [
    ...items.filter((item) => item.slug !== post.slug && item.category === post.category),
    ...items.filter((item) => item.slug !== post.slug && item.category !== post.category),
  ].slice(0, 2)
  const author = profile.data

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1800)
  }

  return (
    <div className="page">
      <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />

      <div className="article-head">
        <Link className="back-link" to="/articles">{t('allArticles')}</Link>
        <div className="article-chips">
          <span className="chip-accent">{categoryLabel(post.category)}</span>
          <span className="article-date">{formatDate(postDate(post))}</span>
        </div>
        <h1 className="article-title">{post.title}</h1>
        <div className="article-subtitle">{post.excerpt}</div>
        <div className="article-byline">
          <div className="byline-author">
            <span className="byline-avatar">
              {author?.avatarUrl ? <img src={author.avatarUrl} alt={author.name} /> : (author?.name?.[0] ?? 'M')}
            </span>
            <span className="byline-name">{author?.name ?? 'MacOazo'}</span>
          </div>
          <span>·</span>
          <span>{minutesRead(readingMinutes(post))}</span>
          <span>·</span>
          <span>{t('updatedAt')} {formatDate(post.updatedAt)}</span>
        </div>
      </div>

      {post.coverUrl ? (
        <div className="article-cover-wrap">
          <img className="article-cover" src={post.coverUrl} alt={post.coverAlt} />
        </div>
      ) : null}

      <div className="article-layout">
        <div
          className="article-content"
          ref={contentRef}
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
        {toc.length > 1 ? (
          <aside className="article-toc">
            <div className="article-toc-label">{t('tocLabel')}</div>
            <div className="article-toc-items">
              {toc.map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}
            </div>
            <button className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              {t('backTop')}
            </button>
          </aside>
        ) : null}
      </div>

      <div className="article-foot">
        {post.tags.length ? (
          <div className="tag-row">
            {post.tags.map((tag) => <span className="tag-chip" key={tag}>#{tag}</span>)}
          </div>
        ) : null}
        <div className="share-row">
          <span className="share-label">{t('shareLabel')}</span>
          <button className="share-btn" onClick={copyLink}>{linkCopied ? t('copied') : t('copyLink')}</button>
        </div>
        {author ? (
          <div className="author-card">
            <span className="author-card-avatar">
              {author.avatarUrl ? <img src={author.avatarUrl} alt={author.name} /> : (author.name?.[0] ?? 'M')}
            </span>
            <div className="author-card-main">
              <div className="author-card-name">{author.name}</div>
              <div className="author-card-bio">{author.bio}</div>
            </div>
            <Link className="author-card-link" to="/about">{t('aboutMeLink')}</Link>
          </div>
        ) : null}
        {newer || older ? (
          <div className="prev-next">
            {older ? (
              <Link to={`/posts/${older.slug}`}>
                <div className="prev-next-label">{t('prevLabel')}</div>
                <div className="prev-next-title">{older.title}</div>
              </Link>
            ) : <span />}
            {newer ? (
              <Link className="next" to={`/posts/${newer.slug}`}>
                <div className="prev-next-label">{t('nextLabel')}</div>
                <div className="prev-next-title">{newer.title}</div>
              </Link>
            ) : null}
          </div>
        ) : null}
        {related.length ? (
          <div style={{ padding: '44px 0 8px' }}>
            <div className="side-label" style={{ marginBottom: 18 }}>{t('relatedLabel')}</div>
            <div className="related-grid">
              {related.map((item) => (
                <Link className="related-card" key={item.slug} to={`/posts/${item.slug}`}>
                  <div className="article-card-cat">{categoryLabel(item.category)}</div>
                  <div className="related-title">{item.title}</div>
                  <div className="related-meta">{formatDate(postDate(item))} · {minutesRead(readingMinutes(item))}</div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {progress > 0.15 ? (
        <button className="to-top-fab" title={t('backTopShort')} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          ↑
        </button>
      ) : null}
    </div>
  )
}
