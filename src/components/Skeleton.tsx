import type { CSSProperties } from 'react'

// 骨架屏：加载期间复用真实版式的布局类占位，内容到达后不产生跳动。
// 微光扫过动画与明暗主题适配见 styles.css 的 .sk 规则。

interface SkProps {
  w?: number | string
  h?: number | string
  r?: number | string
  style?: CSSProperties
}

function Sk({ w = '100%', h = 14, r = 6, style }: SkProps) {
  return <div className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

function PostCardSkeleton() {
  return (
    <div className="article-card sk-card">
      <div className="article-card-cover"><Sk h="100%" r={0} /></div>
      <div className="article-card-body">
        <Sk w={64} h={10} style={{ marginBottom: 12 }} />
        <Sk w="88%" h={17} style={{ marginBottom: 8 }} />
        <Sk w="56%" h={17} style={{ marginBottom: 14 }} />
        <Sk h={12} style={{ marginBottom: 6 }} />
        <Sk w="74%" h={12} style={{ marginBottom: 16 }} />
        <Sk w={130} h={11} />
      </div>
    </div>
  )
}

function ProjectCardSkeleton({ coverHeight = 190 }: { coverHeight?: number }) {
  return (
    <div className="project-card sk-card">
      <div className="project-card-cover" style={{ height: coverHeight }}><Sk h="100%" r={0} /></div>
      <div className="project-card-body">
        <div className="project-card-head">
          <Sk w={150} h={18} />
          <Sk w={88} h={20} r={99} />
        </div>
        <Sk h={13} style={{ marginBottom: 7 }} />
        <Sk w="82%" h={13} style={{ marginBottom: 16 }} />
        <Sk w="64%" h={11} style={{ marginBottom: 16 }} />
        <div className="project-card-foot">
          <Sk w={140} h={12} />
          <Sk w={72} h={13} />
        </div>
      </div>
    </div>
  )
}

function TimelineSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="timeline">
      {Array.from({ length: rows }, (_, index) => (
        <div className="timeline-row" key={index}>
          <div className="timeline-year"><Sk w={42} h={13} /></div>
          <div className="timeline-rail" />
          {/* timeline-body 宽度由内容决定，骨架条用百分比宽度需要撑满行 */}
          <div className="timeline-body" style={{ flex: 1 }}>
            <Sk w="52%" h={15} style={{ marginBottom: 10 }} />
            <Sk h={13} style={{ marginBottom: 6 }} />
            <Sk w="78%" h={13} />
          </div>
        </div>
      ))}
    </div>
  )
}

function SectionLabelSkeleton() {
  return <div className="section-label"><Sk w={96} h={11} /></div>
}

export function HomeSkeleton() {
  return (
    <div className="page">
      <div className="hero">
        <div className="hero-dots" />
        <div className="hero-inner">
          <div className="hero-main">
            <Sk w={150} h={15} style={{ marginBottom: 22 }} />
            <Sk w={300} h={54} r={10} style={{ marginBottom: 22 }} />
            <Sk w="84%" h={20} style={{ marginBottom: 12 }} />
            <Sk w="62%" h={20} style={{ marginBottom: 24 }} />
            <Sk w="72%" h={13} style={{ marginBottom: 9 }} />
            <Sk w="50%" h={13} style={{ marginBottom: 34 }} />
            <div style={{ display: 'flex', gap: 12 }}>
              <Sk w={104} h={36} r={8} />
              <Sk w={92} h={36} r={8} />
              <Sk w={92} h={36} r={8} />
            </div>
          </div>
          <Sk w={210} h={252} r={14} style={{ flex: 'none' }} />
        </div>
      </div>

      <section className="section">
        <SectionLabelSkeleton />
        <div className="featured-card sk-card">
          <div className="featured-body">
            <div className="chip-row">
              <Sk w={72} h={20} r={5} />
              <Sk w={60} h={12} />
            </div>
            <Sk w="90%" h={28} style={{ marginBottom: 10 }} />
            <Sk w="58%" h={28} style={{ marginBottom: 18 }} />
            <Sk h={15} style={{ marginBottom: 8 }} />
            <Sk w="82%" h={15} style={{ marginBottom: 24 }} />
            <div style={{ display: 'flex', gap: 14 }}>
              <Sk w={86} h={12} />
              <Sk w={64} h={12} />
            </div>
          </div>
          <div className="featured-cover"><Sk h="100%" r={0} style={{ minHeight: 280 }} /></div>
        </div>
      </section>

      <section className="section">
        <div className="section-label-row">
          <Sk w={96} h={11} />
          <Sk w={64} h={12} />
        </div>
        <div className="card-grid">
          {Array.from({ length: 3 }, (_, index) => <PostCardSkeleton key={index} />)}
        </div>
      </section>

      <section className="section">
        <div className="section-label-row">
          <Sk w={96} h={11} />
          <Sk w={64} h={12} />
        </div>
        <div className="project-grid">
          {Array.from({ length: 2 }, (_, index) => <ProjectCardSkeleton key={index} />)}
        </div>
      </section>
    </div>
  )
}

export function ArticlesSkeleton() {
  return (
    <div className="page">
      <section className="section" style={{ paddingTop: 64 }}>
        <div className="page-head">
          <div>
            <Sk w={180} h={34} r={8} style={{ marginBottom: 12 }} />
            <Sk w={260} h={14} />
          </div>
          <Sk w={240} h={38} r={9} />
        </div>
        <div className="cat-pills">
          {Array.from({ length: 4 }, (_, index) => (
            <Sk key={index} w={index === 0 ? 64 : 80} h={28} r={99} />
          ))}
        </div>
        <div className="result-line"><Sk w={110} h={12} /></div>
        <div className="card-grid">
          {Array.from({ length: 6 }, (_, index) => <PostCardSkeleton key={index} />)}
        </div>
      </section>
    </div>
  )
}

export function ArchiveSkeleton() {
  return (
    <div className="page">
      <section className="section" style={{ paddingTop: 64 }}>
        <Sk w={160} h={34} r={8} style={{ marginBottom: 14 }} />
        <Sk w={280} h={14} style={{ marginBottom: 36 }} />

        <div className="stat-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="stat-card" key={index}>
              <Sk w={56} h={26} style={{ marginBottom: 10 }} />
              <Sk w={80} h={11} />
            </div>
          ))}
        </div>

        <div className="heatmap-card">
          <div className="heatmap-head" style={{ marginBottom: 14 }}>
            <Sk w={90} h={11} />
            <Sk w={70} h={11} />
          </div>
          <Sk h={96} r={8} />
        </div>

        <div className="archive-layout">
          <div className="archive-main">
            {Array.from({ length: 2 }, (_, year) => (
              <div className="archive-year" key={year}>
                <div className="archive-year-head">
                  <Sk w={64} h={20} />
                  <Sk w={48} h={12} />
                </div>
                {Array.from({ length: 3 }, (_, row) => (
                  <div key={row} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, padding: '13px 0' }}>
                    <Sk w={`${62 - row * 8}%`} h={15} />
                    <Sk w={96} h={12} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <aside className="archive-side">
            <div className="side-label"><Sk w={72} h={11} /></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 34 }}>
              {Array.from({ length: 6 }, (_, index) => (
                <Sk key={index} w={44 + (index % 3) * 18} h={14} />
              ))}
            </div>
            <div className="side-label"><Sk w={72} h={11} /></div>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} style={{ marginBottom: 14 }}>
                <Sk w="46%" h={12} style={{ marginBottom: 8 }} />
                <Sk h={4} r={99} />
              </div>
            ))}
          </aside>
        </div>
      </section>
    </div>
  )
}

export function PostSkeleton() {
  return (
    <div className="page">
      <div className="article-head">
        <Sk w={92} h={13} style={{ marginBottom: 26 }} />
        <div className="article-chips">
          <Sk w={72} h={20} r={5} />
          <Sk w={88} h={12} />
        </div>
        <Sk w="92%" h={40} r={9} style={{ margin: '18px 0 12px' }} />
        <Sk w="60%" h={40} r={9} style={{ marginBottom: 20 }} />
        <Sk w="76%" h={16} style={{ marginBottom: 24 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <Sk w={28} h={28} r="50%" />
          <Sk w={82} h={13} />
          <Sk w={64} h={13} />
          <Sk w={120} h={13} />
        </div>
      </div>

      <div className="article-cover-wrap">
        <Sk h={340} r={14} />
      </div>

      <div className="article-layout">
        <div className="article-content">
          {Array.from({ length: 3 }, (_, block) => (
            <div key={block} style={{ marginBottom: 34 }}>
              {block > 0 ? <Sk w="42%" h={22} style={{ marginBottom: 18 }} /> : null}
              <Sk h={14} style={{ marginBottom: 9 }} />
              <Sk h={14} style={{ marginBottom: 9 }} />
              <Sk w="94%" h={14} style={{ marginBottom: 9 }} />
              <Sk w="70%" h={14} />
            </div>
          ))}
        </div>
        <aside className="article-toc sk-toc">
          <Sk w={56} h={11} style={{ marginBottom: 16 }} />
          {Array.from({ length: 4 }, (_, index) => (
            <Sk key={index} w={`${86 - index * 12}%`} h={13} style={{ marginBottom: 11 }} />
          ))}
        </aside>
      </div>
    </div>
  )
}

export function AboutSkeleton() {
  return (
    <div className="page">
      <div className="about-layout">
        <aside className="about-side">
          <Sk w={280} h={330} r={16} />
          <Sk w={140} h={22} style={{ margin: '22px 0 10px' }} />
          <Sk w={180} h={13} style={{ marginBottom: 10 }} />
          <Sk w={110} h={11} style={{ marginBottom: 24 }} />
          {Array.from({ length: 3 }, (_, index) => (
            <Sk key={index} w={`${64 - index * 10}%`} h={13} style={{ marginBottom: 11 }} />
          ))}
          <Sk h={38} r={8} style={{ marginTop: 22 }} />
        </aside>
        <div className="about-main">
          <Sk w="78%" h={34} r={8} style={{ marginBottom: 24 }} />
          <Sk h={15} style={{ marginBottom: 9 }} />
          <Sk h={15} style={{ marginBottom: 9 }} />
          <Sk w="86%" h={15} style={{ marginBottom: 9 }} />
          <Sk w="58%" h={15} style={{ marginBottom: 36 }} />
          <Sk h={110} r={14} style={{ marginBottom: 40 }} />
          <Sk w={96} h={11} style={{ marginBottom: 20 }} />
          <TimelineSkeleton />
        </div>
      </div>
    </div>
  )
}

export function NowSkeleton() {
  return (
    <div className="page">
      <div className="now-wrap">
        <Sk w={140} h={38} r={9} style={{ marginBottom: 14 }} />
        <Sk w="64%" h={14} style={{ marginBottom: 12 }} />
        <Sk w={170} h={12} style={{ marginBottom: 40 }} />
        {Array.from({ length: 3 }, (_, section) => (
          <div className="now-section" key={section}>
            <div className="now-section-head">
              <Sk w={88} h={11} />
              <i />
            </div>
            <div className="now-items">
              {Array.from({ length: 2 }, (_, item) => (
                <div className="now-item" key={item}>
                  <Sk w={7} h={7} r="50%" style={{ flex: 'none', marginTop: 6 }} />
                  <div className="now-item-main" style={{ flex: 1 }}>
                    <Sk w="46%" h={15} style={{ marginBottom: 8 }} />
                    <Sk w="72%" h={13} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProjectsSkeleton() {
  return (
    <div className="page">
      <section className="section" style={{ paddingTop: 64 }}>
        <Sk w={160} h={34} r={8} style={{ marginBottom: 14 }} />
        <Sk w={300} h={14} style={{ marginBottom: 36 }} />
        <div className="project-grid" style={{ gap: 22 }}>
          {Array.from({ length: 4 }, (_, index) => <ProjectCardSkeleton key={index} coverHeight={210} />)}
        </div>
      </section>
    </div>
  )
}

export function ProjectDetailSkeleton() {
  return (
    <div className="page">
      <div className="section" style={{ paddingTop: 48 }}>
        <Sk w={92} h={13} style={{ marginBottom: 28 }} />
        <div className="article-chips" style={{ margin: '0 0 16px' }}>
          <Sk w={88} h={22} r={99} />
          <Sk w={100} h={12} />
        </div>
        <Sk w="52%" h={38} r={9} style={{ marginBottom: 18 }} />
        <Sk w="78%" h={16} style={{ marginBottom: 10 }} />
        <Sk w="46%" h={16} style={{ marginBottom: 30 }} />
        <Sk h={92} r={14} style={{ marginBottom: 28 }} />
        <Sk h={320} r={16} style={{ marginBottom: 44 }} />
        <div className="project-detail-layout">
          <div className="project-detail-main">
            {Array.from({ length: 2 }, (_, block) => (
              <div key={block} style={{ marginBottom: 36 }}>
                <Sk w={110} h={11} style={{ marginBottom: 16 }} />
                <Sk h={14} style={{ marginBottom: 9 }} />
                <Sk w="90%" h={14} style={{ marginBottom: 9 }} />
                <Sk w="68%" h={14} />
              </div>
            ))}
          </div>
          <aside className="project-detail-side">
            <Sk w={80} h={11} style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Array.from({ length: 5 }, (_, index) => (
                <Sk key={index} w={56 + (index % 3) * 16} h={24} r={7} />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
