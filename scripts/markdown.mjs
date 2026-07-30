// 构建时的 Markdown → HTML 管道。静态站在运行时不需要 Markdown 解析器：
// 正文在这里编译成 HTML 字符串，浏览器端直接用，省掉 react-markdown / rehype / highlight.js。
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { toString } from 'hast-util-to-string'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

// 正文是手写 Markdown，里面嵌了内联 SVG 图表。rehype-raw 把原始 HTML 变成节点，
// rehype-sanitize 再剥掉危险内容（script、事件属性、坏协议），同时放行图表依赖的
// SVG 元素与展示属性。
const SVG_TAGS = [
  'svg', 'g', 'path', 'rect', 'line', 'circle', 'ellipse', 'polyline',
  'polygon', 'text', 'tspan', 'defs', 'marker', 'use', 'symbol', 'title', 'desc',
]
const SVG_ATTRS = [
  'viewBox', 'xmlns', 'width', 'height', 'fill', 'fillOpacity', 'fillRule',
  'stroke', 'strokeWidth', 'strokeDasharray', 'strokeLinecap', 'strokeLinejoin',
  'strokeOpacity', 'opacity', 'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy', 'transform', 'textAnchor',
  'fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'markerEnd', 'markerStart',
  'markerMid', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient',
  'preserveAspectRatio', 'role', 'ariaLabel',
]

const contentSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...SVG_TAGS, 'figure', 'figcaption'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'id', ...SVG_ATTRS],
    // 表格对齐由 remark-gfm 写成内联 style，默认 schema 会剥掉 style，这里放行 align。
    th: [...(defaultSchema.attributes?.th ?? []), 'align'],
    td: [...(defaultSchema.attributes?.td ?? []), 'align'],
  },
}

/** 与 src/lib.ts 的 slugifyHeading 保持一致——文章目录靠它对上锚点。 */
export function slugifyHeading(text) {
  return text.trim().toLowerCase().replace(/[`*_[\]()]/g, '').replace(/\s+/g, '-')
}

/**
 * 给 h2 加锚点 id，同时把目录收集出来。目录在构建时生成而不是在浏览器里
 * 重新解析 Markdown——这样 id 和目录项必然对得上，客户端也不必带 Markdown 原文。
 */
function rehypeHeadingIds(toc) {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'h2') return
      const label = toString(node)
      const id = slugifyHeading(label)
      node.properties = { ...node.properties, id }
      toc.push({ id, label })
    })
  }
}

const COPY_LABELS = { zh: '复制', en: 'Copy' }
const COPIED_LABELS = { zh: '已复制 ✓', en: 'Copied ✓' }

/**
 * 把裸 <pre> 包成带语言标签和复制按钮的代码块外壳，复刻原来 PostPage 里的 CodeBlock 组件。
 *
 * 按钮文字刻意留空：中英两份文案放在 data 属性上，由 styles.css 的 ::after + attr() 显示。
 * 不用 JS 写 textContent，是因为正文整块是 dangerouslySetInnerHTML——React 重渲染时会重设
 * innerHTML，JS 写进去的文字会被冲掉（切换语言时实测被替换两次）。交给 CSS 就不必和
 * 重渲染时序博弈。
 */
function rehypeCodeBlock() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) return
      if (parent.type === 'element' && parent.properties?.className?.includes?.('code-block')) return

      const code = node.children.find((child) => child.tagName === 'code')
      const classes = code?.properties?.className ?? []
      const language = classes.find((name) => String(name).startsWith('language-'))?.slice(9) ?? ''

      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['code-block'] },
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['code-block-head'] },
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['code-dots'] },
                children: [1, 2, 3].map(() => ({ type: 'element', tagName: 'i', properties: {}, children: [] })),
              },
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['code-lang'] },
                children: [{ type: 'text', value: language || 'code' }],
              },
              {
                type: 'element',
                tagName: 'button',
                properties: {
                  className: ['code-copy'],
                  dataCopy: '',
                  dataLabelZh: COPY_LABELS.zh,
                  dataLabelEn: COPY_LABELS.en,
                  dataDoneZh: COPIED_LABELS.zh,
                  dataDoneEn: COPIED_LABELS.en,
                },
                children: [],
              },
            ],
          },
          node,
        ],
      }
    })
  }
}

/** 编译一篇正文，返回 HTML 和目录。 */
export function renderMarkdown(markdown) {
  const toc = []
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSanitize, contentSchema)
      .use(rehypeHighlight, { detect: false })
      .use(rehypeHeadingIds, toc)
      .use(rehypeCodeBlock)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(markdown),
  )
  return { html, toc }
}
