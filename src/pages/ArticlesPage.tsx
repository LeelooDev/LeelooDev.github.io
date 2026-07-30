import { useMemo, useState } from 'react'
import { PostCard } from '../components/PostCard'
import { ArticlesSkeleton } from '../components/Skeleton'
import { useI18n } from '../i18n'
import { usePosts } from '../lib'

const PAGE_SIZE = 6

export function ArticlesPage() {
  const { lang, t, categoryLabel } = useI18n()
  const posts = usePosts()
  const [category, setCategory] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const items = posts.data?.items ?? []
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(items.map((post) => post.category)))],
    [items],
  )
  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return items.filter((post) =>
      (category === 'all' || post.category === category) &&
      (!query || `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLowerCase().includes(query)))
  }, [items, category, keyword])

  if (posts.isPending) return <ArticlesSkeleton />
  if (posts.isError) return <div className="page-status">{t('loadError')}</div>

  const reset = () => {
    setCategory('all')
    setKeyword('')
    setVisible(PAGE_SIZE)
  }

  const shown = Math.min(visible, filtered.length)
  const resultLine = lang === 'zh'
    ? `显示 ${shown} / ${filtered.length} 篇`
    : `Showing ${shown} of ${filtered.length}`

  return (
    <div className="page">
      <section className="section" style={{ paddingTop: 64 }}>
        <div className="page-head">
          <div>
            <h1>{t('articlesTitle')}</h1>
            <div className="page-head-sub">{t('articlesSub')}</div>
          </div>
          <input
            className="filter-input"
            value={keyword}
            onChange={(event) => { setKeyword(event.target.value); setVisible(PAGE_SIZE) }}
            placeholder={t('filterPlaceholder')}
          />
        </div>
        <div className="cat-pills">
          {categories.map((value) => (
            <button
              key={value}
              className={`cat-pill${category === value ? ' active' : ''}`}
              onClick={() => { setCategory(value); setVisible(PAGE_SIZE) }}
            >
              {value === 'all' ? t('allCategories') : categoryLabel(value)}
            </button>
          ))}
        </div>
        <div className="result-line">{resultLine}</div>
        <div className="card-grid">
          {filtered.slice(0, visible).map((post, index) => <PostCard key={post.id} post={post} index={index % PAGE_SIZE} />)}
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-label">{t('noMatch')}</div>
            <div className="empty-state-text">{t('noMatchText')}</div>
            <button className="btn-outline" onClick={reset}>{t('resetFilters')}</button>
          </div>
        ) : null}
        {filtered.length > visible ? (
          <div className="load-more-row">
            <button className="btn-outline" onClick={() => setVisible(visible + PAGE_SIZE)}>{t('loadMore')}</button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
