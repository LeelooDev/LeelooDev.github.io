import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'

// GitHub Pages 会把未命中的路径交给根目录的 404.html，预渲染时这个页面就写在那里。
export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="page-status">
      <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
        {t('notFoundTitle')}
      </p>
      <p style={{ marginBottom: 20 }}>{t('notFoundText')}</p>
      <Link to="/" style={{ color: 'var(--accent)' }}>
        {t('backHome')}
      </Link>
    </div>
  )
}
