import { useRef } from 'react'
import type { Profile, ProfileExperience } from '../types'
import { Link } from 'react-router-dom'
import { PostCard } from '../components/PostCard'
import { ProjectCard } from '../components/ProjectCard'
import { HomeSkeleton } from '../components/Skeleton'
import { useI18n } from '../i18n'
import { postDate, readingMinutes, splitBio, usePosts, useProfile } from '../lib'

export function HomePage() {
  const { t, categoryLabel, formatDate, minutesRead } = useI18n()
  const posts = usePosts()
  const profile = useProfile()

  if (posts.isPending || profile.isPending) return <HomeSkeleton />
  if (posts.isError) return <div className="page-status">{t('loadError')}</div>

  const [featured, ...rest] = posts.data.items
  const latest = rest.slice(0, 3)
  const projects = profile.data?.projects ?? []
  const skills = profile.data?.skills ?? []
  const experience = profile.data?.experience ?? []

  return (
    <div className="page">
      {profile.data ? <Hero profile={profile.data} /> : null}

      {featured ? (
        <section className="section">
          <div className="section-label">{t('featuredWriting')}</div>
          <Link className="featured-card" to={`/posts/${featured.slug}`}>
            <div className="featured-body">
              <div className="chip-row">
                <span className="chip-accent">{categoryLabel(featured.category)}</span>
                <span className="chip-muted">{t('featuredBadge')}</span>
              </div>
              <div className="featured-title">{featured.title}</div>
              <div className="featured-excerpt">{featured.excerpt}</div>
              <div className="featured-meta">
                <span>{formatDate(postDate(featured))}</span>
                <span>·</span>
                <span>{minutesRead(readingMinutes(featured))}</span>
                <span className="read-more">{t('readArticle')}</span>
              </div>
            </div>
            <div className="featured-cover">
              {featured.coverUrl ? (
                <img src={featured.coverUrl} alt={featured.coverAlt} />
              ) : (
                <div className="cover-fallback">{t('coverPlaceholder')}</div>
              )}
            </div>
          </Link>
        </section>
      ) : (
        <div className="page-status">{t('noPosts')}</div>
      )}

      {latest.length ? (
        <section className="section">
          <div className="section-label-row">
            <span>{t('latestArticles')}</span>
            <Link className="view-all" to="/articles">{t('viewAll')}</Link>
          </div>
          <div className="card-grid">
            {latest.map((post, index) => <PostCard key={post.id} post={post} index={index} />)}
          </div>
        </section>
      ) : null}

      {projects.length ? (
        <section className="section">
          <div className="section-label-row">
            <span>{t('selectedProjects')}</span>
            <Link className="view-all" to="/projects">{t('viewAll')}</Link>
          </div>
          <div className="project-grid">
            {projects.slice(0, 4).map((project, index) => (
              <ProjectCard key={project.name} project={project} index={index} />
            ))}
          </div>
        </section>
      ) : null}

      {skills.length ? (
        <section className="section">
          <div className="section-label">{t('skillsLabel')}</div>
          <div className="skill-grid">
            {skills.map((group, index) => (
              <div className="skill-card" key={group.category}>
                <div className="skill-code">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <div className="skill-name">{group.category}</div>
                  <div className="skill-items">{group.items.join(' · ')}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {experience.length ? (
        <section className="section" style={{ paddingBottom: 24 }}>
          <div className="section-label">{t('timelineLabel')}</div>
          <Timeline items={experience} />
        </section>
      ) : null}
    </div>
  )
}

function Hero({ profile }: { profile: Profile }) {
  const { t } = useI18n()
  const glowRef = useRef<HTMLDivElement>(null)
  const [lead, restBio] = splitBio(profile.bio)
  const emailContact = profile.contacts.find((contact) => contact.url.startsWith('mailto:'))
  const otherContacts = profile.contacts.filter((contact) => !contact.url.startsWith('mailto:'))

  return (
    <div
      className="hero"
      onMouseMove={(event) => {
        const glow = glowRef.current
        if (!glow) return
        const rect = event.currentTarget.getBoundingClientRect()
        glow.style.transform = `translate(${event.clientX - rect.left - 270}px, ${event.clientY - rect.top - 270}px)`
      }}
    >
      <div className="hero-dots" />
      <div ref={glowRef} className="hero-glow" />
      <div className="hero-inner">
        <div className="hero-main">
          <div className="hero-badge"><i />{profile.title}</div>
          <h1 className="hero-name">{profile.name}</h1>
          <div className="hero-lead">{lead}</div>
          {restBio ? <div className="hero-sub">{restBio}</div> : (
            <div className="hero-sub">{t('siteDescription')}</div>
          )}
          <div className="hero-actions">
            <Link className="btn-primary" to="/about">{t('aboutMe')}</Link>
            {otherContacts.map((contact) => (
              <a key={contact.url} className="btn-outline" href={contact.url} target="_blank" rel="noreferrer">
                {contact.label || contact.type}
              </a>
            ))}
            {emailContact ? (
              <a className="btn-outline" href={emailContact.url}>{emailContact.label || t('emailFallback')}</a>
            ) : null}
          </div>
        </div>
        {/* 插画深浅各备一张，底色分别贴着两种主题的背景走。说明文字挂在容器上，
            两张图对读屏器隐藏，否则同一幅画会被念两遍。 */}
        <div className="hero-portrait" role="img" aria-label={t('heroArtworkAlt')}>
          <img
            className="hero-art hero-art-dark"
            src="/images/hero-editorial-character-dark.jpg"
            alt=""
            aria-hidden="true"
          />
          <img
            className="hero-art hero-art-light"
            src="/images/hero-editorial-character.jpg"
            alt=""
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  )
}

export function Timeline({ items }: { items: ProfileExperience[] }) {
  return (
    <div className="timeline">
      {items.map((item, index) => (
        <div className="timeline-row" key={index}>
          <div className="timeline-year">{item.period.match(/\d{4}/)?.[0] ?? item.period}</div>
          <div className="timeline-rail" />
          <div className="timeline-body">
            <div className="timeline-title">{item.role}{item.org ? ` — ${item.org}` : ''}</div>
            <div className="timeline-text">{item.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
