---
title: React 全栈技术选型 2026：一套代码，覆盖 Web、桌面和移动端
date: 2026-08-02T10:00:00
category: code
tags: [React, Next.js, TypeScript, Tauri, React Native, 技术选型]
cover: /images/react-fullstack-cover.jpg
coverAlt: 动画风格插画：斑驳的石台上一只三花猫蜷着身子熟睡，身旁摆着陶土花盆和青蓝色陶罐，背后爬满绿叶
excerpt: 从 Next.js 到 Tauri 再到 Expo，把一份技术选型清单拆成九张架构图：每层为什么这么选、什么时候该偏离默认答案、以及 shadcn/ui、Appica UI、React Bits 这三层 UI 到底谁管什么。
dek: 选型的难点从来不是「哪个库更好」，而是「哪些东西必须一起选」。
---

技术选型清单在网上随处可见，但它们大多回答错了问题。列出十五个库的名字，不等于告诉你这些库为什么能拼在一起，也不等于告诉你哪一天该把其中某一个换掉。

真正让人卡住的，是那些**成组出现的决策**：选了 Next.js，服务端边界就跟着定了；选了 Tauri，前端产物的形态就跟着定了；选了 monorepo，构建缓存和依赖方向就跟着定了。单看每个决定都合理，拼起来却互相打架——这才是选型的实际难度。

所以下面这篇，我按「层」来写，每层配一张图，说清楚这一层的接口是什么、和上下游怎么咬合、以及什么情况下应该换掉它。

## 先看全景

这是我现在做新产品的默认形状：三个交付面共用一套核心包，往下收敛到一个服务端。

<figure class="diagram">
<svg viewBox="0 0 800 476" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="React 全栈技术栈的分层结构：Web、桌面、移动三端共享 packages 层，向下收敛到服务端与数据库">
<defs>
<marker id="rf-a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<text x="56" y="22" font-size="11" fill="#6b6e76" font-weight="600">交付面 · apps/</text>
<g fill="#25262b">
<rect x="56" y="34" width="200" height="60" rx="10"/>
<rect x="300" y="34" width="200" height="60" rx="10"/>
<rect x="544" y="34" width="200" height="60" rx="10"/>
</g>
<text x="156" y="60" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="600">Web</text>
<text x="156" y="80" text-anchor="middle" font-size="12" fill="#c4c6cd">Next.js · React 19</text>
<text x="400" y="60" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="600">Desktop</text>
<text x="400" y="80" text-anchor="middle" font-size="12" fill="#c4c6cd">Tauri 2 · Vite</text>
<text x="644" y="60" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="600">Mobile</text>
<text x="644" y="80" text-anchor="middle" font-size="12" fill="#c4c6cd">React Native · Expo</text>
<line x1="156" y1="94" x2="156" y2="142" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a1)"/>
<line x1="400" y1="94" x2="400" y2="142" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a1)"/>
<line x1="644" y1="94" x2="644" y2="142" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a1)"/>
<rect x="56" y="148" width="688" height="104" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="72" y="172" font-size="11" fill="#6b6e76" font-weight="600">共享层 · packages/　　一处修改，三端同时生效</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="72" y="184" width="152" height="52" rx="8"/>
<rect x="240" y="184" width="152" height="52" rx="8"/>
<rect x="408" y="184" width="152" height="52" rx="8"/>
<rect x="576" y="184" width="152" height="52" rx="8"/>
</g>
<text x="148" y="206" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">types</text>
<text x="148" y="224" text-anchor="middle" font-size="11" fill="#6b6e76">领域模型</text>
<text x="316" y="206" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">schema</text>
<text x="316" y="224" text-anchor="middle" font-size="11" fill="#6b6e76">Zod 校验</text>
<text x="484" y="206" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">api</text>
<text x="484" y="224" text-anchor="middle" font-size="11" fill="#6b6e76">调用客户端</text>
<text x="652" y="206" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">core</text>
<text x="652" y="224" text-anchor="middle" font-size="11" fill="#6b6e76">纯业务逻辑</text>
<line x1="400" y1="252" x2="400" y2="286" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a1)"/>
<rect x="56" y="292" width="688" height="62" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="72" y="304" width="200" height="38" rx="8"/>
<rect x="300" y="304" width="200" height="38" rx="8"/>
<rect x="528" y="304" width="200" height="38" rx="8"/>
</g>
<text x="172" y="328" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Server Actions</text>
<text x="400" y="328" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">tRPC（跨端调用）</text>
<text x="628" y="328" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Prisma ORM</text>
<line x1="400" y1="354" x2="400" y2="388" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a1)"/>
<rect x="250" y="394" width="300" height="46" rx="10" fill="#25262b"/>
<text x="400" y="422" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">PostgreSQL</text>
<text x="400" y="464" text-anchor="middle" font-size="12" fill="#6b6e76">桌面端和移动端不直连数据库，一律走 tRPC；只有 Web 能用 Server Actions 走近路</text>
</svg>
<figcaption>图 1：全景。三个交付面在 apps/ 下各自独立，共享的是类型、校验规则、API 客户端和纯业务逻辑——注意共享层里没有 UI 组件，原因见图 7。</figcaption>
</figure>

图里有个容易被忽略的细节：**Server Actions 和 tRPC 同时存在**。这不是冗余。Server Actions 只在 Next.js 进程内有效，桌面端和移动端根本调不到它，所以但凡一个功能三端都要用，它就必须以 tRPC 过程的形式存在。Web 端专属的表单提交、页面级 mutation，才用 Server Actions 省掉一层。

分不清这条线的项目，最后往往是把逻辑写进 Server Action，等做移动端时再抄一遍到 REST 接口里——两份实现从此开始漂移。

## 为什么是 Next.js

React 19 本身不是框架，你迟早要选一个把路由、数据获取、服务端渲染缝起来的东西。目前实际可选的就三个：Next.js、React Router v7（原 Remix）、Vite + 手工装配。

我默认选 Next.js，理由很实际：**Server Components 让「数据在服务端取好再渲染」变成默认写法**，而不是一个需要额外配置的高级功能。省掉的不只是加载态，还有一整套「客户端拿到组件后再发请求」造成的瀑布。

但有三种情况我不用它：

- **纯静态内容站**。你现在看的这个博客就是 Vite + 构建时预渲染，没有服务端，也不需要。上 Next.js 只是给静态文件套了一层不会被执行的运行时。
- **产物要塞进别的壳里**。Tauri、Electron、浏览器插件，需要的是一份能被 `file://` 加载的静态产物。Next.js 的 `output: 'export'` 能做到，但你会同时失去 Server Actions、中间件和路由处理器——框架的一半价值没了，不如直接用 Vite。
- **重交互的工具型应用**。图形编辑器、IDE、看板这类几乎没有服务端渲染收益的产品，SSR 带来的水合成本大于它省下的首屏时间。

React Router v7 是个体面的第二选择，尤其当你不想被 Vercel 的部署模型绑住的时候。它的数据 loader 模型比 Next.js 的更容易在脑子里模拟。

## UI 的三层：谁管什么

这是最容易搞乱的一层。shadcn/ui、Appica UI、React Bits 经常被并列推荐，但它们根本不是同类东西，混着用之前得先想清楚各自的位置。

<figure class="diagram">
<svg viewBox="0 0 800 402" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="UI 三层结构：React Bits 效果层、Appica UI 产品组件层、shadcn/ui 基础层，地基是 Tailwind 与 React">
<text x="56" y="22" font-size="11" fill="#6b6e76" font-weight="600">一个页面上的 UI，其实来自三个不同性质的层</text>
<rect x="56" y="32" width="688" height="72" rx="12" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.2"/>
<rect x="72" y="46" width="164" height="44" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="154" y="66" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">React Bits</text>
<text x="154" y="82" text-anchor="middle" font-size="11" fill="#6b6e76">效果层 · 可选</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="264" y="54" width="104" height="28" rx="6"/>
<rect x="380" y="54" width="104" height="28" rx="6"/>
<rect x="496" y="54" width="104" height="28" rx="6"/>
<rect x="612" y="54" width="104" height="28" rx="6"/>
</g>
<text x="316" y="73" text-anchor="middle" font-size="11" fill="#6b6e76">背景动效</text>
<text x="432" y="73" text-anchor="middle" font-size="11" fill="#6b6e76">文字动画</text>
<text x="548" y="73" text-anchor="middle" font-size="11" fill="#6b6e76">滚动揭示</text>
<text x="664" y="73" text-anchor="middle" font-size="11" fill="#6b6e76">光标效果</text>
<rect x="56" y="116" width="688" height="72" rx="12" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.2"/>
<rect x="72" y="130" width="164" height="44" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="154" y="150" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Appica UI</text>
<text x="154" y="166" text-anchor="middle" font-size="11" fill="#6b6e76">产品组件层 · 补位</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="264" y="138" width="104" height="28" rx="6"/>
<rect x="380" y="138" width="104" height="28" rx="6"/>
<rect x="496" y="138" width="104" height="28" rx="6"/>
<rect x="612" y="138" width="104" height="28" rx="6"/>
</g>
<text x="316" y="157" text-anchor="middle" font-size="11" fill="#6b6e76">输入控件</text>
<text x="432" y="157" text-anchor="middle" font-size="11" fill="#6b6e76">数据展示</text>
<text x="548" y="157" text-anchor="middle" font-size="11" fill="#6b6e76">导航浮层</text>
<text x="664" y="157" text-anchor="middle" font-size="11" fill="#6b6e76">状态反馈</text>
<rect x="56" y="200" width="688" height="72" rx="12" fill="#25262b"/>
<rect x="72" y="214" width="164" height="44" rx="8" fill="#ffffff"/>
<text x="154" y="234" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">shadcn/ui</text>
<text x="154" y="250" text-anchor="middle" font-size="11" fill="#6b6e76">基础层 · 必选</text>
<g fill="#25262b" stroke="#6b6e76" stroke-width="1.2">
<rect x="264" y="222" width="104" height="28" rx="6"/>
<rect x="380" y="222" width="104" height="28" rx="6"/>
<rect x="496" y="222" width="104" height="28" rx="6"/>
<rect x="612" y="222" width="104" height="28" rx="6"/>
</g>
<text x="316" y="241" text-anchor="middle" font-size="11" fill="#ffffff">Button</text>
<text x="432" y="241" text-anchor="middle" font-size="11" fill="#ffffff">Dialog</text>
<text x="548" y="241" text-anchor="middle" font-size="11" fill="#ffffff">Form</text>
<text x="664" y="241" text-anchor="middle" font-size="11" fill="#ffffff">Card</text>
<rect x="56" y="284" width="688" height="56" rx="12" fill="#f4f5f7" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="308" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Tailwind CSS · React 19 · TypeScript</text>
<text x="400" y="327" text-anchor="middle" font-size="11" fill="#6b6e76">三层共用同一套设计 token，否则叠起来就是三种审美打架</text>
<text x="400" y="368" text-anchor="middle" font-size="12" fill="#6b6e76">向上越轻量、越可替换；向下越稳定、越不该动</text>
<text x="400" y="388" text-anchor="middle" font-size="12" fill="#6b6e76">删掉最上面两层，产品仍然完整可用——这是分层是否正确的判据</text>
</svg>
<figcaption>图 2：UI 三层。shadcn/ui 是地基不可替换，Appica UI 补齐它没有的产品级控件，React Bits 只出现在营销页和少数强调时刻。</figcaption>
</figure>

**shadcn/ui 严格说不是组件库**，它是一批可以复制进你仓库的组件源码。这个区别很重要：升级不会有 breaking change，因为代码是你的；但反过来，修 bug 也没人替你修。它解决的是「组件库的定制永远差最后一公里」这个老问题——想改就直接改文件。

**Appica UI** 是常规意义上的组件库：免费开源，六十多个组件，覆盖输入控件、数据展示、导航浮层和状态反馈四类，走 npm 安装 + tree-shaking，带 TypeScript、键盘导航、RTL 和一套配套 Figma 库。它的用途是补位——shadcn 的组件集合偏基础，日期范围选择、复杂表格、命令面板这类东西你要么自己写，要么从这里拿。

**React Bits** 是另一个维度的东西：一百四十多个动画组件，文字特效、背景、滚动交互为主，每个组件提供 JS-CSS、JS-TW、TS-CSS、TS-TW 四种变体，可以用 shadcn CLI 或 jsrepo 装，也可以直接复制。协议是 MIT + Commons Clause（个人和商业项目可用，但不能拿去转售）。

叠这三层，有两条我踩过坑才总结出来的规则：

1. **效果层不能进产品内页**。落地页、定价页、空状态可以用；一旦进了每天要看八小时的工作界面，粒子背景和光标特效就从「有质感」变成「干扰」。
2. **同一类组件只能有一个来源**。Button 用 shadcn 就全站用 shadcn，不要因为 Appica 的某个 Button 变体更好看就混着用——两套焦点样式、两套禁用态、两套暗色适配，维护成本比省下的时间高得多。

至于 Ant Design：它没有出现在上图里，但不代表它不该用。做 ERP、CRM、审批流这类**表格和表单占了八成界面**的系统，Ant Design Pro 附带的 ProTable、ProForm 能省掉几周工作量，而且它的表格在列冻结、可编辑单元格、大数据量这些细节上比自己攒的靠谱得多。判断标准很简单：产品的价值主要来自数据密度还是来自体验设计？前者选 Ant Design，后者选 shadcn 这套。

## 后端：两种规模，两种形状

后端选型的分水岭不是流量，是**团队和客户端数量**。

### 小中型：不要过早拆服务

<figure class="diagram">
<svg viewBox="0 0 800 322" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="小中型项目的请求链路：浏览器经 Next.js Server Action 调用 Prisma 访问 PostgreSQL">
<defs>
<marker id="rf-a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
<marker id="rf-a2d" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<text x="48" y="24" font-size="11" fill="#6b6e76" font-weight="600">请求链路 · 没有独立 API 层</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="48" y="42" width="150" height="64" rx="10"/>
<rect x="416" y="42" width="150" height="64" rx="10"/>
</g>
<rect x="232" y="42" width="150" height="64" rx="10" fill="#25262b"/>
<rect x="600" y="42" width="152" height="64" rx="10" fill="#25262b"/>
<text x="123" y="70" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">浏览器</text>
<text x="123" y="88" text-anchor="middle" font-size="11" fill="#6b6e76">React 19</text>
<text x="307" y="70" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">Server Action</text>
<text x="307" y="88" text-anchor="middle" font-size="11" fill="#c4c6cd">Next.js 进程内</text>
<text x="491" y="70" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Prisma</text>
<text x="491" y="88" text-anchor="middle" font-size="11" fill="#6b6e76">类型安全查询</text>
<text x="676" y="70" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">PostgreSQL</text>
<text x="676" y="88" text-anchor="middle" font-size="11" fill="#c4c6cd">Supabase / Neon</text>
<line x1="198" y1="66" x2="228" y2="66" stroke="#25262b" stroke-width="1.8" marker-end="url(#rf-a2)"/>
<line x1="382" y1="66" x2="412" y2="66" stroke="#25262b" stroke-width="1.8" marker-end="url(#rf-a2)"/>
<line x1="566" y1="66" x2="596" y2="66" stroke="#25262b" stroke-width="1.8" marker-end="url(#rf-a2)"/>
<line x1="596" y1="92" x2="566" y2="92" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#rf-a2d)"/>
<line x1="412" y1="92" x2="382" y2="92" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#rf-a2d)"/>
<line x1="228" y1="92" x2="198" y2="92" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#rf-a2d)"/>
<text x="400" y="132" text-anchor="middle" font-size="11" fill="#6b6e76">实线 = 调用（函数调用，不是 HTTP 请求）　虚线 = 序列化后的返回值</text>
<line x1="676" y1="106" x2="676" y2="164" stroke="#c4c6cd" stroke-width="1.5"/>
<line x1="676" y1="164" x2="196" y2="164" stroke="#c4c6cd" stroke-width="1.5"/>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="120" y="180" width="152" height="52" rx="8"/>
<rect x="324" y="180" width="152" height="52" rx="8"/>
<rect x="528" y="180" width="152" height="52" rx="8"/>
</g>
<line x1="196" y1="164" x2="196" y2="176" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a2d)"/>
<line x1="400" y1="164" x2="400" y2="176" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a2d)"/>
<line x1="604" y1="164" x2="604" y2="176" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a2d)"/>
<text x="196" y="202" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Auth</text>
<text x="196" y="220" text-anchor="middle" font-size="11" fill="#6b6e76">OAuth · 邮箱 · RLS</text>
<text x="400" y="202" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Storage</text>
<text x="400" y="220" text-anchor="middle" font-size="11" fill="#6b6e76">文件与图片</text>
<text x="604" y="202" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Realtime</text>
<text x="604" y="220" text-anchor="middle" font-size="11" fill="#6b6e76">订阅表变更</text>
<text x="400" y="260" text-anchor="middle" font-size="11" fill="#6b6e76">这三样是数据库自带的能力，不是额外的服务——省掉的是三个你本来要自己写的模块</text>
<rect x="120" y="278" width="560" height="34" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="300" text-anchor="middle" font-size="12" fill="#25262b">整条链路一个部署单元、一次发布、一份类型定义</text>
</svg>
<figcaption>图 3：小中型项目的形状。Server Action 是一次函数调用而非 HTTP 请求，参数和返回值的类型天然对齐，不需要维护接口文档。</figcaption>
</figure>

这个形状的核心优势是**没有接口契约需要维护**。Server Action 的参数类型就是前端传参的类型，改一个字段名，TypeScript 立刻在两端同时报错。传统前后端分离里那套「改接口 → 同步文档 → 前端跟着改 → 联调发现对不上」的循环，在这里不存在。

代价也很明确：这套东西和 Next.js 绑死了。哪天要做移动端，Server Action 一个都用不上。所以图 1 里我把 tRPC 也画进去了——它是同一份服务端逻辑的另一个出口，付出的成本只是多一层薄薄的过程定义。

Supabase 在这套里的位置常被误解。它不是「后端即服务」意义上的黑盒，本质就是一个 **PostgreSQL 加上几个官方模块**。你依然用 Prisma 写迁移、写查询，只是不用自己实现登录、文件上传和实时订阅。这意味着迁移成本很低：真要搬走，把数据库 dump 出来接到 Neon 或自建实例上，需要重写的只有认证那一小块。

### 中大型：什么时候必须拆

<figure class="diagram">
<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="中大型项目架构：Web 与移动端经 Next.js BFF 与 NestJS API，下接 PostgreSQL、Redis 与后台任务">
<defs>
<marker id="rf-a3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="120" y="28" width="200" height="52" rx="10"/>
<rect x="480" y="28" width="200" height="52" rx="10"/>
</g>
<text x="220" y="52" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Web · Desktop</text>
<text x="220" y="70" text-anchor="middle" font-size="11" fill="#6b6e76">Next.js · Tauri</text>
<text x="580" y="52" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Mobile</text>
<text x="580" y="70" text-anchor="middle" font-size="11" fill="#6b6e76">Expo</text>
<line x1="220" y1="80" x2="300" y2="112" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a3)"/>
<line x1="580" y1="80" x2="500" y2="112" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a3)"/>
<rect x="240" y="118" width="320" height="56" rx="10" fill="#25262b"/>
<text x="400" y="142" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">BFF 层 · tRPC Router</text>
<text x="400" y="160" text-anchor="middle" font-size="11" fill="#c4c6cd">聚合、裁剪、鉴权透传　不放业务规则</text>
<line x1="400" y1="174" x2="400" y2="208" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a3)"/>
<rect x="152" y="214" width="496" height="76" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="236" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">NestJS API · 业务规则的唯一归属地</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="172" y="246" width="108" height="30" rx="6"/>
<rect x="292" y="246" width="108" height="30" rx="6"/>
<rect x="412" y="246" width="108" height="30" rx="6"/>
<rect x="532" y="246" width="96" height="30" rx="6"/>
</g>
<text x="226" y="266" text-anchor="middle" font-size="11" fill="#6b6e76">领域模块</text>
<text x="346" y="266" text-anchor="middle" font-size="11" fill="#6b6e76">权限策略</text>
<text x="466" y="266" text-anchor="middle" font-size="11" fill="#6b6e76">事务边界</text>
<text x="580" y="266" text-anchor="middle" font-size="11" fill="#6b6e76">审计日志</text>
<line x1="280" y1="290" x2="240" y2="322" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a3)"/>
<line x1="400" y1="290" x2="400" y2="322" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a3)"/>
<line x1="520" y1="290" x2="560" y2="322" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a3)"/>
<g fill="#25262b">
<rect x="120" y="328" width="200" height="48" rx="10"/>
<rect x="340" y="328" width="120" height="48" rx="10"/>
<rect x="480" y="328" width="200" height="48" rx="10"/>
</g>
<text x="220" y="349" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">PostgreSQL</text>
<text x="220" y="366" text-anchor="middle" font-size="11" fill="#c4c6cd">主数据 · 事务</text>
<text x="400" y="349" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Redis</text>
<text x="400" y="366" text-anchor="middle" font-size="11" fill="#c4c6cd">缓存 · 队列</text>
<text x="580" y="349" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Worker</text>
<text x="580" y="366" text-anchor="middle" font-size="11" fill="#c4c6cd">异步任务 · 定时作业</text>
</svg>
<figcaption>图 4：中大型架构。关键约束是业务规则只能住在 NestJS 里，BFF 层负责聚合与裁剪，一旦规则开始往 BFF 渗透，这套分层就白拆了。</figcaption>
</figure>

什么时候该从图 3 走到图 4？我的判断信号有三个，满足任意一个就该拆：

- **第二个客户端出现了**，而且它需要的数据形状和 Web 端明显不同。
- **有非 HTTP 触发的工作**：定时任务、消息消费、长耗时的批处理。硬塞进 serverless 函数里迟早被超时限制卡住。
- **团队超过八到十人**，多人同时改一个 Next.js 仓库开始频繁冲突。

反过来，如果只是「感觉以后会大」，那就先别拆。从图 3 演进到图 4 的成本远低于一开始就维护两套部署、两套 CI、两套日志的成本。

## 状态：先分清它属于谁

绝大多数「状态管理很混乱」的项目，问题不在于选错了库，而在于**把服务端数据塞进了客户端全局 store**。

<figure class="diagram">
<svg viewBox="0 0 800 356" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="服务端状态与客户端状态的分工：TanStack Query 与 Zustand 的边界，表单由 React Hook Form 与 Zod 承担">
<text x="400" y="24" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">先问一句：这份数据在服务器上还有一份权威副本吗？</text>
<line x1="400" y1="38" x2="400" y2="252" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 5"/>
<rect x="48" y="44" width="320" height="208" rx="12" fill="#25262b"/>
<text x="208" y="72" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="600">有 → 服务端状态</text>
<text x="208" y="92" text-anchor="middle" font-size="12" fill="#c4c6cd">TanStack Query</text>
<g fill="#25262b" stroke="#6b6e76" stroke-width="1.2">
<rect x="72" y="106" width="272" height="30" rx="6"/>
<rect x="72" y="142" width="272" height="30" rx="6"/>
<rect x="72" y="178" width="272" height="30" rx="6"/>
<rect x="72" y="214" width="272" height="30" rx="6"/>
</g>
<text x="208" y="126" text-anchor="middle" font-size="12" fill="#ffffff">列表、详情、用户资料</text>
<text x="208" y="162" text-anchor="middle" font-size="12" fill="#ffffff">会过期 · 需要重新拉取</text>
<text x="208" y="198" text-anchor="middle" font-size="12" fill="#ffffff">mutation 后按 key 失效</text>
<text x="208" y="234" text-anchor="middle" font-size="12" fill="#ffffff">加载态和错误态由库提供</text>
<rect x="432" y="44" width="320" height="208" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="592" y="72" text-anchor="middle" font-size="14" fill="#25262b" font-weight="600">没有 → 客户端状态</text>
<text x="592" y="92" text-anchor="middle" font-size="12" fill="#6b6e76">Zustand</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="456" y="106" width="272" height="30" rx="6"/>
<rect x="456" y="142" width="272" height="30" rx="6"/>
<rect x="456" y="178" width="272" height="30" rx="6"/>
<rect x="456" y="214" width="272" height="30" rx="6"/>
</g>
<text x="592" y="126" text-anchor="middle" font-size="12" fill="#25262b">侧边栏开合、当前选中项</text>
<text x="592" y="162" text-anchor="middle" font-size="12" fill="#25262b">未提交的草稿、筛选条件</text>
<text x="592" y="198" text-anchor="middle" font-size="12" fill="#25262b">刷新页面丢了也无所谓</text>
<text x="592" y="234" text-anchor="middle" font-size="12" fill="#25262b">没有加载态这个概念</text>
<rect x="48" y="268" width="704" height="52" rx="12" fill="#f4f5f7" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="290" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">表单横跨两边：React Hook Form 管填写过程，Zod 管校验规则</text>
<text x="400" y="308" text-anchor="middle" font-size="11" fill="#6b6e76">同一份 Zod schema 同时用于前端校验、Server Action 入参校验和数据库写入前的兜底</text>
<text x="400" y="344" text-anchor="middle" font-size="11" fill="#6b6e76">把左边的东西塞进右边，你就要自己实现缓存、失效、去重和竞态处理——那正是 Query 已经做完的事</text>
</svg>
<figcaption>图 5：状态的分界。判据只有一句话——服务器上还有没有权威副本。有，就归 TanStack Query；没有，才轮到 Zustand。</figcaption>
</figure>

这张图省下的是实打实的代码量。一旦把接口返回的数据放进 Zustand，你就得自己处理：什么时候重新拉、并发请求怎么去重、旧响应后到怎么丢弃、多个组件同时用同一份数据怎么共享。这些 TanStack Query 全都做完了。

Zod 那条线也值得单独说。**同一份 schema 在三个地方复用**——前端表单校验、Server Action 入参校验、写库前的兜底——这是把它放进 `packages/schema` 的全部理由。类型从 schema 用 `z.infer` 推出来，不用手写一遍 interface，也就不存在类型和校验规则对不上的情况。

至于 Redux Toolkit：它仍然合理，但适用场景收窄了很多。需要时间旅行调试、需要把状态变更做成可序列化的事件流、或者团队已经有大量 Redux 代码——这三种情况之外，Zustand 的心智负担明显更低。

## 桌面端：Tauri 还是 Electron

<figure class="diagram">
<svg viewBox="0 0 800 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tauri 与 Electron 的运行时结构对比">
<text x="212" y="24" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Tauri 2</text>
<text x="588" y="24" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Electron</text>
<rect x="48" y="38" width="328" height="52" rx="10" fill="#25262b"/>
<text x="212" y="60" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">你的 React 产物</text>
<text x="212" y="78" text-anchor="middle" font-size="11" fill="#c4c6cd">Vite 构建的静态文件</text>
<rect x="424" y="38" width="328" height="52" rx="10" fill="#25262b"/>
<text x="588" y="60" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">你的 React 产物</text>
<text x="588" y="78" text-anchor="middle" font-size="11" fill="#c4c6cd">Vite 构建的静态文件</text>
<rect x="48" y="100" width="328" height="60" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="212" y="124" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">系统自带 WebView</text>
<text x="212" y="144" text-anchor="middle" font-size="11" fill="#6b6e76">WKWebView · WebView2 · WebKitGTK</text>
<rect x="424" y="100" width="328" height="60" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="588" y="124" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">随包分发的 Chromium</text>
<text x="588" y="144" text-anchor="middle" font-size="11" fill="#6b6e76">版本由你锁定，三端完全一致</text>
<rect x="48" y="170" width="328" height="60" rx="10" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="212" y="194" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Rust 核心进程</text>
<text x="212" y="214" text-anchor="middle" font-size="11" fill="#6b6e76">命令通过 IPC 暴露给前端</text>
<rect x="424" y="170" width="328" height="60" rx="10" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="588" y="194" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Node.js 主进程</text>
<text x="588" y="214" text-anchor="middle" font-size="11" fill="#6b6e76">整个 npm 生态直接可用</text>
<rect x="48" y="240" width="704" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="267" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">操作系统　Windows · macOS · Linux</text>
<text x="212" y="308" text-anchor="middle" font-size="11" fill="#6b6e76">安装包小、内存占用低</text>
<text x="212" y="326" text-anchor="middle" font-size="11" fill="#6b6e76">代价：要写 Rust，且要测三套 WebView</text>
<text x="588" y="308" text-anchor="middle" font-size="11" fill="#6b6e76">渲染行为完全可预测</text>
<text x="588" y="326" text-anchor="middle" font-size="11" fill="#6b6e76">代价：包体大，常驻内存明显更高</text>
</svg>
<figcaption>图 6：两者的差别集中在中间那一层——用系统的 WebView，还是自带一个浏览器。这一个选择决定了包体、内存和你要测多少套渲染行为。</figcaption>
</figure>

我默认选 Tauri，但这个默认值有个前提：**你的界面不依赖前沿 CSS 特性**。

Tauri 用系统 WebView，意味着 macOS 上是 WKWebView、Windows 上是 WebView2、Linux 上是 WebKitGTK——三套引擎，三种版本策略。Linux 那边的 WebKitGTK 尤其容易落后，一个在 Chrome 里正常的布局在那儿可能就是错的。这是 Tauri 真正的成本，比「要学 Rust」现实得多（大部分应用其实只需要写几个文件系统和窗口相关的命令）。

Electron 的取舍正好相反：几十兆的包体和明显更高的常驻内存，换来的是渲染行为完全可预测，以及整个 Node 生态开箱即用。如果你的应用要调 ffmpeg、要跑本地数据库、要用某个只有 Node 绑定的库，Electron 能省下的时间是以周计的。

判断方法：**先列出你需要的原生能力**。如果它们都在 Tauri 官方插件覆盖范围内（文件、通知、托盘、快捷键、自动更新），选 Tauri；如果有任何一项要靠 npm 上的原生模块，选 Electron。

## 移动端：复用的边界在哪

「一套代码多端复用」是这套栈最容易被过度承诺的地方。实际能复用的边界，比宣传的窄，但比悲观者以为的宽。

<figure class="diagram">
<svg viewBox="0 0 800 342" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Web 与移动端之间可复用与不可复用的部分">
<text x="400" y="24" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">代码复用的真实边界</text>
<rect x="48" y="38" width="212" height="228" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="154" y="64" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Web 专属</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="68" y="80" width="172" height="30" rx="6"/>
<rect x="68" y="118" width="172" height="30" rx="6"/>
<rect x="68" y="156" width="172" height="30" rx="6"/>
<rect x="68" y="194" width="172" height="30" rx="6"/>
</g>
<text x="154" y="100" text-anchor="middle" font-size="11" fill="#25262b">Tailwind 类名</text>
<text x="154" y="138" text-anchor="middle" font-size="11" fill="#25262b">DOM 事件与鼠标态</text>
<text x="154" y="176" text-anchor="middle" font-size="11" fill="#25262b">URL 路由</text>
<text x="154" y="214" text-anchor="middle" font-size="11" fill="#25262b">SEO 与 SSR</text>
<text x="154" y="248" text-anchor="middle" font-size="11" fill="#6b6e76">悬停、右键、窗口尺寸</text>
<rect x="292" y="38" width="216" height="228" rx="12" fill="#25262b"/>
<text x="400" y="64" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">共享核心</text>
<g fill="#25262b" stroke="#6b6e76" stroke-width="1.2">
<rect x="312" y="80" width="176" height="30" rx="6"/>
<rect x="312" y="118" width="176" height="30" rx="6"/>
<rect x="312" y="156" width="176" height="30" rx="6"/>
<rect x="312" y="194" width="176" height="30" rx="6"/>
</g>
<text x="400" y="100" text-anchor="middle" font-size="11" fill="#ffffff">TypeScript 类型</text>
<text x="400" y="138" text-anchor="middle" font-size="11" fill="#ffffff">Zod 校验 schema</text>
<text x="400" y="176" text-anchor="middle" font-size="11" fill="#ffffff">tRPC 客户端</text>
<text x="400" y="214" text-anchor="middle" font-size="11" fill="#ffffff">纯函数业务逻辑</text>
<text x="400" y="248" text-anchor="middle" font-size="11" fill="#c4c6cd">不碰 DOM，也不碰原生 API</text>
<rect x="540" y="38" width="212" height="228" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="646" y="64" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Mobile 专属</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="560" y="80" width="172" height="30" rx="6"/>
<rect x="560" y="118" width="172" height="30" rx="6"/>
<rect x="560" y="156" width="172" height="30" rx="6"/>
<rect x="560" y="194" width="172" height="30" rx="6"/>
</g>
<text x="646" y="100" text-anchor="middle" font-size="11" fill="#25262b">StyleSheet 样式</text>
<text x="646" y="138" text-anchor="middle" font-size="11" fill="#25262b">手势与触觉反馈</text>
<text x="646" y="176" text-anchor="middle" font-size="11" fill="#25262b">栈式导航</text>
<text x="646" y="214" text-anchor="middle" font-size="11" fill="#25262b">推送 · 相机 · 权限</text>
<text x="646" y="248" text-anchor="middle" font-size="11" fill="#6b6e76">安全区、键盘避让、后台态</text>
<text x="400" y="296" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">经验值：能共享的大约是三成到四成代码，但它们通常是最容易出 bug 的三成</text>
<text x="400" y="320" text-anchor="middle" font-size="11" fill="#6b6e76">共享 UI 组件是个陷阱——除非全站用 Tamagui，否则跨端组件抽象的维护成本高于各写一份</text>
</svg>
<figcaption>图 7：复用边界。共享的是逻辑而非界面。金额计算、权限判断、日期处理这类东西两端写两遍必然漂移，而布局各写一份反而更省事。</figcaption>
</figure>

这也解释了图 1 的共享层里为什么没有 `packages/ui`。跨端共享 UI 组件需要一层抽象把 `div` 和 `View`、CSS 和 StyleSheet 统一起来，**Tamagui 是目前做得最好的方案**——编译期把样式提取成静态的，Web 端出 CSS，原生端出 StyleSheet，性能损耗很小。

但它是有代价的：你的整个 UI 层都要用它的原语写，也就意味着放弃 shadcn/ui 那一整套。所以我的判断是——如果 Web 和 App 是同一个产品的两个壳，界面高度一致，用 Tamagui 统一；如果两端的信息架构本来就不同（这在实际产品里更常见），各用各的，只共享逻辑。

Expo 在这里几乎没有争议：它把原生构建、签名、OTA 更新、开发客户端这些最耗人的环节都包了。除非你要接的原生 SDK 完全无法用 config plugin 集成，否则没有理由裸用 React Native CLI。

## 工程化：monorepo 的收益和代价

<figure class="diagram">
<svg viewBox="0 0 800 386" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Turborepo 的仓库结构与依赖方向">
<defs>
<marker id="rf-a4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<text x="48" y="22" font-size="11" fill="#6b6e76" font-weight="600">依赖只能自上而下，反向引用是这套结构最常见的破坏方式</text>
<g fill="#25262b">
<rect x="48" y="34" width="212" height="48" rx="10"/>
<rect x="294" y="34" width="212" height="48" rx="10"/>
<rect x="540" y="34" width="212" height="48" rx="10"/>
</g>
<text x="154" y="55" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">apps/web</text>
<text x="154" y="72" text-anchor="middle" font-size="11" fill="#c4c6cd">Next.js</text>
<text x="400" y="55" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">apps/desktop</text>
<text x="400" y="72" text-anchor="middle" font-size="11" fill="#c4c6cd">Tauri</text>
<text x="646" y="55" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">apps/mobile</text>
<text x="646" y="72" text-anchor="middle" font-size="11" fill="#c4c6cd">Expo</text>
<line x1="154" y1="82" x2="154" y2="128" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a4)"/>
<line x1="400" y1="82" x2="400" y2="128" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a4)"/>
<line x1="646" y1="82" x2="646" y2="128" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a4)"/>
<line x1="154" y1="105" x2="646" y2="105" stroke="#e2e3e7" stroke-width="1.2"/>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="48" y="134" width="212" height="52" rx="10"/>
<rect x="294" y="134" width="212" height="52" rx="10"/>
<rect x="540" y="134" width="212" height="52" rx="10"/>
</g>
<text x="154" y="156" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">packages/api</text>
<text x="154" y="174" text-anchor="middle" font-size="11" fill="#6b6e76">tRPC 客户端与过程定义</text>
<text x="400" y="156" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">packages/core</text>
<text x="400" y="174" text-anchor="middle" font-size="11" fill="#6b6e76">纯业务逻辑，零副作用</text>
<text x="646" y="156" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">packages/ui-web</text>
<text x="646" y="174" text-anchor="middle" font-size="11" fill="#6b6e76">只给 Web 和桌面用</text>
<line x1="154" y1="186" x2="154" y2="228" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a4)"/>
<line x1="400" y1="186" x2="400" y2="228" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a4)"/>
<line x1="646" y1="186" x2="646" y2="228" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rf-a4)"/>
<line x1="154" y1="208" x2="646" y2="208" stroke="#e2e3e7" stroke-width="1.2"/>
<rect x="48" y="234" width="704" height="52" rx="10" fill="#f4f5f7" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="256" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">packages/types　·　packages/schema</text>
<text x="400" y="274" text-anchor="middle" font-size="11" fill="#6b6e76">最底层，不依赖任何其他包——所以它一变，全仓库缓存失效</text>
<rect x="48" y="300" width="704" height="44" rx="10" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="400" y="327" text-anchor="middle" font-size="12" fill="#6b6e76">tooling/　eslint-config · tsconfig · tailwind-preset　　pnpm workspace + Turborepo 任务缓存</text>
<text x="400" y="370" text-anchor="middle" font-size="11" fill="#6b6e76">改一个 app 只重建这个 app；改最底层的 types，所有下游任务全部重跑</text>
</svg>
<figcaption>图 8：Turborepo 结构。分包的第一原则是让依赖图保持无环且尽量浅——包分得越细，缓存命中率越高，但配置维护成本也越高。</figcaption>
</figure>

Turborepo 的核心价值是**任务级缓存**：改了 `apps/mobile`，`apps/web` 的构建和测试直接命中缓存跳过。在 CI 上这个差别很显著，一个五分钟的全量流水线经常能降到几十秒。

但 monorepo 不是免费的。你要付出的是：包边界要想清楚（分错了以后重构很痛）、IDE 索引变慢、依赖版本要统一管理、新人上手成本更高。**只有一个 app 的时候，别上 monorepo**。等第二个交付面真的出现了再拆，那时你对哪些东西该共享也有了真实答案，而不是靠猜。

包的划分我有一条经验：`packages/types` 和 `packages/schema` 必须在最底层且不依赖任何其他包。它们变更频率最低，一旦让它们反向依赖了上层，整个缓存策略就会退化成「改任何东西都全量重建」。

## 认证与部署

认证这块，两个选择的差别其实是「谁持有用户表」：

| | Supabase Auth | Clerk |
|-|-|-|
| 用户数据 | 在你自己的 Postgres 里 | 在 Clerk 那边，通过 webhook 同步 |
| 与业务表关联 | 直接外键，行级安全策略可用 | 存外部 ID，需要同步逻辑 |
| 开箱即用的 UI | 需要自己搭 | 组件齐全，几行接完 |
| 组织与多租户 | 自己实现 | 内置 |
| 迁移成本 | 低，数据在自己手里 | 较高 |

**已经用了 Supabase 数据库，就用 Supabase Auth**——`auth.uid()` 能直接进 RLS 策略，这个便利很难放弃。反过来，如果产品要做 B2B 多租户、需要组织和成员邀请这套东西，Clerk 内置的那部分能省掉的工作量相当可观。

部署上没什么悬念：Web 端 Vercel（Next.js 的很多特性在别处需要额外配置才能等效）；数据库 Supabase 或 Neon（分支功能对预览环境很好用）；需要跑常驻服务、worker、或者有数据合规要求的部分，Docker + GitHub Actions 部到你自己的机器上。

顺带一提，如果你的项目是纯静态站，这一整套都不需要——GitHub Actions 构建 + GitHub Pages 就够了，零成本零运维。这个博客就是这么跑的。

## 怎么选：一张决策图

<figure class="diagram">
<svg viewBox="0 0 800 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="按产品形态选择技术组合的决策阶梯">
<defs>
<marker id="rf-a5" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<text x="48" y="24" font-size="11" fill="#6b6e76" font-weight="600">从上往下逐条问，每答一次「是」就往组合里加一层</text>
<rect x="48" y="36" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="60" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">界面的价值主要来自数据密度，而不是设计？</text>
<text x="238" y="79" text-anchor="middle" font-size="11" fill="#6b6e76">大量表格、表单、审批流、权限矩阵</text>
<line x1="428" y1="64" x2="468" y2="64" stroke="#25262b" stroke-width="1.8" marker-end="url(#rf-a5)"/>
<rect x="476" y="36" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="60" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">React + Ant Design Pro</text>
<text x="614" y="79" text-anchor="middle" font-size="11" fill="#c4c6cd">到此为止，下面几条可以不看</text>
<rect x="48" y="108" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="132" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">需要 SEO、分享预览或服务端渲染？</text>
<text x="238" y="151" text-anchor="middle" font-size="11" fill="#6b6e76">面向公众的产品几乎都需要</text>
<line x1="428" y1="136" x2="468" y2="136" stroke="#25262b" stroke-width="1.8" marker-end="url(#rf-a5)"/>
<rect x="476" y="108" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="132" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Next.js + shadcn/ui</text>
<text x="614" y="151" text-anchor="middle" font-size="11" fill="#c4c6cd">否则 Vite + React Router 更轻</text>
<rect x="48" y="180" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="204" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">要读写本地文件，或常驻后台运行？</text>
<text x="238" y="223" text-anchor="middle" font-size="11" fill="#6b6e76">开发工具、AI 客户端、本地优先应用</text>
<line x1="428" y1="208" x2="468" y2="208" stroke="#25262b" stroke-width="1.8" marker-end="url(#rf-a5)"/>
<rect x="476" y="180" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="204" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">加一层 Tauri 2</text>
<text x="614" y="223" text-anchor="middle" font-size="11" fill="#c4c6cd">要用原生 npm 模块则改 Electron</text>
<rect x="48" y="252" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="276" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">需要推送、相机、离线这些移动端能力？</text>
<text x="238" y="295" text-anchor="middle" font-size="11" fill="#6b6e76">注意：只是「手机上能打开」不算，PWA 就够</text>
<line x1="428" y1="280" x2="468" y2="280" stroke="#25262b" stroke-width="1.8" marker-end="url(#rf-a5)"/>
<rect x="476" y="252" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="276" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">加一层 Expo</text>
<text x="614" y="295" text-anchor="middle" font-size="11" fill="#c4c6cd">同时把逻辑抽进 packages/</text>
<rect x="48" y="324" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="348" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">有两个以上客户端，或团队超过十人？</text>
<text x="238" y="367" text-anchor="middle" font-size="11" fill="#6b6e76">或者存在非 HTTP 触发的后台任务</text>
<line x1="428" y1="352" x2="468" y2="352" stroke="#25262b" stroke-width="1.8" marker-end="url(#rf-a5)"/>
<rect x="476" y="324" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="348" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">拆出 NestJS + Turborepo</text>
<text x="614" y="367" text-anchor="middle" font-size="11" fill="#c4c6cd">否则单仓 Next.js 一直够用</text>
<text x="400" y="406" text-anchor="middle" font-size="11" fill="#6b6e76">全答「否」也是一个合理结果——那说明你需要的只是 Vite 加一个静态托管</text>
</svg>
<figcaption>图 9：决策阶梯。它的作用不是给出唯一答案，而是让你明确每一层复杂度是被哪个具体需求换来的。</figcaption>
</figure>

对照成表格：

| 场景 | 组合 |
|-|-|
| AI SaaS、面向消费者的产品 | Next.js + shadcn/ui + Appica UI + Supabase |
| 创业 MVP、验证阶段 | Next.js + Prisma + Supabase，先不分包 |
| 企业后台、内部系统 | React + Ant Design Pro + NestJS |
| 营销官网、落地页 | Next.js + React Bits + Framer Motion |
| 桌面工具、AI 客户端 | Tauri 2 + React + Vite |
| 移动 App | Expo + React Native + Reanimated |
| 多端产品、团队较大 | Turborepo + Next.js + NestJS + Expo |
| 个人博客、文档站 | Vite 或 Astro + 静态托管 |

## 我的默认选择

如果今天要开一个新的 SaaS 产品，我会这么起手：

```
Next.js · React 19 · TypeScript
Tailwind CSS + shadcn/ui（基础）+ Appica UI（补位）
TanStack Query（服务端状态）+ Zustand（客户端状态）
React Hook Form + Zod（同一份 schema 三处复用）
Server Actions + Prisma + Supabase PostgreSQL
Vercel 部署，GitHub Actions 跑检查
```

注意这里面**没有** Turborepo、没有 NestJS、没有 tRPC、也没有 Tauri 和 Expo。它们全都是后面按需加进来的东西，一开始就摆上只会拖慢速度。

这一点比清单本身更重要：上面那些图画的是**完全体**，不是起点。真实项目的路径应该是从最小的那个形状开始，等到某个具体的痛点出现——第二个客户端、后台任务、构建变慢、团队变大——再去加对应的那一层。

每加一层，都该能说清楚它是被哪个具体问题换来的。说不清楚，那就是过早的复杂度。
