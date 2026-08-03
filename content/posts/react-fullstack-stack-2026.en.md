---
title: "The React Full-Stack Setup in 2026: One Codebase Across Web, Desktop, and Mobile"
excerpt: From Next.js to Tauri to Expo, a selection checklist rebuilt as nine architecture diagrams — why each layer is chosen, when to deviate from the default, and what shadcn/ui, Appica UI, and React Bits are each actually responsible for.
tags: [React, Next.js, TypeScript, Tauri, React Native, Tech Selection]
coverAlt: Crayon-style illustration — a browser window holding the React logo and a page of UI cards, component fragments scattered to its left, lines running right toward servers, a database and a cloud, with a monitor, tablet and phone below
---

Stack checklists are everywhere, and most of them answer the wrong question. Listing fifteen library names doesn't tell you why those libraries fit together, and it certainly doesn't tell you which one you'll need to replace first.

What actually makes selection hard is that the decisions **arrive in groups**. Pick Next.js and your server boundary is decided with it. Pick Tauri and the shape of your frontend build is decided with it. Pick a monorepo and your caching strategy and dependency direction come along for the ride. Each choice looks reasonable alone; the trouble starts when they have to coexist.

So this piece is organised by layer. Each one gets a diagram, and for each one I try to say what its interface is, how it meshes with what sits above and below, and under what circumstances you should throw it out.

## The whole picture

This is the default shape I reach for on a new product: three delivery targets sharing one core, converging on a single server.

<figure class="diagram">
<svg viewBox="0 0 800 476" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Layered structure of a React full-stack setup: web, desktop and mobile targets share a packages layer and converge on a server and database">
<defs>
<marker id="rfe-a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<text x="56" y="22" font-size="11" fill="#6b6e76" font-weight="600">Delivery targets · apps/</text>
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
<line x1="156" y1="94" x2="156" y2="142" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a1)"/>
<line x1="400" y1="94" x2="400" y2="142" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a1)"/>
<line x1="644" y1="94" x2="644" y2="142" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a1)"/>
<rect x="56" y="148" width="688" height="104" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="72" y="172" font-size="11" fill="#6b6e76" font-weight="600">Shared layer · packages/　　change it once, all three follow</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="72" y="184" width="152" height="52" rx="8"/>
<rect x="240" y="184" width="152" height="52" rx="8"/>
<rect x="408" y="184" width="152" height="52" rx="8"/>
<rect x="576" y="184" width="152" height="52" rx="8"/>
</g>
<text x="148" y="206" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">types</text>
<text x="148" y="224" text-anchor="middle" font-size="11" fill="#6b6e76">Domain models</text>
<text x="316" y="206" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">schema</text>
<text x="316" y="224" text-anchor="middle" font-size="11" fill="#6b6e76">Zod rules</text>
<text x="484" y="206" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">api</text>
<text x="484" y="224" text-anchor="middle" font-size="11" fill="#6b6e76">Typed client</text>
<text x="652" y="206" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">core</text>
<text x="652" y="224" text-anchor="middle" font-size="11" fill="#6b6e76">Pure logic</text>
<line x1="400" y1="252" x2="400" y2="286" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a1)"/>
<rect x="56" y="292" width="688" height="62" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="72" y="304" width="200" height="38" rx="8"/>
<rect x="300" y="304" width="200" height="38" rx="8"/>
<rect x="528" y="304" width="200" height="38" rx="8"/>
</g>
<text x="172" y="328" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Server Actions</text>
<text x="400" y="328" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">tRPC (all clients)</text>
<text x="628" y="328" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Prisma ORM</text>
<line x1="400" y1="354" x2="400" y2="388" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a1)"/>
<rect x="250" y="394" width="300" height="46" rx="10" fill="#25262b"/>
<text x="400" y="422" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">PostgreSQL</text>
<text x="400" y="464" text-anchor="middle" font-size="12" fill="#6b6e76">Desktop and mobile always go through tRPC; only the web app gets the Server Actions shortcut</text>
</svg>
<figcaption>Figure 1: The whole picture. The three targets live separately under apps/; what they share is types, validation rules, an API client and pure logic — note that no UI components appear in the shared layer, for reasons covered in Figure 7.</figcaption>
</figure>

There's a detail here that's easy to skim past: **Server Actions and tRPC both exist**. That isn't redundancy. A Server Action only works inside the Next.js process — desktop and mobile simply cannot call it. So the moment a capability is needed on all three targets, it has to exist as a tRPC procedure. Server Actions are reserved for what's genuinely web-only: form submissions, page-level mutations.

Teams that miss this line tend to write the logic into a Server Action, then re-implement it in a REST handler when mobile work starts. From that point the two copies drift.

## Why Next.js

React 19 isn't a framework, so sooner or later you have to pick something to stitch routing, data fetching and server rendering together. In practice there are three candidates: Next.js, React Router v7 (formerly Remix), or Vite assembled by hand.

I default to Next.js for a fairly concrete reason: **Server Components make "fetch on the server, then render" the ordinary way to write things** rather than an advanced feature you have to configure your way into. What that saves isn't just loading states — it's the whole waterfall where the client receives a component and only then starts requesting data.

Three situations where I don't use it:

- **Purely static content sites.** The blog you're reading is Vite plus build-time prerendering. There's no server and none is wanted. Next.js here would just wrap static files in a runtime that never runs.
- **Builds that get embedded in another shell.** Tauri, Electron, browser extensions — all of them want a bundle that loads over `file://`. Next.js can produce that with `output: 'export'`, but you lose Server Actions, middleware and route handlers along the way. Half the framework's value is gone; use Vite instead.
- **Interaction-heavy tool apps.** Graphics editors, IDEs, boards — products with almost nothing to gain from server rendering. The hydration cost outweighs the first-paint saving.

React Router v7 is a respectable second choice, especially if you'd rather not be tied to Vercel's deployment model. Its loader model is easier to simulate in your head than Next.js's.

## Three UI layers, and what each owns

This is the layer people most often muddle. shadcn/ui, Appica UI and React Bits get recommended side by side, but they're not the same kind of thing at all, and mixing them without a plan goes badly.

<figure class="diagram">
<svg viewBox="0 0 800 402" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three UI layers: React Bits as effects, Appica UI as product components, shadcn/ui as the foundation, over Tailwind and React">
<text x="56" y="22" font-size="11" fill="#6b6e76" font-weight="600">The UI on a single page comes from three layers of different nature</text>
<rect x="56" y="32" width="688" height="72" rx="12" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.2"/>
<rect x="72" y="46" width="164" height="44" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="154" y="66" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">React Bits</text>
<text x="154" y="82" text-anchor="middle" font-size="11" fill="#6b6e76">Effects · optional</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="264" y="54" width="104" height="28" rx="6"/>
<rect x="380" y="54" width="104" height="28" rx="6"/>
<rect x="496" y="54" width="104" height="28" rx="6"/>
<rect x="612" y="54" width="104" height="28" rx="6"/>
</g>
<text x="316" y="73" text-anchor="middle" font-size="11" fill="#6b6e76">Backgrounds</text>
<text x="432" y="73" text-anchor="middle" font-size="11" fill="#6b6e76">Text effects</text>
<text x="548" y="73" text-anchor="middle" font-size="11" fill="#6b6e76">Scroll reveals</text>
<text x="664" y="73" text-anchor="middle" font-size="11" fill="#6b6e76">Cursor FX</text>
<rect x="56" y="116" width="688" height="72" rx="12" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.2"/>
<rect x="72" y="130" width="164" height="44" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="154" y="150" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Appica UI</text>
<text x="154" y="166" text-anchor="middle" font-size="11" fill="#6b6e76">Product parts · fills gaps</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="264" y="138" width="104" height="28" rx="6"/>
<rect x="380" y="138" width="104" height="28" rx="6"/>
<rect x="496" y="138" width="104" height="28" rx="6"/>
<rect x="612" y="138" width="104" height="28" rx="6"/>
</g>
<text x="316" y="157" text-anchor="middle" font-size="11" fill="#6b6e76">Inputs</text>
<text x="432" y="157" text-anchor="middle" font-size="11" fill="#6b6e76">Data display</text>
<text x="548" y="157" text-anchor="middle" font-size="11" fill="#6b6e76">Navigation</text>
<text x="664" y="157" text-anchor="middle" font-size="11" fill="#6b6e76">Feedback</text>
<rect x="56" y="200" width="688" height="72" rx="12" fill="#25262b"/>
<rect x="72" y="214" width="164" height="44" rx="8" fill="#ffffff"/>
<text x="154" y="234" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">shadcn/ui</text>
<text x="154" y="250" text-anchor="middle" font-size="11" fill="#6b6e76">Foundation · required</text>
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
<text x="400" y="327" text-anchor="middle" font-size="11" fill="#6b6e76">All three share one set of design tokens, or you are just stacking three aesthetics</text>
<text x="400" y="368" text-anchor="middle" font-size="12" fill="#6b6e76">Higher up: lighter and more replaceable. Lower down: more stable, less to be touched</text>
<text x="400" y="388" text-anchor="middle" font-size="12" fill="#6b6e76">Delete the top two layers and the product still works — that is the test for a correct split</text>
</svg>
<figcaption>Figure 2: The three UI layers. shadcn/ui is the foundation and isn't replaceable; Appica UI fills in the product-grade controls it lacks; React Bits appears only on marketing pages and a handful of deliberate moments.</figcaption>
</figure>

**shadcn/ui isn't really a component library.** It's a set of component sources you copy into your own repo. That distinction matters: upgrades can't break you, because the code is yours — but equally, nobody else fixes your bugs. What it solves is the old complaint that a component library's customisation always stops one inch short. Want it different? Edit the file.

**Appica UI** is a component library in the ordinary sense: free and open source, sixty-plus components spanning inputs, data display, navigation and feedback, installed from npm with tree-shaking, shipping TypeScript types, keyboard navigation, RTL support and a matching Figma library. Its job is gap-filling — shadcn's set skews basic, and things like date-range pickers, complex tables and command palettes are otherwise yours to write.

**React Bits** operates on a different axis: a hundred and forty-odd animated components, mostly text effects, backgrounds and scroll interactions, each shipped in four variants (JS-CSS, JS-TW, TS-CSS, TS-TW), installable through the shadcn CLI or jsrepo, or simply copied. It's MIT with the Commons Clause — free for personal and commercial work, but not for resale.

Two rules I only arrived at by getting them wrong first:

1. **The effects layer stays out of the product interior.** Landing pages, pricing, empty states — fine. The moment particle backgrounds and cursor trails enter a screen someone stares at for eight hours a day, "characterful" turns into "distracting".
2. **One source per component category.** If Button comes from shadcn, it comes from shadcn everywhere. Don't mix in Appica's because one variant looks nicer — two focus styles, two disabled states and two dark-mode adaptations cost far more than the afternoon you saved.

As for Ant Design: it's absent from the diagram, which is not the same as being wrong. For ERP, CRM or approval systems — anything where **tables and forms are eighty percent of the interface** — ProTable and ProForm from Ant Design Pro will save you weeks, and their handling of frozen columns, editable cells and large datasets is more dependable than what you'd assemble yourself. The test is simple: does the product's value come from data density or from designed experience? Former, Ant Design. Latter, this stack.

## Backend: two sizes, two shapes

The dividing line for backend selection isn't traffic. It's **team size and client count**.

### Small to mid-size: don't split early

<figure class="diagram">
<svg viewBox="0 0 800 322" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Request path for a small to mid-size project: browser to Next.js Server Action to Prisma to PostgreSQL">
<defs>
<marker id="rfe-a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
<marker id="rfe-a2d" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<text x="48" y="24" font-size="11" fill="#6b6e76" font-weight="600">Request path · no separate API layer</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="48" y="42" width="150" height="64" rx="10"/>
<rect x="416" y="42" width="150" height="64" rx="10"/>
</g>
<rect x="232" y="42" width="150" height="64" rx="10" fill="#25262b"/>
<rect x="600" y="42" width="152" height="64" rx="10" fill="#25262b"/>
<text x="123" y="70" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Browser</text>
<text x="123" y="88" text-anchor="middle" font-size="11" fill="#6b6e76">React 19</text>
<text x="307" y="70" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">Server Action</text>
<text x="307" y="88" text-anchor="middle" font-size="11" fill="#c4c6cd">in the Next.js process</text>
<text x="491" y="70" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Prisma</text>
<text x="491" y="88" text-anchor="middle" font-size="11" fill="#6b6e76">Typed queries</text>
<text x="676" y="70" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">PostgreSQL</text>
<text x="676" y="88" text-anchor="middle" font-size="11" fill="#c4c6cd">Supabase / Neon</text>
<line x1="198" y1="66" x2="228" y2="66" stroke="#25262b" stroke-width="1.8" marker-end="url(#rfe-a2)"/>
<line x1="382" y1="66" x2="412" y2="66" stroke="#25262b" stroke-width="1.8" marker-end="url(#rfe-a2)"/>
<line x1="566" y1="66" x2="596" y2="66" stroke="#25262b" stroke-width="1.8" marker-end="url(#rfe-a2)"/>
<line x1="596" y1="92" x2="566" y2="92" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#rfe-a2d)"/>
<line x1="412" y1="92" x2="382" y2="92" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#rfe-a2d)"/>
<line x1="228" y1="92" x2="198" y2="92" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#rfe-a2d)"/>
<text x="400" y="132" text-anchor="middle" font-size="11" fill="#6b6e76">Solid = a function call, not an HTTP request　Dashed = the serialized return value</text>
<line x1="676" y1="106" x2="676" y2="164" stroke="#c4c6cd" stroke-width="1.5"/>
<line x1="676" y1="164" x2="196" y2="164" stroke="#c4c6cd" stroke-width="1.5"/>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="120" y="180" width="152" height="52" rx="8"/>
<rect x="324" y="180" width="152" height="52" rx="8"/>
<rect x="528" y="180" width="152" height="52" rx="8"/>
</g>
<line x1="196" y1="164" x2="196" y2="176" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a2d)"/>
<line x1="400" y1="164" x2="400" y2="176" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a2d)"/>
<line x1="604" y1="164" x2="604" y2="176" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a2d)"/>
<text x="196" y="202" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Auth</text>
<text x="196" y="220" text-anchor="middle" font-size="11" fill="#6b6e76">OAuth · email · RLS</text>
<text x="400" y="202" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Storage</text>
<text x="400" y="220" text-anchor="middle" font-size="11" fill="#6b6e76">Files and images</text>
<text x="604" y="202" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Realtime</text>
<text x="604" y="220" text-anchor="middle" font-size="11" fill="#6b6e76">Table subscriptions</text>
<text x="400" y="260" text-anchor="middle" font-size="11" fill="#6b6e76">These ship with the database rather than as extra services — three modules you would otherwise write yourself</text>
<rect x="120" y="278" width="560" height="34" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="300" text-anchor="middle" font-size="12" fill="#25262b">One deploy unit, one release, one set of types for the entire path</text>
</svg>
<figcaption>Figure 3: The small-to-mid-size shape. A Server Action is a function call rather than an HTTP request, so arguments and return values line up by construction and there is no interface document to keep current.</figcaption>
</figure>

The core advantage of this shape is that **there's no API contract to maintain**. A Server Action's parameter types *are* the types the client passes; rename a field and TypeScript fails on both sides at once. The familiar loop from separated frontend and backend — change the endpoint, update the docs, wait for the client to follow, discover during integration that they don't match — doesn't exist here.

The cost is equally clear: all of it is welded to Next.js. The day mobile work begins, not one Server Action carries over. That's why tRPC is already in Figure 1 — it's a second exit from the same server-side logic, and the price is a thin layer of procedure definitions.

Supabase's role here is widely misread. It isn't a black box in the backend-as-a-service sense; it's **PostgreSQL with a few official modules bolted on**. You still write migrations and queries through Prisma — you just don't implement auth, uploads and realtime yourself. Which also means the exit is cheap: dump the database, point it at Neon or your own instance, and the only rewrite is the auth slice.

### Mid to large: when a split becomes necessary

<figure class="diagram">
<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mid to large architecture: web and mobile clients through a BFF layer and a NestJS API to PostgreSQL, Redis and background workers">
<defs>
<marker id="rfe-a3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="120" y="28" width="200" height="52" rx="10"/>
<rect x="480" y="28" width="200" height="52" rx="10"/>
</g>
<text x="220" y="52" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Web · Desktop</text>
<text x="220" y="70" text-anchor="middle" font-size="11" fill="#6b6e76">Next.js · Tauri</text>
<text x="580" y="52" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Mobile</text>
<text x="580" y="70" text-anchor="middle" font-size="11" fill="#6b6e76">Expo</text>
<line x1="220" y1="80" x2="300" y2="112" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a3)"/>
<line x1="580" y1="80" x2="500" y2="112" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a3)"/>
<rect x="240" y="118" width="320" height="56" rx="10" fill="#25262b"/>
<text x="400" y="142" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">BFF layer · tRPC router</text>
<text x="400" y="160" text-anchor="middle" font-size="11" fill="#c4c6cd">Aggregate, trim, forward auth — no rules</text>
<line x1="400" y1="174" x2="400" y2="208" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a3)"/>
<rect x="152" y="214" width="496" height="76" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="236" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">NestJS API · the only home for business rules</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="172" y="246" width="108" height="30" rx="6"/>
<rect x="292" y="246" width="108" height="30" rx="6"/>
<rect x="412" y="246" width="108" height="30" rx="6"/>
<rect x="532" y="246" width="96" height="30" rx="6"/>
</g>
<text x="226" y="266" text-anchor="middle" font-size="11" fill="#6b6e76">Domain modules</text>
<text x="346" y="266" text-anchor="middle" font-size="11" fill="#6b6e76">Authorization</text>
<text x="466" y="266" text-anchor="middle" font-size="11" fill="#6b6e76">Transactions</text>
<text x="580" y="266" text-anchor="middle" font-size="11" fill="#6b6e76">Audit log</text>
<line x1="280" y1="290" x2="240" y2="322" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a3)"/>
<line x1="400" y1="290" x2="400" y2="322" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a3)"/>
<line x1="520" y1="290" x2="560" y2="322" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a3)"/>
<g fill="#25262b">
<rect x="120" y="328" width="200" height="48" rx="10"/>
<rect x="340" y="328" width="120" height="48" rx="10"/>
<rect x="480" y="328" width="200" height="48" rx="10"/>
</g>
<text x="220" y="349" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">PostgreSQL</text>
<text x="220" y="366" text-anchor="middle" font-size="11" fill="#c4c6cd">Source of truth</text>
<text x="400" y="349" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Redis</text>
<text x="400" y="366" text-anchor="middle" font-size="11" fill="#c4c6cd">Cache · queues</text>
<text x="580" y="349" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Worker</text>
<text x="580" y="366" text-anchor="middle" font-size="11" fill="#c4c6cd">Async jobs · cron</text>
</svg>
<figcaption>Figure 4: The mid-to-large architecture. The binding constraint is that business rules live only in NestJS; the BFF aggregates and trims. Once rules start leaking into the BFF, the split has bought you nothing.</figcaption>
</figure>

When should you move from Figure 3 to Figure 4? Three signals, any one of which is enough:

- **A second client appears**, and the data shape it wants differs noticeably from the web app's.
- **There's work that isn't triggered by HTTP**: scheduled jobs, queue consumers, long batch processing. Cramming these into serverless functions eventually meets a timeout.
- **The team passes eight to ten people** and edits to one Next.js repo start colliding regularly.

Conversely, if the only argument is "it'll probably get big", don't split. Growing from Figure 3 into Figure 4 costs far less than maintaining two deployments, two CI pipelines and two logging setups from day one.

## State: first work out who owns it

Most projects with "messy state management" didn't pick the wrong library. They **put server data into a client-side global store**.

<figure class="diagram">
<svg viewBox="0 0 800 356" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The boundary between server state and client state: TanStack Query versus Zustand, with forms handled by React Hook Form and Zod">
<text x="400" y="24" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">Ask one question first: does the server hold an authoritative copy of this?</text>
<line x1="400" y1="38" x2="400" y2="252" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 5"/>
<rect x="48" y="44" width="320" height="208" rx="12" fill="#25262b"/>
<text x="208" y="72" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="600">Yes → server state</text>
<text x="208" y="92" text-anchor="middle" font-size="12" fill="#c4c6cd">TanStack Query</text>
<g fill="#25262b" stroke="#6b6e76" stroke-width="1.2">
<rect x="72" y="106" width="272" height="30" rx="6"/>
<rect x="72" y="142" width="272" height="30" rx="6"/>
<rect x="72" y="178" width="272" height="30" rx="6"/>
<rect x="72" y="214" width="272" height="30" rx="6"/>
</g>
<text x="208" y="126" text-anchor="middle" font-size="12" fill="#ffffff">Lists, detail pages, profiles</text>
<text x="208" y="162" text-anchor="middle" font-size="12" fill="#ffffff">Goes stale · needs refetching</text>
<text x="208" y="198" text-anchor="middle" font-size="12" fill="#ffffff">Invalidated by key after mutations</text>
<text x="208" y="234" text-anchor="middle" font-size="12" fill="#ffffff">Loading and error states come free</text>
<rect x="432" y="44" width="320" height="208" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="592" y="72" text-anchor="middle" font-size="14" fill="#25262b" font-weight="600">No → client state</text>
<text x="592" y="92" text-anchor="middle" font-size="12" fill="#6b6e76">Zustand</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="456" y="106" width="272" height="30" rx="6"/>
<rect x="456" y="142" width="272" height="30" rx="6"/>
<rect x="456" y="178" width="272" height="30" rx="6"/>
<rect x="456" y="214" width="272" height="30" rx="6"/>
</g>
<text x="592" y="126" text-anchor="middle" font-size="12" fill="#25262b">Sidebar open, current selection</text>
<text x="592" y="162" text-anchor="middle" font-size="12" fill="#25262b">Unsaved drafts, active filters</text>
<text x="592" y="198" text-anchor="middle" font-size="12" fill="#25262b">Losing it on reload is fine</text>
<text x="592" y="234" text-anchor="middle" font-size="12" fill="#25262b">No such thing as a loading state</text>
<rect x="48" y="268" width="704" height="52" rx="12" fill="#f4f5f7" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="290" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Forms span both: React Hook Form owns the editing, Zod owns the rules</text>
<text x="400" y="308" text-anchor="middle" font-size="11" fill="#6b6e76">One Zod schema covers client validation, Server Action inputs, and the last check before a write</text>
<text x="400" y="344" text-anchor="middle" font-size="11" fill="#6b6e76">Move the left side into the right and you rebuild caching, invalidation, dedup and races yourself</text>
</svg>
<figcaption>Figure 5: The state boundary. The test is one sentence — is there still an authoritative copy on the server? If yes, it belongs to TanStack Query. Only if no does Zustand come into it.</figcaption>
</figure>

What this diagram saves is measurable in lines of code. Put a response into Zustand and you now own: when to refetch, how to dedupe concurrent requests, how to discard a late response, how several components share one copy. TanStack Query has done all of it.

The Zod line deserves its own note. **The same schema is reused in three places** — client-side form validation, Server Action input validation, and the last check before a write — and that is the entire reason it lives in `packages/schema`. Types come out of the schema via `z.infer` rather than being hand-written a second time, so there's no way for the types and the validation rules to disagree.

Redux Toolkit still makes sense, but the case for it has narrowed. Time-travel debugging, state changes as a serialisable event log, or an existing pile of Redux code — outside those three, Zustand asks much less of you.

## Desktop: Tauri or Electron

<figure class="diagram">
<svg viewBox="0 0 800 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Runtime structure of Tauri compared with Electron">
<text x="212" y="24" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Tauri 2</text>
<text x="588" y="24" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Electron</text>
<rect x="48" y="38" width="328" height="52" rx="10" fill="#25262b"/>
<text x="212" y="60" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Your React build</text>
<text x="212" y="78" text-anchor="middle" font-size="11" fill="#c4c6cd">Static files from Vite</text>
<rect x="424" y="38" width="328" height="52" rx="10" fill="#25262b"/>
<text x="588" y="60" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Your React build</text>
<text x="588" y="78" text-anchor="middle" font-size="11" fill="#c4c6cd">Static files from Vite</text>
<rect x="48" y="100" width="328" height="60" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="212" y="124" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">The system WebView</text>
<text x="212" y="144" text-anchor="middle" font-size="11" fill="#6b6e76">WKWebView · WebView2 · WebKitGTK</text>
<rect x="424" y="100" width="328" height="60" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="588" y="124" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">A bundled Chromium</text>
<text x="588" y="144" text-anchor="middle" font-size="11" fill="#6b6e76">You pin the version; identical everywhere</text>
<rect x="48" y="170" width="328" height="60" rx="10" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="212" y="194" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Rust core process</text>
<text x="212" y="214" text-anchor="middle" font-size="11" fill="#6b6e76">Commands exposed over IPC</text>
<rect x="424" y="170" width="328" height="60" rx="10" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="588" y="194" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Node.js main process</text>
<text x="588" y="214" text-anchor="middle" font-size="11" fill="#6b6e76">The whole npm ecosystem works</text>
<rect x="48" y="240" width="704" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="267" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Operating system　Windows · macOS · Linux</text>
<text x="212" y="308" text-anchor="middle" font-size="11" fill="#6b6e76">Small installer, low memory use</text>
<text x="212" y="326" text-anchor="middle" font-size="11" fill="#6b6e76">Cost: some Rust, and three WebViews to test</text>
<text x="588" y="308" text-anchor="middle" font-size="11" fill="#6b6e76">Rendering is entirely predictable</text>
<text x="588" y="326" text-anchor="middle" font-size="11" fill="#6b6e76">Cost: large bundle, much higher resident memory</text>
</svg>
<figcaption>Figure 6: The difference sits in the middle layer — use the system's WebView, or ship a browser. That single choice determines bundle size, memory, and how many rendering engines you have to test against.</figcaption>
</figure>

I default to Tauri, with one precondition: **your interface doesn't lean on frontier CSS**.

Tauri uses the system WebView, which means WKWebView on macOS, WebView2 on Windows and WebKitGTK on Linux — three engines, three versioning policies. WebKitGTK in particular tends to lag, and a layout that behaves in Chrome can be wrong there. That's Tauri's real cost, and it's a far more practical concern than "you have to learn Rust" (most apps need only a handful of filesystem and window commands).

Electron's trade is the mirror image: tens of megabytes and noticeably higher resident memory, in exchange for rendering that behaves identically everywhere and the entire Node ecosystem out of the box. If your app shells out to ffmpeg, runs a local database, or depends on a library that only has Node bindings, Electron saves you weeks.

How to decide: **write down the native capabilities you need**. If they're all covered by official Tauri plugins — files, notifications, tray, shortcuts, auto-update — take Tauri. If any one of them requires a native npm module, take Electron.

## Mobile: where reuse actually stops

"One codebase, every platform" is the most over-promised part of this stack. The real boundary is narrower than the marketing and wider than the cynics assume.

<figure class="diagram">
<svg viewBox="0 0 800 342" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What can and cannot be shared between web and mobile">
<text x="400" y="24" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">Where code reuse actually stops</text>
<rect x="48" y="38" width="212" height="228" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="154" y="64" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Web only</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="68" y="80" width="172" height="30" rx="6"/>
<rect x="68" y="118" width="172" height="30" rx="6"/>
<rect x="68" y="156" width="172" height="30" rx="6"/>
<rect x="68" y="194" width="172" height="30" rx="6"/>
</g>
<text x="154" y="100" text-anchor="middle" font-size="11" fill="#25262b">Tailwind classes</text>
<text x="154" y="138" text-anchor="middle" font-size="11" fill="#25262b">DOM events, hover</text>
<text x="154" y="176" text-anchor="middle" font-size="11" fill="#25262b">URL routing</text>
<text x="154" y="214" text-anchor="middle" font-size="11" fill="#25262b">SEO and SSR</text>
<text x="154" y="248" text-anchor="middle" font-size="11" fill="#6b6e76">Right-click, window size</text>
<rect x="292" y="38" width="216" height="228" rx="12" fill="#25262b"/>
<text x="400" y="64" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">Shared core</text>
<g fill="#25262b" stroke="#6b6e76" stroke-width="1.2">
<rect x="312" y="80" width="176" height="30" rx="6"/>
<rect x="312" y="118" width="176" height="30" rx="6"/>
<rect x="312" y="156" width="176" height="30" rx="6"/>
<rect x="312" y="194" width="176" height="30" rx="6"/>
</g>
<text x="400" y="100" text-anchor="middle" font-size="11" fill="#ffffff">TypeScript types</text>
<text x="400" y="138" text-anchor="middle" font-size="11" fill="#ffffff">Zod schemas</text>
<text x="400" y="176" text-anchor="middle" font-size="11" fill="#ffffff">tRPC client</text>
<text x="400" y="214" text-anchor="middle" font-size="11" fill="#ffffff">Pure business logic</text>
<text x="400" y="248" text-anchor="middle" font-size="11" fill="#c4c6cd">Touches no DOM, no native APIs</text>
<rect x="540" y="38" width="212" height="228" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="646" y="64" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Mobile only</text>
<g fill="#f4f5f7" stroke="#d6d8de" stroke-width="1.2">
<rect x="560" y="80" width="172" height="30" rx="6"/>
<rect x="560" y="118" width="172" height="30" rx="6"/>
<rect x="560" y="156" width="172" height="30" rx="6"/>
<rect x="560" y="194" width="172" height="30" rx="6"/>
</g>
<text x="646" y="100" text-anchor="middle" font-size="11" fill="#25262b">StyleSheet styles</text>
<text x="646" y="138" text-anchor="middle" font-size="11" fill="#25262b">Gestures, haptics</text>
<text x="646" y="176" text-anchor="middle" font-size="11" fill="#25262b">Stack navigation</text>
<text x="646" y="214" text-anchor="middle" font-size="11" fill="#25262b">Push · camera · perms</text>
<text x="646" y="248" text-anchor="middle" font-size="11" fill="#6b6e76">Safe areas, keyboard, background</text>
<text x="400" y="296" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Rule of thumb: 30–40% of the code is shareable, and it is usually the buggiest 30%</text>
<text x="400" y="320" text-anchor="middle" font-size="11" fill="#6b6e76">Sharing UI components is a trap — short of going all-in on Tamagui, the abstraction costs more than writing each side once</text>
</svg>
<figcaption>Figure 7: The reuse boundary. What's shared is logic, not interface. Money arithmetic, permission checks and date handling will drift if written twice; layout written twice is simply cheaper.</figcaption>
</figure>

This is also why there's no `packages/ui` in Figure 1. Sharing UI across platforms needs an abstraction that unifies `div` with `View` and CSS with StyleSheet, and **Tamagui is the best current answer** — it extracts styles at compile time, emitting CSS on web and StyleSheet on native, with very little runtime cost.

But it charges for that: your entire UI layer has to be written in its primitives, which means giving up shadcn/ui wholesale. So my rule is — if web and app are two shells over one product with near-identical screens, unify on Tamagui. If the two sides have genuinely different information architectures (much more common in practice), write each separately and share only logic.

Expo is barely a debate at this point. It absorbs native builds, signing, OTA updates and dev clients — the parts that consume the most human time. Unless you need a native SDK that resists config plugins entirely, there's no reason to run bare React Native CLI.

## Tooling: what a monorepo costs

<figure class="diagram">
<svg viewBox="0 0 800 386" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Turborepo repository structure and dependency direction">
<defs>
<marker id="rfe-a4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<text x="48" y="22" font-size="11" fill="#6b6e76" font-weight="600">Dependencies point downward only; a reverse import is how this structure usually breaks</text>
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
<line x1="154" y1="82" x2="154" y2="128" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a4)"/>
<line x1="400" y1="82" x2="400" y2="128" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a4)"/>
<line x1="646" y1="82" x2="646" y2="128" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a4)"/>
<line x1="154" y1="105" x2="646" y2="105" stroke="#e2e3e7" stroke-width="1.2"/>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="48" y="134" width="212" height="52" rx="10"/>
<rect x="294" y="134" width="212" height="52" rx="10"/>
<rect x="540" y="134" width="212" height="52" rx="10"/>
</g>
<text x="154" y="156" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">packages/api</text>
<text x="154" y="174" text-anchor="middle" font-size="11" fill="#6b6e76">tRPC client and procedures</text>
<text x="400" y="156" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">packages/core</text>
<text x="400" y="174" text-anchor="middle" font-size="11" fill="#6b6e76">Pure logic, no side effects</text>
<text x="646" y="156" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">packages/ui-web</text>
<text x="646" y="174" text-anchor="middle" font-size="11" fill="#6b6e76">Web and desktop only</text>
<line x1="154" y1="186" x2="154" y2="228" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a4)"/>
<line x1="400" y1="186" x2="400" y2="228" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a4)"/>
<line x1="646" y1="186" x2="646" y2="228" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#rfe-a4)"/>
<line x1="154" y1="208" x2="646" y2="208" stroke="#e2e3e7" stroke-width="1.2"/>
<rect x="48" y="234" width="704" height="52" rx="10" fill="#f4f5f7" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="256" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">packages/types　·　packages/schema</text>
<text x="400" y="274" text-anchor="middle" font-size="11" fill="#6b6e76">Bottom layer, depends on nothing — so one change invalidates every cache in the repo</text>
<rect x="48" y="300" width="704" height="44" rx="10" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="400" y="327" text-anchor="middle" font-size="12" fill="#6b6e76">tooling/　eslint-config · tsconfig · tailwind-preset　　pnpm workspace + Turborepo task cache</text>
<text x="400" y="370" text-anchor="middle" font-size="11" fill="#6b6e76">Change one app and only that app rebuilds; change types at the bottom and everything downstream reruns</text>
</svg>
<figcaption>Figure 8: Turborepo structure. The first rule of splitting packages is to keep the dependency graph acyclic and shallow — finer packages mean better cache hit rates and more configuration to maintain.</figcaption>
</figure>

Turborepo's central value is **task-level caching**: touch `apps/mobile` and the build and tests for `apps/web` are skipped outright. On CI the difference is stark — a five-minute full pipeline routinely drops to tens of seconds.

But a monorepo isn't free. You pay in package boundaries that have to be right the first time (refactoring them later hurts), slower IDE indexing, dependency versions that need central management, and a steeper on-ramp for new people. **With only one app, don't do it.** Split when the second delivery target actually exists, by which point you'll know from evidence rather than guesswork what deserves sharing.

One rule about package layout: `packages/types` and `packages/schema` must sit at the bottom and depend on nothing. They change least often, and the moment they depend on something above them, your caching strategy degrades into "any change rebuilds everything".

## Auth and deployment

For auth, the real difference between the two options is **who holds the user table**:

| | Supabase Auth | Clerk |
|-|-|-|
| User data | In your own Postgres | On Clerk's side, synced by webhook |
| Linking to business tables | Direct foreign keys, RLS available | Store an external ID, sync it yourself |
| Prebuilt UI | Build it yourself | Comprehensive, wired up in a few lines |
| Organisations, multi-tenancy | Implement it yourself | Built in |
| Cost of leaving | Low — the data is already yours | Higher |

**If you're already on a Supabase database, use Supabase Auth** — being able to drop `auth.uid()` straight into an RLS policy is hard to give up. Conversely, if the product needs B2B multi-tenancy with organisations and member invitations, what Clerk gives you for free is substantial.

Deployment holds few surprises: Vercel for web (a number of Next.js features need extra configuration to match elsewhere); Supabase or Neon for the database (branching is genuinely useful for preview environments); and Docker plus GitHub Actions onto your own machines for anything long-running, worker-shaped, or subject to data-residency rules.

Worth adding: if your project is a purely static site, none of this applies. GitHub Actions building into GitHub Pages is sufficient, at zero cost and zero operations. That's exactly how this blog runs.

## How to choose

<figure class="diagram">
<svg viewBox="0 0 800 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A decision ladder for choosing a stack combination by product shape">
<defs>
<marker id="rfe-a5" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<text x="48" y="24" font-size="11" fill="#6b6e76" font-weight="600">Work down the list; every yes adds one layer to the stack</text>
<rect x="48" y="36" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="60" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Does the value come from data density, not design?</text>
<text x="238" y="79" text-anchor="middle" font-size="11" fill="#6b6e76">Tables, forms, approval flows, permission matrices</text>
<line x1="428" y1="64" x2="468" y2="64" stroke="#25262b" stroke-width="1.8" marker-end="url(#rfe-a5)"/>
<rect x="476" y="36" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="60" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">React + Ant Design Pro</text>
<text x="614" y="79" text-anchor="middle" font-size="11" fill="#c4c6cd">Stop here; skip what follows</text>
<rect x="48" y="108" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="132" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Need SEO, link previews, or server rendering?</text>
<text x="238" y="151" text-anchor="middle" font-size="11" fill="#6b6e76">Almost every public-facing product does</text>
<line x1="428" y1="136" x2="468" y2="136" stroke="#25262b" stroke-width="1.8" marker-end="url(#rfe-a5)"/>
<rect x="476" y="108" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="132" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Next.js + shadcn/ui</text>
<text x="614" y="151" text-anchor="middle" font-size="11" fill="#c4c6cd">Otherwise Vite + React Router</text>
<rect x="48" y="180" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="204" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Read local files, or keep running in the background?</text>
<text x="238" y="223" text-anchor="middle" font-size="11" fill="#6b6e76">Dev tools, AI clients, local-first apps</text>
<line x1="428" y1="208" x2="468" y2="208" stroke="#25262b" stroke-width="1.8" marker-end="url(#rfe-a5)"/>
<rect x="476" y="180" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="204" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Add Tauri 2</text>
<text x="614" y="223" text-anchor="middle" font-size="11" fill="#c4c6cd">Native npm modules? Electron</text>
<rect x="48" y="252" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="276" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Need push, camera, offline — real mobile capability?</text>
<text x="238" y="295" text-anchor="middle" font-size="11" fill="#6b6e76">Note: merely opening on a phone does not count; a PWA does that</text>
<line x1="428" y1="280" x2="468" y2="280" stroke="#25262b" stroke-width="1.8" marker-end="url(#rfe-a5)"/>
<rect x="476" y="252" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="276" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Add Expo</text>
<text x="614" y="295" text-anchor="middle" font-size="11" fill="#c4c6cd">And move logic into packages/</text>
<rect x="48" y="324" width="380" height="56" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="238" y="348" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">More than two clients, or a team beyond ten?</text>
<text x="238" y="367" text-anchor="middle" font-size="11" fill="#6b6e76">Or background work that HTTP never triggers</text>
<line x1="428" y1="352" x2="468" y2="352" stroke="#25262b" stroke-width="1.8" marker-end="url(#rfe-a5)"/>
<rect x="476" y="324" width="276" height="56" rx="10" fill="#25262b"/>
<text x="614" y="348" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">Split out NestJS + Turborepo</text>
<text x="614" y="367" text-anchor="middle" font-size="11" fill="#c4c6cd">Otherwise one Next.js repo holds</text>
<text x="400" y="406" text-anchor="middle" font-size="11" fill="#6b6e76">All no is a perfectly good outcome — it means what you need is Vite and a static host</text>
</svg>
<figcaption>Figure 9: The decision ladder. Its purpose isn't to hand you a single answer but to make explicit which concrete requirement bought each layer of complexity.</figcaption>
</figure>

As a table:

| Scenario | Combination |
|-|-|
| AI SaaS, consumer-facing products | Next.js + shadcn/ui + Appica UI + Supabase |
| Startup MVP, validation stage | Next.js + Prisma + Supabase, no packages yet |
| Enterprise back office, internal systems | React + Ant Design Pro + NestJS |
| Marketing sites, landing pages | Next.js + React Bits + Framer Motion |
| Desktop tools, AI clients | Tauri 2 + React + Vite |
| Mobile app | Expo + React Native + Reanimated |
| Multi-target product, larger team | Turborepo + Next.js + NestJS + Expo |
| Personal blog, documentation | Vite or Astro + static hosting |

## My default

If I were starting a new SaaS product today, this is the opening move:

```
Next.js · React 19 · TypeScript
Tailwind CSS + shadcn/ui (foundation) + Appica UI (gap filler)
TanStack Query (server state) + Zustand (client state)
React Hook Form + Zod (one schema, three uses)
Server Actions + Prisma + Supabase PostgreSQL
Deployed on Vercel, checks on GitHub Actions
```

Note what is **absent**: no Turborepo, no NestJS, no tRPC, no Tauri, no Expo. Every one of them is something to add later, on evidence. Putting them on the table at the start only slows you down.

That point matters more than the checklist itself. The diagrams above draw the **finished state**, not the starting position. A real project should begin at the smallest of those shapes and add a layer only when a specific pain arrives — a second client, background work, slow builds, a growing team.

For each layer you add, you should be able to name the problem that bought it. If you can't, that's premature complexity.
