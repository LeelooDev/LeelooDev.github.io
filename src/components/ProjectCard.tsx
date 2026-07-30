import type { ProfileProject } from '../types'
import { Link } from 'react-router-dom'
import { ProjectCover } from './ProjectCover'
import { useI18n } from '../i18n'
import { projectOverview } from '../lib'

export function ProjectCard({ project, index = 0 }: { project: ProfileProject; index?: number }) {
  const { t } = useI18n()
  return (
    <Link className="project-card" to={`/projects/${index}`} style={{ animationDelay: `${index * 0.06}s` }}>
      <div className="project-card-cover">
        {project.coverUrl ? (
          <img className="cover-img" src={project.coverUrl} alt={`${project.name} ${t('projectShot')}`} loading="lazy" />
        ) : (
          <ProjectCover project={project} index={index} />
        )}
      </div>
      <div className="project-card-body">
        <div className="project-card-head">
          <div className="project-card-name">{project.name}</div>
          {project.period || project.role ? (
            <span className="project-pill">{project.period || project.role}</span>
          ) : null}
        </div>
        <div className="project-card-desc project-card-desc-clamp">{projectOverview(project.description)}</div>
        <div className="project-card-foot">
          <span className="project-stack">{project.tech.join(' · ')}</span>
          <span className="project-link">{t('viewDetail')}</span>
        </div>
      </div>
    </Link>
  )
}
