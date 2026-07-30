import { Link } from 'react-router-dom'
import { Timeline } from './HomePage'
import { AboutSkeleton } from '../components/Skeleton'
import { useI18n } from '../i18n'
import { useProfile } from '../lib'

export function AboutPage() {
  const { t } = useI18n()
  const query = useProfile()
  if (query.isPending) return <AboutSkeleton />
  if (query.isError) return <div className="page-status">{t('profileError')}</div>
  const profile = query.data

  const paragraphs = profile.bio.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean)

  return (
    <div className="page">
      <div className="about-layout">
        <aside className="about-side">
          {profile.avatarUrl ? (
            <img className="about-portrait" src={profile.avatarUrl} alt={profile.name} />
          ) : (
            <div className="about-portrait-fallback">{profile.name?.[0] ?? 'M'}</div>
          )}
          <div className="about-side-name">{profile.name}</div>
          {profile.title ? <div className="about-side-title">{profile.title}</div> : null}
          {profile.location ? <div className="about-side-loc">{profile.location}</div> : null}
          <div className="about-side-links">
            {profile.contacts.map((contact) => (
              <a
                key={contact.url}
                href={contact.url}
                target={contact.url.startsWith('mailto:') ? undefined : '_blank'}
                rel="noreferrer"
              >
                {contact.url.startsWith('mailto:') ? '✉' : '↗'} {contact.label || contact.type}
              </a>
            ))}
          </div>
          <Link
            className="btn-primary"
            to="/projects"
            style={{ display: 'block', marginTop: 22, textAlign: 'center' }}
          >
            {t('viewProjects')}
          </Link>
        </aside>

        <div className="about-main">
          <h1 className="about-h1">{profile.headline || profile.title || profile.name}</h1>
          {paragraphs.map((paragraph, index) => (
            <p className="about-bio" key={index}>{paragraph}</p>
          ))}

          {profile.philosophy ? (
            <div className="about-philo">
              <div className="about-block-label" style={{ margin: '0 0 10px' }}>{t('philosophyLabel')}</div>
              <div className="about-philo-quote">{profile.philosophy}</div>
            </div>
          ) : null}

          {profile.experience.length ? (
            <>
              <div className="about-block-label">{t('experienceLabel')}</div>
              <Timeline items={profile.experience} />
            </>
          ) : null}

          {profile.education.length || profile.certificates.length ? (
            <div className="about-two-col">
              {profile.education.length ? (
                <div>
                  <div className="about-block-label">{t('educationLabel')}</div>
                  {profile.education.map((entry) => (
                    <div className="about-edu" key={`${entry.school}-${entry.degree}`}>
                      <div className="about-edu-degree">{entry.degree}</div>
                      <div className="about-edu-school">
                        {[entry.school, entry.period].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {profile.certificates.length ? (
                <div>
                  <div className="about-block-label">{t('certificatesLabel')}</div>
                  <div className="about-list">
                    {profile.certificates.map((cert) => <span key={cert}>{cert}</span>)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {profile.openSource.length ? (
            <>
              <div className="about-block-label">{t('openSourceLabel')}</div>
              <div className="about-oss">
                {profile.openSource.map((item) => {
                  const body = (
                    <>
                      <span className="about-oss-repo">{item.repo}</span>
                      <span className="about-oss-desc">{item.description}</span>
                      {item.stars ? <span className="about-oss-stars">{item.stars}</span> : null}
                    </>
                  )
                  return item.link ? (
                    <a className="about-oss-item" key={item.repo} href={item.link} target="_blank" rel="noreferrer">
                      {body}
                    </a>
                  ) : (
                    <div className="about-oss-item" key={item.repo}>{body}</div>
                  )
                })}
              </div>
            </>
          ) : null}

          {profile.awards.length || profile.facts.length ? (
            <div className="about-two-col" style={{ marginBottom: 12 }}>
              {profile.awards.length ? (
                <div>
                  <div className="about-block-label">{t('awardsLabel')}</div>
                  <div className="about-list">
                    {profile.awards.map((award) => <span key={award}>{award}</span>)}
                  </div>
                </div>
              ) : null}
              {profile.facts.length ? (
                <div>
                  <div className="about-block-label">{t('factsLabel')}</div>
                  <div className="about-facts">
                    {profile.facts.map((fact) => <span key={fact}>· {fact}</span>)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
