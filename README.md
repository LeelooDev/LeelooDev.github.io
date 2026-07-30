# MacOazo

个人博客，纯静态站，托管在 GitHub Pages 上。React 19 + Vite 7，构建时把 Markdown 预渲染成
带正文的 HTML，所以直接打开文章链接、搜索引擎抓取和分享预览都拿得到完整内容。

## 发布一篇文章

1. 在 `content/posts/` 下新建 `<slug>.md`
2. `git commit && git push`
3. GitHub Actions 自动构建并发布，约两分钟后上线

没有数据库，没有后台，没有需要维护的服务。文件名就是文章地址：
`content/posts/my-post.md` → `/posts/my-post`。

### frontmatter

```yaml
---
title: 文章标题
date: 2026-07-30T10:00:00
category: code          # design / code / life / notes
tags: [React, Vite]
cover: /images/my-cover.jpg
coverAlt: 封面图的文字描述
excerpt: 列表页和分享预览里显示的摘要。
draft: false            # 选填，true 则不进构建
---
```

封面图放 `public/images/`，正文里可以直接写内联 SVG 画图表（构建时会做 sanitize）。
想给某篇文章加英文版，就在旁边放一个 `<slug>.en.md`；没写的字段自动回退中文。

## 改简历和站点信息

- `content/profile.zh.json` / `content/profile.en.json` — 关于页、项目页、`/now` 页的数据
- `content/settings.json` — 站点名、描述、联系邮箱、每页篇数、是否允许搜索引擎索引

英文简历只需要写你想覆盖的字段，其余自动回退中文。

## 本地开发

要求 Node.js 22+、pnpm 10+。

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm build     # 完整构建 + 预渲染
pnpm preview   # 预览构建产物
```

`pnpm preview` 下直接输入 `/posts/xxx`（不带尾斜杠）会走 SPA 回退显示首页，这是 Vite 预览
服务器的行为；GitHub Pages 上会正确跳到 `/posts/xxx/`。要在本地核对预渲染结果，请带尾斜杠。

## 构建管道

```
content/*.md + *.json
        │  scripts/build-content.mjs（解析 frontmatter，Markdown → HTML，抽目录）
        ▼
src/content.ts ──► vite build（客户端）
        │          vite build --ssr（服务端）
        ▼
scripts/prerender.mjs ──► dist/：每个路由一个 HTML + rss.xml / sitemap.xml / robots.txt
```

正文的 Markdown 在构建时就编译成 HTML，浏览器端不再需要 Markdown 解析器和代码高亮库。
文章目录和标题锚点也在构建时一起生成，保证两边必然对得上。
