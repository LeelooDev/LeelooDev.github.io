import { Link, Navigate, useParams } from 'react-router-dom'
import { ProjectCover } from '../components/ProjectCover'
import { ProjectDetailSkeleton } from '../components/Skeleton'
import { useI18n } from '../i18n'
import { parseProjectDescription, useProfile } from '../lib'

export function ProjectDetailPage() {
  const { lang, t } = useI18n()
  const { index = '' } = useParams()
  const profile = useProfile()

  if (profile.isPending) return <ProjectDetailSkeleton />
  if (profile.isError) return <div className="page-status">{t('profileError')}</div>

  const projects = profile.data.projects ?? []
  const projectIndex = Number(index)
  const project = Number.isInteger(projectIndex) ? projects[projectIndex] : undefined
  if (!project) return <Navigate replace to="/projects" />

  const sections = parseProjectDescription(project.description)
  const highlight = sections.find((section) => /亮点|highlight/i.test(section.title))
  const overview = sections.find((section) => /概述|描述|overview|summary/i.test(section.title)) ?? sections[0]
  const mainSections = sections.filter((section) => section !== highlight && section !== overview)
  const techCount = lang === 'zh' ? `${project.tech.length} 项核心技术` : `${project.tech.length} core technologies`

  return (
    <div className="page">
      <div className="section" style={{ paddingTop: 48 }}>
        <Link className="back-link" to="/projects">{t('allProjects')}</Link>

        <div className="article-chips" style={{ margin: '28px 0 16px' }}>
          <span className="chip-accent" style={{ borderRadius: 99, padding: '3px 9px' }}>{project.role}</span>
          {project.period ? <span className="article-date">{project.period}</span> : null}
        </div>
        <h1 className="project-detail-title">{project.name}</h1>
        {overview?.text ? <div className="project-detail-lead">{overview.text}</div> : null}

        <div className="project-meta-card">
          <div>
            <div className="project-meta-label">{t('roleLabel')}</div>
            <div className="project-meta-value">{project.role}</div>
          </div>
          {project.period ? (
            <div>
              <div className="project-meta-label">{t('periodLabel')}</div>
              <div className="project-meta-value">{project.period}</div>
            </div>
          ) : null}
          <div>
            <div className="project-meta-label">{t('stackLabel')}</div>
            <div className="project-meta-value">{techCount}</div>
          </div>
          {project.link ? (
            <div className="project-meta-action">
              <a className="btn-outline" href={project.link} target="_blank" rel="noreferrer">{t('projectRepo')}</a>
            </div>
          ) : null}
        </div>

        <div className="project-banner">
          {project.coverUrl ? (
            <img src={project.coverUrl} alt={`${project.name} ${t('projectShot')}`} />
          ) : (
            <ProjectCover project={project} index={projectIndex} />
          )}
        </div>

        <div className="project-detail-layout">
          <div className="project-detail-main">
            {mainSections.map((section, sectionIndex) => (
              <section key={sectionIndex}>
                <div className="project-block-label">{section.title || t('overviewLabel')}</div>
                {section.text ? <div className="project-block-text">{section.text}</div> : null}
                {section.bullets.length ? (
                  <div className="project-bullets">
                    {section.bullets.map((bullet, bulletIndex) => (
                      <div className="project-bullet" key={bulletIndex}>
                        <span>→</span>
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
            {highlight ? (
              <section>
                <div className="project-block-label">{highlight.title}</div>
                <div className="project-highlight">
                  <div className="project-highlight-label">Highlight</div>
                  <div>{highlight.text}</div>
                </div>
              </section>
            ) : null}
          </div>

          <aside className="project-detail-side">
            <div className="project-block-label">{t('stackLabel')}</div>
            <div className="tag-row" style={{ marginBottom: 0 }}>
              {project.tech.map((tech) => (
                <span className="tag-chip" style={{ color: 'var(--text2)' }} key={tech}>{tech}</span>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
