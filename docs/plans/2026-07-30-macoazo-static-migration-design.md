# MacOazo 静态站迁移设计

日期：2026-07-30
目标仓库：`/Users/lichunfei/Desktop/macoazo-blog`（`LeelooDev/macoazo-blog`，将改名为 `LeelooDev.github.io`）
内容来源：`/Users/lichunfei/Git/dev-notes`（**全程只读，不做任何修改**）

## 一、背景与目标

把 `dev-notes` 的三段式架构（React 前台 + React 后台 + Go API + PostgreSQL + Railway + Vercel）
收敛成一个零成本、零运维的纯静态站，托管在 GitHub Pages 上。

保留：现有视觉设计、全部页面、中英切换、明暗主题、前端搜索、Markdown / 代码高亮 / 内联 SVG 图表。

放弃：在线后台编辑、数据库草稿与发布状态、用户权限与审计日志、AI 数字分身。

## 二、已确认的决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 站点地址 | 仓库改名为 `LeelooDev.github.io`，走用户站根路径 | 现有 `/posts/...` 路由与 `/images/...` 路径原样保留，无需 base / basename 前缀 |
| AI 数字分身 | **彻底移除代码**，不是关开关 | 仓库将公开，保留指向已停用后端的聊天代码只是噪音 |
| 渲染策略 | 完整预渲染 SSG（`renderToString` 直出正文） | 搜索引擎、分享预览、首屏、禁用 JS 可读性都最好；数据已是构建时同步模块，无异步预填问题 |
| 内容基准 | 接受 2026-07-07 快照 | Docker 未运行、无 `.env`、无本地库、Railway 已 404，线上导出不可行 |
| 字体 | 自托管进 `public/fonts/` | 避免国内访问 `fonts.googleapis.com` 慢或不通导致的字体闪烁 |
| 文章英文版 | 界面双语保留，文章正文暂只有中文 | 源数据里 `title_en` / `content_en` 本就是空；数据层预留 `<slug>.en.md` 可选文件，以后按篇补 |

## 三、内容来源核定

调查结论（与最初假设有出入，以此处为准）：

- **文章正文以 `src/content/posts/*.md` 的 12 篇为准。**
  `services/api/migrations/004_import_legacy_posts.sql` 只有 10 篇，缺
  `rag-personal-knowledge-base` 与 `ios-to-ai-api-development`（git `c9efd8b` 后补），
  是更早的快照。Markdown 正文里已含内联 SVG 图表（如 `enterprise-ai-agent-02.md` 有 4 处）。
- **简历 / 站点设置 / `/now` 页数据从迁移 SQL 提取**：
  `005_profile.sql`、`006_update_resume_profile.sql`（中文简历）、
  `008_profile_svg_covers_and_english.sql`（英文简历）、
  `009_about_page_resume.sql`、`010_bilingual_posts_and_assistant.sql`（`/now` 页 + 双语字段）。
- **图片**：`src/assets/`（32 个）+ `assets/`（12 个），合计约 1.4M。
- 2026-07-07 之后经后台修改的内容没有离线副本，已确认接受这一缺口。

## 四、架构：构建时内容层

不再有运行时 API。原来三个 HTTP 请求返回的数据，变成构建时生成的 TypeScript 模块，
`lib.ts` 的三个 hook 由异步改同步，**但返回值形状不变**，因此页面组件零改动。

```
content/                      日常唯一要碰的目录
├── posts/*.md                12 篇，可选 <slug>.en.md
├── profile.zh.json
├── profile.en.json
└── settings.json
        │
        ▼
scripts/build-content.mjs     解析 frontmatter，拷贝图片
        │
        ▼
src/content.ts                Post[] / Profile / SiteSettings 字面量（gitignore）
        │
        ▼
src/lib.ts                    usePosts() → { data, isLoading: false, error: null }
        │
        ▼
页面组件                       零改动
```

内容转换细节：

- frontmatter `cover: ../../assets/xxx.jpg` → `/images/xxx.jpg`，图片同步拷入 `public/images/`
- frontmatter `date` → `publishedAt`；`id` 用 `slug` 顶替
- `@macoazo/api-client` 的类型定义原样拷成本地 `src/types.ts`，剥掉 `createApiClient` 与全部 admin 类型
- TanStack Query 从 `main.tsx` 整个移除

## 五、前端代码改动清单

### A. 原样拷贝，零改动（13 个文件）

`pages/` 全部 8 个（Home / Articles / Projects / ProjectDetail / Archive / Now / About / Post）、
`components/` 的 PostCard / ProjectCard / ProjectCover / Skeleton、`App.tsx`、`styles.css`（除删除段）。

### B. 精确改动（5 处）

| 文件 | 改动 |
|---|---|
| `lib.ts` | `usePosts` / `useProfile` / `useSiteSettings` 三个 hook 改同步读取 |
| `PostPage.tsx:2,64` | 全站唯一直连 API 处，改为 `posts.data.items.find(p => p.slug === slug)` |
| `SiteLayout.tsx` | 删 `:5` import 与 `:138` `<ChatWidget />`；`:19` 的 `localStorage` 加 `typeof window` 防护 |
| `i18n.tsx` | `:170` 加同样的 SSR 防护；删 `:125–139` 的 9 个 `chat*` 文案 |
| `main.tsx` | 移除 `QueryClientProvider`，拆成 `entry-client` / `entry-server` |

### C. 不迁移（AI 功能彻底移除）

`api.ts`、`ChatWidget.tsx` 整个文件、`styles.css:618–689`（**保留 `:58` 的 `@keyframes pulse`**，
`:151` 的导航状态点还在用）、`SiteSettings` 的 5 个 `assistant*` 字段、`AssistantMessage` 接口。

验收标准：迁移后全仓库搜 `assistant` 应为零结果。

### D. 新增

`src/types.ts`、`src/content.ts`（生成物，gitignore）、`src/entry-server.tsx`、`src/entry-client.tsx`。

### E. 公开仓库安全检查

内容落地后扫描：API key 形态串、密码、内网地址，以及简历 JSON 里的手机号 / 私人邮箱是否愿意公开。
`.env.example`、`docker-compose.yml`、`services/`、`apps/admin` 一概不迁移。

## 六、预渲染与构建产物

不引入 SSG 框架，走 Vite 官方 SSR 三步流程：

```bash
node scripts/build-content.mjs        # 内容 → src/content.ts，图片 → public/images/
vite build                            # 客户端产物
vite build --ssr src/entry-server.tsx # SSR 产物
node scripts/prerender.mjs            # StaticRouter + renderToString → 每个路由一个 HTML
```

**路由清单**：`/`、`/articles`、`/projects`、`/archive`、`/now`、`/about` 6 个固定页
+ `/posts/<slug>` × 12 + `/projects/<index>` × N（按 `profile.projects` 长度）+ `404.html`。

**新增逻辑：meta 标签注入。** 现在 `SiteLayout` 靠 `useEffect` 设 `document.title`，SSR 不执行。
prerender 脚本按路由表算好 `<title>`、`<meta description>`、`og:title/description/image` 写进 HTML。

**hydration 一致性（两个必须处理的坑）**：

- **语言**：SSR 固定按 `zh` 渲染；客户端首帧也必须是 `zh`，再在 `useEffect` 里读 `localStorage` 切 `en`。
  首帧直接读 `localStorage` 会 hydrate mismatch。
- **主题**：在 `<head>` 内联一小段脚本，在 hydrate 前设好 `body.dataset.theme`。
  主题只影响 CSS 变量不影响 DOM 结构，这样既不 mismatch 也没有明暗闪烁。

**顺带产出**：`rss.xml`、`sitemap.xml`、`robots.txt`（按 `settings.allowIndexing`）、
`.nojekyll`（必须有，否则 GitHub Pages 走 Jekyll 会忽略 `_` 开头的文件）。

## 七、仓库结构与部署

```
macoazo-blog/                    改名后即 LeelooDev.github.io
├── content/
│   ├── posts/*.md
│   ├── profile.zh.json
│   ├── profile.en.json
│   └── settings.json
├── public/
│   ├── images/
│   └── fonts/
├── src/                         从 apps/web/src 拷贝 + 第五节的 5 处改动
├── scripts/
│   ├── build-content.mjs
│   └── prerender.mjs
├── docs/plans/
├── .github/workflows/pages.yml
├── vite.config.ts
├── package.json
└── tsconfig.json
```

**GitHub Actions**：push 到 `master` → `pnpm install` → `pnpm build` → `actions/deploy-pages`。
使用官方 `actions/configure-pages` + `upload-pages-artifact`，不需要 `gh-pages` 分支。

**需要在 GitHub 网页上手动完成的三件事**：

1. Settings → 仓库改名为 `LeelooDev.github.io`
2. Settings → Pages → Source 改为 **GitHub Actions**
3. 本地执行 `git remote set-url origin https://github.com/LeelooDev/LeelooDev.github.io.git`

**日常发布流程**：往 `content/posts/` 丢一个 `.md` → `git commit` → `git push` → 自动上线。

## 八、执行顺序

| # | 步骤 | 验证方式 |
|---|---|---|
| 1 | 脚手架：package.json / vite / tsconfig / .gitignore | `pnpm install` 通过 |
| 2 | 内容提取：12 篇 md + SQL→JSON + 图片 / 字体 | JSON schema 对得上 `types.ts` |
| 3 | 代码拷贝 + 5 处改动 + 删 AI | `tsc -b` 零错误、搜 `assistant` 零结果 |
| 4 | 构建管道：build-content / prerender / rss / sitemap | 产物里每篇文章都有独立 HTML 且含正文 |
| 5 | 本地验证 | `vite preview` 逐页对比、禁用 JS 仍可读 |
| 6 | Actions + 上线 | 线上逐页回归 |

## 九、会失去的能力

- 在线后台编辑（改为改 Markdown + git push）
- 数据库草稿 / 发布状态（改为文件在不在 `content/posts/` 里）
- 用户权限与审计日志
- AI 数字分身
- 文章发布后立即生效（改为等待 Actions 构建，约两分钟）
