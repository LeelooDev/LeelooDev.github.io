import type { ProfileProject } from '../types'
import { useId } from 'react'

type Motif = 'phone' | 'browser' | 'nodes'

function pickMotif(project: ProfileProject): Motif {
  const tech = project.tech.join(' ').toLowerCase()
  if (tech.includes('swift') || tech.includes('ios')) return 'phone'
  if (tech.includes('go') || tech.includes('goroutine')) return 'nodes'
  return 'browser'
}

/** 没有截图的项目用 SVG 画一张示意封面：按技术栈选择手机 / 浏览器 / 服务节点三种母题。 */
export function ProjectCover({ project, index = 0 }: { project: ProfileProject; index?: number }) {
  const motif = pickMotif(project)
  const patternId = useId()
  return (
    <svg
      className="pcover"
      viewBox="0 0 800 480"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${project.name} 示意图`}
    >
      <defs>
        <pattern id={patternId} width="28" height="28" patternUnits="userSpaceOnUse">
          <circle className="pc-dot" cx="1.5" cy="1.5" r="1.5" />
        </pattern>
      </defs>
      <rect className="pc-bg" width="800" height="480" />
      <rect width="800" height="480" fill={`url(#${patternId})`} />
      {motif === 'phone' ? <PhoneMotif /> : motif === 'nodes' ? <NodesMotif /> : <BrowserMotif />}
      <text className="pc-text" x="36" y="446">{project.name}</text>
      <text className="pc-text" x="736" y="52">{String(index + 1).padStart(2, '0')}</text>
    </svg>
  )
}

function PhoneMotif() {
  return (
    <g>
      {/* 手机框 */}
      <rect className="pc-panel" x="320" y="64" width="176" height="352" rx="26" />
      <rect className="pc-line-soft" x="334" y="78" width="148" height="324" rx="16" fill="none" />
      <rect className="pc-fill" x="374" y="88" width="68" height="10" rx="5" />
      {/* 列表行 */}
      <rect className="pc-fill" x="346" y="122" width="124" height="34" rx="8" />
      <rect className="pc-fill" x="346" y="166" width="124" height="34" rx="8" />
      <rect className="pc-soft" x="346" y="210" width="124" height="34" rx="8" />
      <circle className="pc-accent" cx="362" cy="227" r="5" />
      <rect className="pc-fill" x="346" y="254" width="124" height="34" rx="8" />
      {/* 底部指示条 */}
      <rect className="pc-fill" x="378" y="386" width="60" height="6" rx="3" />
      {/* 信号弧线 */}
      <path className="pc-accent-line" d="M 552 200 a 48 48 0 0 1 0 80" fill="none" />
      <path className="pc-line" d="M 576 176 a 82 82 0 0 1 0 128" fill="none" />
      <path className="pc-line" d="M 600 152 a 116 116 0 0 1 0 176" fill="none" />
      <circle className="pc-accent" cx="540" cy="240" r="5" />
      {/* 左侧数据块 */}
      <rect className="pc-panel" x="128" y="150" width="140" height="76" rx="10" />
      <rect className="pc-accent" x="148" y="172" width="44" height="8" rx="4" />
      <rect className="pc-fill" x="148" y="192" width="100" height="8" rx="4" />
      <rect className="pc-panel" x="128" y="250" width="140" height="76" rx="10" />
      <rect className="pc-fill" x="148" y="272" width="76" height="8" rx="4" />
      <rect className="pc-fill" x="148" y="292" width="100" height="8" rx="4" />
      <path className="pc-line" d="M 268 188 H 320 M 268 288 H 320" />
    </g>
  )
}

function BrowserMotif() {
  return (
    <g>
      {/* 浏览器窗口 */}
      <rect className="pc-panel" x="130" y="82" width="540" height="322" rx="12" />
      <path className="pc-line" d="M 130 122 H 670" />
      <circle className="pc-dot3" cx="156" cy="102" r="5" />
      <circle className="pc-dot3" cx="176" cy="102" r="5" />
      <circle className="pc-dot3" cx="196" cy="102" r="5" />
      <rect className="pc-fill" x="300" y="94" width="200" height="16" rx="8" />
      {/* 侧栏 */}
      <path className="pc-line" d="M 254 122 V 404" />
      <rect className="pc-accent" x="172" y="146" width="58" height="9" rx="4.5" />
      <rect className="pc-fill" x="172" y="172" width="58" height="9" rx="4.5" />
      <rect className="pc-fill" x="172" y="198" width="58" height="9" rx="4.5" />
      <rect className="pc-fill" x="172" y="224" width="58" height="9" rx="4.5" />
      {/* 内容区 */}
      <rect className="pc-fill" x="284" y="150" width="180" height="14" rx="7" />
      <rect className="pc-fill" x="284" y="178" width="280" height="9" rx="4.5" />
      <rect className="pc-fill" x="284" y="198" width="240" height="9" rx="4.5" />
      <rect className="pc-panel" x="284" y="230" width="168" height="88" rx="10" />
      <rect className="pc-panel" x="470" y="230" width="168" height="88" rx="10" />
      <rect className="pc-soft" x="300" y="248" width="52" height="10" rx="5" />
      <rect className="pc-fill" x="300" y="272" width="120" height="8" rx="4" />
      <rect className="pc-soft" x="486" y="248" width="52" height="10" rx="5" />
      <rect className="pc-fill" x="486" y="272" width="120" height="8" rx="4" />
      {/* 折线 */}
      <polyline className="pc-accent-line" points="290,376 340,354 390,364 450,336 520,348 600,320" fill="none" />
      <circle className="pc-accent" cx="600" cy="320" r="5" />
    </g>
  )
}

function NodesMotif() {
  return (
    <g>
      {/* 三个服务节点 */}
      <rect className="pc-panel" x="118" y="196" width="160" height="88" rx="10" />
      <rect className="pc-panel" x="320" y="196" width="160" height="88" rx="10" />
      <rect className="pc-panel" x="522" y="196" width="160" height="88" rx="10" />
      <rect className="pc-accent" x="140" y="222" width="52" height="9" rx="4.5" />
      <rect className="pc-fill" x="140" y="246" width="112" height="8" rx="4" />
      <rect className="pc-accent" x="342" y="222" width="52" height="9" rx="4.5" />
      <rect className="pc-fill" x="342" y="246" width="112" height="8" rx="4" />
      <rect className="pc-accent" x="544" y="222" width="52" height="9" rx="4.5" />
      <rect className="pc-fill" x="544" y="246" width="112" height="8" rx="4" />
      {/* 连接线 */}
      <path className="pc-line" d="M 278 230 H 320 M 278 252 H 320 M 480 230 H 522 M 480 252 H 522" />
      <circle className="pc-accent" cx="299" cy="230" r="4" />
      <circle className="pc-accent" cx="501" cy="252" r="4" />
      {/* 上方消息流 */}
      <path className="pc-line-soft" d="M 198 196 V 140 Q 198 120 218 120 H 582 Q 602 120 602 140 V 196" fill="none" />
      <rect className="pc-soft" x="352" y="102" width="96" height="34" rx="17" />
      <circle className="pc-accent" cx="376" cy="119" r="5" />
      <rect className="pc-fill" x="392" y="115" width="40" height="8" rx="4" />
      {/* 下方时序点 */}
      <path className="pc-line" d="M 160 340 H 640" strokeDasharray="2 8" />
      <circle className="pc-accent" cx="240" cy="340" r="5" />
      <circle className="pc-dot3" cx="400" cy="340" r="5" />
      <circle className="pc-dot3" cx="560" cy="340" r="5" />
    </g>
  )
}
