import { useEffect, useRef } from 'react'

/**
 * Markdown 正文里的复制按钮由构建脚本生成，这里用事件委托接管交互。
 * 按钮文案由 CSS 根据当前语言和 data-done 状态显示。
 */
export function useCodeCopy() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const timers = new Set<number>()
    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-copy]')
      if (!button) return
      const code = button.closest('.code-block')?.querySelector('pre')
      void navigator.clipboard.writeText(code?.innerText ?? '')
      button.dataset.done = ''
      const timer = window.setTimeout(() => {
        delete button.dataset.done
        timers.delete(timer)
      }, 1800)
      timers.add(timer)
    }

    root.addEventListener('click', onClick)
    return () => {
      root.removeEventListener('click', onClick)
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  return ref
}
