import { useEffect, type RefObject } from 'react'
import { useI18n } from './i18n'

/** 缩放档位。1 = 按视口等比铺满（contain），再往上是在这个基准上的倍数。 */
const ZOOM_STEPS = [1, 1.5, 2, 3, 4]
/** 点击图本身时在「铺满」和这一档之间来回切换——最常用的两个状态，不必按加号。 */
const CLICK_ZOOM = 2
/**
 * 打开后至少要比正文里大这么多倍，否则自动往上跳档。
 *
 * 窄屏上这条很关键：手机竖屏放一张宽图，按视口「铺满」得到的宽度和正文里几乎一样
 * （正文本来就占满屏宽），点开等于没放大。这时宁可让图溢出、用横向滚动去看，
 * 也好过给一张同样看不清的图。
 */
const MIN_MAGNIFICATION = 2

/**
 * 正文插图点击放大。
 *
 * 正文里的图表是内联 SVG，在 680px 的文章栏宽下细节挤成一团，这里把它提到全屏浮层
 * 里按视口尺寸重绘——SVG 是矢量，放大不失真，所以「看清楚」这件事只是尺寸问题。
 *
 * 触发用事件委托：正文由 dangerouslySetInnerHTML 注入，换文章时整棵子树会被替换掉，
 * 委托到根节点就不必跟着重新绑定。
 */
export function useLightbox(ref: RefObject<HTMLDivElement | null>) {
  const { t } = useI18n()

  useEffect(() => {
    const root = ref.current
    if (!root) return

    /**
     * 给插图挂上可聚焦、可回车触发的按钮语义，键盘用户和读屏器才拿得到这个功能。
     *
     * 必须能重复执行：React 会在 hydration 之后的某次更新里把整段正文原样重设一遍
     * （dangerouslySetInnerHTML 的子树被整体换新），客户端加的属性会随旧节点一起消失。
     * 下面的 MutationObserver 就是为了在那之后把标记补回来——只标一次的话，正文一被
     * 重设，所有插图就再也点不开了。
     */
    const mark = () => {
      // figure.diagram 整块作为一个目标（连带 figcaption），独立的 img 各算一个。
      Array.from(root.querySelectorAll<HTMLElement>('figure.diagram, img'))
        .filter((el) => !(el.tagName === 'IMG' && el.closest('figure.diagram')))
        .forEach((el) => {
          el.dataset.zoomable = ''
          el.tabIndex = 0
          el.setAttribute('role', 'button')
          const label = describe(el)
          el.setAttribute('aria-label', label ? `${label} — ${t('figureZoom')}` : t('figureZoom'))
          el.title = t('figureZoom')
        })
    }
    mark()
    // 只看结构变化。标记本身只改属性，不会把自己再触发一遍。
    const observer = new MutationObserver(mark)
    observer.observe(root, { childList: true, subtree: true })

    /** 当前打开的浮层的关闭函数；没打开时为 null。 */
    let dismiss: (() => void) | null = null

    const open = (source: HTMLElement) => {
      const artwork = cloneArtwork(source)
      if (!artwork) return
      dismiss?.()

      const overlay = document.createElement('div')
      overlay.className = 'lightbox'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-modal', 'true')
      overlay.setAttribute('aria-label', t('figureViewer'))

      const bar = document.createElement('div')
      bar.className = 'lightbox-bar'

      const caption = document.createElement('div')
      caption.className = 'lightbox-caption'
      caption.textContent = describe(source)

      const zoomOut = button('lightbox-btn', t('figureZoomOut'), '−')
      const level = document.createElement('span')
      level.className = 'lightbox-level'
      const zoomIn = button('lightbox-btn', t('figureZoomIn'), '+')
      const close = button('lightbox-btn lightbox-close', t('figureClose'), '✕')

      bar.append(caption, zoomOut, level, zoomIn, close)

      const stage = document.createElement('div')
      stage.className = 'lightbox-stage'
      const frame = document.createElement('div')
      frame.className = 'lightbox-frame'
      frame.append(artwork.node)
      stage.append(frame)
      overlay.append(bar, stage)

      let step = 0
      /**
       * 「铺满」状态下 frame 的尺寸。全部从实际 computed padding 反推，CSS 因此是
       * 留白的唯一来源——响应式改了 padding 这里自动跟上，不会两处各写一个数字
       * 然后慢慢漂移。
       */
      const measure = () => {
        const stagePad = insets(stage)
        const framePad = insets(frame)
        const availableWidth = stage.clientWidth - stagePad.x
        const availableHeight = stage.clientHeight - stagePad.y
        // 图的比例指的是边框内部，所以两个方向都要先把 frame 自己的内边距摘出去。
        const fitWidth = Math.max(
          240,
          Math.min(availableWidth, (availableHeight - framePad.y) * artwork.ratio + framePad.x),
        )
        return { framePad, fitWidth }
      }

      const render = () => {
        const zoom = ZOOM_STEPS[step]
        const { fitWidth, framePad } = measure()
        // 超出视口的部分交给 stage 滚动，这样不必自己实现拖拽平移，触屏滑动也天然可用。
        const width = fitWidth * zoom
        frame.style.width = `${Math.round(width)}px`
        frame.style.height = `${Math.round((width - framePad.x) / artwork.ratio + framePad.y)}px`
        if (step > 0) frame.dataset.zoomed = ''
        else delete frame.dataset.zoomed
        level.textContent = `${Math.round(zoom * 100)}%`
        zoomOut.disabled = step === 0
        zoomIn.disabled = step === ZOOM_STEPS.length - 1
      }
      const setStep = (next: number) => {
        step = Math.min(ZOOM_STEPS.length - 1, Math.max(0, next))
        render()
      }

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          dismiss?.()
          return
        }
        if (event.key !== 'Tab') return
        // 浮层是模态的，Tab 不该跑回被遮住的页面上。
        const focusable = Array.from(overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || !overlay.contains(active))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }

      const bodyOverflow = document.body.style.overflow
      dismiss = () => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('resize', render)
        overlay.remove()
        document.body.style.overflow = bodyOverflow
        dismiss = null
        source.focus({ preventScroll: true })
      }

      zoomOut.addEventListener('click', () => setStep(step - 1))
      zoomIn.addEventListener('click', () => setStep(step + 1))
      close.addEventListener('click', () => dismiss?.())
      frame.addEventListener('click', () => setStep(step > 0 ? 0 : ZOOM_STEPS.indexOf(CLICK_ZOOM)))
      // 点空白处关闭：只认舞台和遮罩本身，点在图上要留给缩放。
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay || event.target === stage) dismiss?.()
      })
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('resize', render)

      document.body.style.overflow = 'hidden'
      document.body.append(overlay)
      // 量过真实尺寸才知道「铺满」到底放大了多少，所以起始档位要等挂到文档里再定。
      const { fitWidth, framePad } = measure()
      step = pickStep(fitWidth - framePad.x, artwork.sourceWidth)
      render()
      close.focus({ preventScroll: true })
    }

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-zoomable]')
      if (target) open(target)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-zoomable]')
      if (!target) return
      event.preventDefault()
      open(target)
    }

    root.addEventListener('click', onClick)
    root.addEventListener('keydown', onKeyDown)
    return () => {
      observer.disconnect()
      root.removeEventListener('click', onClick)
      root.removeEventListener('keydown', onKeyDown)
      dismiss?.()
    }
  }, [ref, t])
}

/** 起始档位：铺满就够大就用铺满，否则往上跳到第一个够大的档。 */
function pickStep(fitWidth: number, sourceWidth: number): number {
  if (sourceWidth <= 0) return 0
  const target = sourceWidth * MIN_MAGNIFICATION
  const index = ZOOM_STEPS.findIndex((zoom) => fitWidth * zoom >= target)
  return index === -1 ? ZOOM_STEPS.length - 1 : index
}

/** 元素的横向、纵向内边距合计。 */
function insets(el: HTMLElement): { x: number; y: number } {
  const styles = getComputedStyle(el)
  return {
    x: parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight),
    y: parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom),
  }
}

/** 插图的说明文字：图表取 figcaption，图片取 alt。 */
function describe(el: HTMLElement): string {
  const caption = el.querySelector('figcaption')?.textContent?.trim()
  if (caption) return caption
  return (el.getAttribute('alt') ?? '').trim()
}

function button(className: string, label: string, glyph: string): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = className
  el.setAttribute('aria-label', label)
  el.title = label
  el.textContent = glyph
  return el
}

interface Artwork {
  node: SVGSVGElement | HTMLImageElement
  /** 宽高比，用来算「铺满视口」时的尺寸。 */
  ratio: number
  /** 这张图在正文里的显示宽度，用来判断放大后到底有没有变大。 */
  sourceWidth: number
}

function cloneArtwork(source: HTMLElement): Artwork | null {
  if (source instanceof HTMLImageElement) {
    const node = source.cloneNode(false) as HTMLImageElement
    node.removeAttribute('style')
    node.removeAttribute('tabindex')
    node.removeAttribute('role')
    node.removeAttribute('data-zoomable')
    const width = source.naturalWidth || source.clientWidth
    const height = source.naturalHeight || source.clientHeight
    return {
      node,
      ratio: height > 0 ? width / height : 16 / 9,
      sourceWidth: source.getBoundingClientRect().width,
    }
  }

  const svg = source.querySelector('svg')
  if (!svg) return null
  const sourceWidth = svg.getBoundingClientRect().width
  const node = svg.cloneNode(true) as SVGSVGElement
  isolateIds(node)
  // 这些图表只写了 viewBox、没写 width/height（靠 CSS 撑开），所以比例只能从
  // viewBox 读；读不到就退回一个不至于把布局撑坏的默认值。
  const viewBox = (node.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  const ratio = viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0 ? viewBox[2] / viewBox[3] : 16 / 9
  node.setAttribute('width', '100%')
  node.setAttribute('height', '100%')
  node.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  return { node, ratio, sourceWidth }
}

/**
 * 克隆出的 SVG 会把 <defs> 里的 id 一并带进文档，和原图形成重复 id。浏览器解析
 * url(#x) 时取文档序里的第一个，也就是原图的定义——画面碰巧是对的，但浮层里的
 * 箭头实际依赖另一棵子树继续存在。把克隆体的 id 连同引用一起改名，切断这个耦合。
 */
function isolateIds(root: SVGSVGElement) {
  const renamed = new Map<string, string>()
  root.querySelectorAll<SVGElement>('[id]').forEach((el) => {
    if (!el.id || renamed.has(el.id)) return
    const next = `lightbox-${el.id}`
    renamed.set(el.id, next)
    el.id = next
  })
  if (!renamed.size) return

  const nodes: Element[] = [root, ...Array.from(root.querySelectorAll('*'))]
  nodes.forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      // 两种引用写法：属性值里的 url(#id)，以及 <use href="#id">。
      const next = attr.value.startsWith('#') && renamed.has(attr.value.slice(1))
        ? `#${renamed.get(attr.value.slice(1))}`
        : attr.value.replace(
          /url\(\s*#([^)\s]+)\s*\)/g,
          (match, id: string) => (renamed.has(id) ? `url(#${renamed.get(id)})` : match),
        )
      if (next !== attr.value) el.setAttribute(attr.name, next)
    })
  })
}
