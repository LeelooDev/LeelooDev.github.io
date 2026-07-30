// 需要预渲染成独立 HTML 的全部路由。App.tsx 里的路由表是运行时的，
// 这里是构建时的展开版——两者必须保持同步，新增页面时一并补上。
import { POSTS, PROFILE } from './content'

const STATIC_ROUTES = ['/', '/articles', '/projects', '/archive', '/now', '/about']

export function allRoutes(): string[] {
  return [
    ...STATIC_ROUTES,
    ...POSTS.zh.items.map((post) => `/posts/${post.slug}`),
    ...PROFILE.zh.projects.map((_, index) => `/projects/${index}`),
  ]
}
