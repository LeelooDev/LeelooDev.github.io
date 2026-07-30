import { Link } from 'react-router-dom'
import { ProjectCover } from '../components/ProjectCover'
import { ProjectsSkeleton } from '../components/Skeleton'
import { useI18n } from '../i18n'
import { projectOverview, useProfile } from '../lib'

export function ProjectsPage() {
  const { t } = useI18n()
  const profile = useProfile()
  if (profile.isPending) return <ProjectsSkeleton />
  if (profile.isError) return <div className="page-status">{t('profileError')}</div>

  const projects = profile.data.projects ?? []

  return (
    <div className="page">
      <section className="section" style={{ paddingTop: 64 }}>
        <h1 className="page-h1">{t('projectsTitle')}</h1>
        <div className="page-sub" style={{ marginBottom: 36 }}>{t('projectsSub')}</div>
        <div className="project-grid" style={{ gap: 22 }}>
          {projects.map((project, index) => (
            <Link
              className="project-card"
              key={project.name}
              to={`/projects/${index}`}
              style={{ animationDelay: `${index * 0.06}s` }}
            >
              <div className="project-card-cover" style={{ height: 210 }}>
                {project.coverUrl ? (
                  <img className="cover-img" src={project.coverUrl} alt={`${project.name} ${t('projectShot')}`} loading="lazy" />
                ) : (
                  <ProjectCover project={project} index={index} />
                )}
              </div>
              <div className="project-card-body" style={{ padding: '24px 26px 26px' }}>
                <div className="project-card-head">
                  <div className="project-card-name" style={{ fontSize: 19 }}>{project.name}</div>
                  {project.period ? <span className="project-pill">{project.period}</span> : null}
                </div>
                <div className="project-card-desc project-card-desc-clamp" style={{ marginBottom: 16 }}>
                  {projectOverview(project.description)}
                </div>
                <div className="project-stack" style={{ marginBottom: 16, whiteSpace: 'normal' }}>{project.tech.join(' · ')}</div>
                <div
                  className="project-card-foot"
                  style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}
                >
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {[project.role, project.period].filter(Boolean).join(' · ')}
                  </span>
                  <span className="project-link">{t('viewDetail')}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
