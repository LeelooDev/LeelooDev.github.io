import { useMemo } from 'react'
import type { Post } from '../types'
import { Link } from 'react-router-dom'
import { ArchiveSkeleton } from '../components/Skeleton'
import { useI18n, type Lang } from '../i18n'
import { postDate, readingMinutes, usePosts } from '../lib'
import { BUILD_DATE } from '../content'

export function ArchivePage() {
  const { lang, t, categoryLabel, minutes, articleCount } = useI18n()
  const posts = usePosts()
  const items = posts.data?.items ?? []

  const stats = useMemo(() => {
    const totalMinutes = items.reduce((total, post) => total + readingMinutes(post), 0)
    const categories = new Set(items.map((post) => post.category))
    const years = new Set(items.map((post) => new Date(postDate(post)).getUTCFullYear()))
    return { posts: items.length, minutes: totalMinutes, categories: categories.size, years: years.size }
  }, [items])

  const heatCells = useMemo(() => buildHeatmap(items, BUILD_DATE), [items])
  const yearGroups = useMemo(() => groupByYearMonth(items, lang), [items, lang])
  const tagCloud = useMemo(() => {
    const counts = new Map<string, number>()
    items.forEach((post) => post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return Array.from(counts, ([name, count]) => ({ name, fontSize: 11.5 + Math.min(count, 5) * 2 }))
  }, [items])
  const catDist = useMemo(() => {
    const counts = new Map<string, number>()
    items.forEach((post) => counts.set(post.category, (counts.get(post.category) ?? 0) + 1))
    return Array.from(counts, ([category, count]) => ({
      name: categoryLabel(category),
      count,
      pct: Math.round((count / Math.max(1, items.length)) * 100),
    })).sort((a, b) => b.count - a.count)
  }, [items, categoryLabel])

  if (posts.isPending) return <ArchiveSkeleton />
  if (posts.isError) return <div className="page-status">{t('loadError')}</div>

  return (
    <div className="page">
      <section className="section" style={{ paddingTop: 64 }}>
        <h1 className="page-h1">{t('archiveTitle')}</h1>
        <div className="page-sub" style={{ marginBottom: 36 }}>{t('archiveSub')}</div>

        <div className="stat-grid">
          <div className="stat-card"><div className="stat-value">{stats.posts}</div><div className="stat-label">{t('statPosts')}</div></div>
          <div className="stat-card"><div className="stat-value">{stats.minutes}</div><div className="stat-label">{t('statMinutes')}</div></div>
          <div className="stat-card"><div className="stat-value">{stats.categories}</div><div className="stat-label">{t('statCats')}</div></div>
          <div className="stat-card"><div className="stat-value">{stats.years}</div><div className="stat-label">{t('statYears')}</div></div>
        </div>

        <div className="heatmap-card">
          <div className="heatmap-head">
            <span>{t('activity')}</span>
            <span>{t('lessMore')}</span>
          </div>
          <div className="heatmap-grid">
            {heatCells.map((opacity, index) => (
              <div className="heatmap-cell" key={index} style={{ opacity }} />
            ))}
          </div>
        </div>

        <div className="archive-layout">
          <div className="archive-main">
            {yearGroups.map((year) => (
              <div className="archive-year" key={year.year}>
                <div className="archive-year-head">
                  <strong>{year.year}</strong>
                  <span>{articleCount(year.count)}</span>
                </div>
                {year.months.map((month) => (
                  <div className="archive-month" key={month.name}>
                    <div className="archive-month-name">{month.name}</div>
                    {month.items.map((post) => (
                      <Link className="archive-item" key={post.slug} to={`/posts/${post.slug}`}>
                        <strong>{post.title}</strong>
                        <span>{shortDate(postDate(post))} · {minutes(readingMinutes(post))}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <aside className="archive-side">
            {tagCloud.length ? (
              <>
                <div className="side-label">{t('tagCloud')}</div>
                <div className="tag-cloud">
                  {tagCloud.map((tag) => (
                    <span key={tag.name} style={{ fontSize: tag.fontSize }}>{tag.name}</span>
                  ))}
                </div>
              </>
            ) : null}
            {catDist.length ? (
              <>
                <div className="side-label">{t('catDist')}</div>
                <div className="cat-dist">
                  {catDist.map((cat) => (
                    <div key={cat.name}>
                      <div className="cat-dist-head"><span>{cat.name}</span><span>{cat.count}</span></div>
                      <div className="cat-dist-bar"><i style={{ width: `${cat.pct}%` }} /></div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  )
}

// 下面所有日期一律按 UTC 取值。预渲染跑在 UTC 机器上，浏览器却在读者本地时区，
// 用 getMonth()/getDate() 这类本地方法会让两边渲染出不同的文本，hydration 就失败了。
function buildHeatmap(items: Post[], endDate: string) {
  const counts = new Map<string, number>()
  items.forEach((post) => {
    const key = new Date(postDate(post)).toISOString().slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  const end = new Date(`${endDate}T00:00:00Z`)
  const cells: number[] = []
  for (let offset = 363; offset >= 0; offset -= 1) {
    const day = new Date(end)
    day.setUTCDate(day.getUTCDate() - offset)
    const count = counts.get(day.toISOString().slice(0, 10)) ?? 0
    cells.push(count === 0 ? 0.08 : Math.min(1, 0.45 + (count - 1) * 0.3))
  }
  return cells
}

function groupByYearMonth(items: Post[], lang: Lang) {
  const monthLabel = (date: Date) => (lang === 'zh'
    ? `${date.getUTCMonth() + 1} 月`
    : new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(date))
  const years: { year: number; count: number; months: { name: string; items: Post[] }[] }[] = []
  for (const post of items) {
    const date = new Date(postDate(post))
    const yearValue = date.getUTCFullYear()
    const monthName = monthLabel(date)
    let year = years.find((entry) => entry.year === yearValue)
    if (!year) {
      year = { year: yearValue, count: 0, months: [] }
      years.push(year)
    }
    let month = year.months.find((entry) => entry.name === monthName)
    if (!month) {
      month = { name: monthName, items: [] }
      year.months.push(month)
    }
    month.items.push(post)
    year.count += 1
  }
  years.sort((a, b) => b.year - a.year)
  return years
}

function shortDate(value: string) {
  const date = new Date(value)
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}
