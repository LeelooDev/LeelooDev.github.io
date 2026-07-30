import { NowSkeleton } from '../components/Skeleton'
import { useI18n } from '../i18n'
import { useProfile } from '../lib'

// 「此刻」页：数据来自 profile.now（后端已按语言返回），结构复刻设计稿的 /now 版式。
export function NowPage() {
  const { t } = useI18n()
  const query = useProfile()
  if (query.isPending) return <NowSkeleton />
  if (query.isError) return <div className="page-status">{t('profileError')}</div>
  const now = query.data.now

  return (
    <div className="page">
      <div className="now-wrap">
        <h1 className="now-title">{t('navNow')}</h1>
        <div className="now-sub">{t('nowSub')}</div>
        <div className="now-updated">{t('nowUpdatedPrefix')}{now.updatedAt}</div>
        {now.sections.map((section) => (
          <div className="now-section" key={section.label}>
            <div className="now-section-head">
              <span>{section.label}</span>
              <i />
            </div>
            <div className="now-items">
              {section.items.map((item) => (
                <div className="now-item" key={item.title}>
                  <span className="now-dot" />
                  <div className="now-item-main">
                    <div className="now-item-title">{item.title}</div>
                    <div className="now-item-note">{item.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="now-foot">{t('nowFoot')}</div>
      </div>
    </div>
  )
}
