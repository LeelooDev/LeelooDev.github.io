---
title: Pi Agent Harness 源码拆解：从一次输入到模型、工具、会话树与终端渲染
date: 2026-08-04T10:00:00
category: code
tags: [Agent, Coding Agent, TypeScript, 源码解析, LLM, 架构]
cover: /images/pi-agent-harness-cover.jpg
coverAlt: 浮世绘版画风格的宇宙插画：漆黑夜空中一轮暗红色天体迸发出密集的放射状光线，下方是层层堆叠的白色云海与深色山脊，左侧掠过两道金色的行星环弧线
excerpt: 沿着源码把 Pi 走一遍：九个工作区包怎样分工、Agent Loop 的双层循环在解决什么、工具调用的九步流水线、追加式会话树与上下文投影，以及低闪烁终端渲染。十张图，一条从输入到落盘的完整路径。
dek: Pi 的架构脊柱不是 CLI，也不是某个模型 SDK，而是「可序列化消息 + 流式事件 + 可注入边界」。
---

> 解析仓库：[earendil-works/pi](https://github.com/earendil-works/pi) ｜ 源码快照：`main` 分支提交 [`04133eb`](https://github.com/earendil-works/pi/tree/04133eb01b082248f7d667c1214e09477a1c3db1) ｜ 仓库版本 `0.83.0` ｜ 解析日期 2026-08-04

第一次看 Pi，很容易把它理解成一个终端里的 AI 编程助手：输入问题，模型输出文本，必要时调用 `read`、`bash`、`edit`、`write`。

但沿着源码真正走一遍，会发现它更像一套分层清楚的 Agent Harness：`pi-ai` 把不同厂商的模型、认证、流式事件和消息格式统一起来；`pi-agent-core` 只负责 Agent 状态、模型—工具循环、消息队列和生命周期事件；`pi-coding-agent` 把项目上下文、技能、扩展、会话、压缩、重试和编码工具装配在一起；`pi-tui` 把事件流转换成低闪烁的终端界面；新的 `protocol`／`client`／`server`／`storage` 包正在把本地进程内 Agent 演进为可远程连接、可持久化的会话服务。

Pi 最有学习价值的地方，是它没有把所有能力塞进一个巨大的 `runAgent()` 函数。它把「领域消息」「模型协议」「Agent 循环」「应用会话」「展示层」和「远程传输」分开，使每层既能独立使用，又能通过稳定的事件和数据结构组合。

先给出全文最重要的一句话：

> Pi 的架构脊柱不是 CLI，也不是某个模型 SDK，而是「可序列化消息 + 流式事件 + 可注入边界」。

理解这三样，基本就理解了 Pi。这篇文章按数据流的方向走一遍：从一次命令行输入开始，穿过装配、内核、工具、会话、压缩、模型适配、扩展和渲染，最后落到正在演进的远程架构。

## 一、全局架构：九个工作区包怎样协作

仓库根目录是 npm workspaces monorepo。顶层 README 重点介绍四个稳定核心包，但当前源码实际还包含实验性远程架构与存储包。工作区可以分成三组：

| 层次 | 包 | 主要职责 |
|---|---|---|
| 模型与 Agent 内核 | `@earendil-works/pi-ai` | 多模型供应商、认证、统一消息、统一流式事件、费用与 token |
|  | `@earendil-works/pi-agent-core` | Agent 状态、模型—工具循环、steer/follow-up 队列、生命周期事件 |
| 本地编码应用 | `@earendil-works/pi-coding-agent` | CLI、会话、内置工具、扩展、技能、压缩、重试、RPC/打印/交互模式 |
|  | `@earendil-works/pi-tui` | 终端组件、布局、输入、Markdown、差分渲染、图片协议 |
| 远程会话架构 | `@earendil-works/pi-protocol` | 严格 CBOR 编解码、长度帧、协议 Schema |
|  | `@earendil-works/pi-client` | 传输无关客户端、请求关联、会话 lease、权威快照 |
|  | `@earendil-works/pi-server` | 监听器、握手、命令分发、在线会话和快照广播 |
|  | `@earendil-works/pi-storage-sqlite-node` | SQLite 会话仓库、物化视图、迁移、全文搜索 |
| 评测 | `@earendil-works/pi-evals` | Agent/模型评测辅助代码 |

根 `package.json` 的构建顺序也揭示了依赖方向：先构建 TUI 和 AI，再构建 Agent、存储、协议、客户端、Coding Agent，最后构建 Server。参见[根工作区配置](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/package.json)。

<figure class="diagram">
<svg viewBox="0 0 800 562" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pi 的分层架构：调用方经过 coding-agent 应用层、agent-core 内核层、pi-ai 模型层到达外部 API，右侧是 pi-tui 事件消费者与演进中的远程会话架构">
<defs>
<marker id="pi-a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
<marker id="pi-a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<text x="48" y="22" font-size="11" fill="#6b6e76" font-weight="600">本地进程内 · 一次输入穿过的五层</text>
<text x="528" y="22" font-size="11" fill="#6b6e76" font-weight="600">同一份事件的其他消费者</text>
<rect x="48" y="32" width="456" height="44" rx="10" fill="#25262b"/>
<text x="276" y="60" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="600">调用方 · pi CLI 或嵌入式 SDK</text>
<line x1="276" y1="76" x2="276" y2="100" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<rect x="48" y="106" width="456" height="108" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="130" font-size="11" fill="#6b6e76" font-weight="600">pi-coding-agent · 应用编排层</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="64" y="140" width="100" height="58" rx="8"/>
<rect x="172" y="140" width="100" height="58" rx="8"/>
<rect x="280" y="140" width="100" height="58" rx="8"/>
<rect x="388" y="140" width="100" height="58" rx="8"/>
</g>
<text x="114" y="164" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">AgentSession</text>
<text x="114" y="182" text-anchor="middle" font-size="10.5" fill="#6b6e76">编排副作用</text>
<text x="222" y="164" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">Session</text>
<text x="222" y="182" text-anchor="middle" font-size="10.5" fill="#6b6e76">JSONL 会话树</text>
<text x="330" y="164" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">Extensions</text>
<text x="330" y="182" text-anchor="middle" font-size="10.5" fill="#6b6e76">钩子与技能</text>
<text x="438" y="164" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">Compaction</text>
<text x="438" y="182" text-anchor="middle" font-size="10.5" fill="#6b6e76">上下文压缩</text>
<line x1="276" y1="214" x2="276" y2="238" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<rect x="48" y="244" width="456" height="92" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="268" font-size="11" fill="#6b6e76" font-weight="600">pi-agent-core · 通用内核，不知道文件、终端和设置</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="64" y="278" width="208" height="42" rx="8"/>
<rect x="280" y="278" width="208" height="42" rx="8"/>
</g>
<text x="168" y="304" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">Agent 状态容器</text>
<text x="384" y="304" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">agentLoop 模型—工具循环</text>
<line x1="276" y1="336" x2="276" y2="360" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<rect x="48" y="366" width="456" height="92" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="390" font-size="11" fill="#6b6e76" font-weight="600">pi-ai · 模型协议层</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="64" y="400" width="136" height="42" rx="8"/>
<rect x="208" y="400" width="136" height="42" rx="8"/>
<rect x="352" y="400" width="136" height="42" rx="8"/>
</g>
<text x="132" y="426" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Models 路由</text>
<text x="276" y="426" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">Provider 认证</text>
<text x="420" y="426" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">统一消息与事件</text>
<line x1="276" y1="458" x2="276" y2="482" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<rect x="48" y="488" width="456" height="40" rx="10" fill="#25262b"/>
<text x="276" y="513" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">Anthropic · OpenAI · Google · OpenRouter · Copilot</text>
<line x1="504" y1="160" x2="526" y2="160" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<path d="M504 190 H514 V300 H526" fill="none" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 5" marker-end="url(#pi-a1)"/>
<rect x="528" y="106" width="224" height="108" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="544" y="130" font-size="11" fill="#6b6e76" font-weight="600">pi-tui 与四种运行模式</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="544" y="140" width="96" height="26" rx="6"/>
<rect x="648" y="140" width="88" height="26" rx="6"/>
<rect x="544" y="172" width="96" height="26" rx="6"/>
<rect x="648" y="172" width="88" height="26" rx="6"/>
</g>
<text x="592" y="157" text-anchor="middle" font-size="11" fill="#25262b">交互 TUI</text>
<text x="692" y="157" text-anchor="middle" font-size="11" fill="#25262b">print</text>
<text x="592" y="189" text-anchor="middle" font-size="11" fill="#25262b">JSON 事件流</text>
<text x="692" y="189" text-anchor="middle" font-size="11" fill="#25262b">RPC</text>
<rect x="528" y="244" width="224" height="284" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="544" y="268" font-size="11" fill="#6b6e76" font-weight="600">远程会话架构 · 演进中</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="544" y="280" width="192" height="46" rx="8"/>
<rect x="544" y="334" width="192" height="46" rx="8"/>
<rect x="544" y="388" width="192" height="46" rx="8"/>
<rect x="544" y="442" width="192" height="46" rx="8"/>
</g>
<text x="640" y="299" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">pi-protocol</text>
<text x="640" y="315" text-anchor="middle" font-size="10.5" fill="#6b6e76">CBOR + 长度帧</text>
<text x="640" y="353" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">pi-client</text>
<text x="640" y="369" text-anchor="middle" font-size="10.5" fill="#6b6e76">会话 lease 与权威快照</text>
<text x="640" y="407" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">pi-server</text>
<text x="640" y="423" text-anchor="middle" font-size="10.5" fill="#6b6e76">握手与命令分发</text>
<text x="640" y="461" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">storage-sqlite-node</text>
<text x="640" y="477" text-anchor="middle" font-size="10.5" fill="#6b6e76">仓库、迁移、全文搜索</text>
<text x="640" y="510" text-anchor="middle" font-size="10.5" fill="#6b6e76">尚未接管本地 CLI</text>
<text x="400" y="552" text-anchor="middle" font-size="11" fill="#6b6e76">构建顺序即依赖方向：tui → ai → agent → storage/protocol/client → coding-agent → server</text>
</svg>
<figcaption>图 1：全局架构。左边这条竖线是一次输入的必经之路，右边两块都只是同一份事件的消费者——新增界面不需要动 Agent Loop。</figcaption>
</figure>

这里要先区分两个名字很接近的类型：

- `Agent` 是通用状态容器，完全不知道「文件编辑」「项目设置」或「TUI」；
- `AgentSession` 是 Coding Agent 的应用编排层，把 `Agent`、会话持久化、扩展、工具、压缩与重试连接起来。

这是阅读源码时最容易混淆、也是最重要的边界。

## 二、一次命令怎样启动：CLI 只做装配，不承担核心业务

CLI 入口 [`packages/coding-agent/src/cli.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/cli.ts#L1-L21) 很薄：设置进程标题和环境变量，提前配置 HTTP dispatcher，然后把命令行参数交给 `main()`。

真正的启动编排位于 [`main.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/main.ts#L528-L930)。

<figure class="diagram">
<svg viewBox="0 0 800 484" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="main 函数的启动编排顺序：解析参数、判定模式、迁移配置、确定会话 cwd、项目信任、按 cwd 创建服务、解析模型与工具、创建运行时，最后分流到四种模式">
<text x="400" y="24" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">main() 的启动编排 · 深色两步决定了后面所有服务的正确性</text>
<line x1="124" y1="44" x2="124" y2="372" stroke="#c4c6cd" stroke-width="1.5"/>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="140" y="44" width="520" height="34" rx="8"/>
<rect x="140" y="86" width="520" height="34" rx="8"/>
<rect x="140" y="128" width="520" height="34" rx="8"/>
<rect x="140" y="212" width="520" height="34" rx="8"/>
<rect x="140" y="296" width="520" height="34" rx="8"/>
<rect x="140" y="338" width="520" height="34" rx="8"/>
</g>
<g fill="#25262b">
<rect x="140" y="170" width="520" height="34" rx="8"/>
<rect x="140" y="254" width="520" height="34" rx="8"/>
</g>
<text x="158" y="66" font-size="11" fill="#6b6e76" font-weight="600">1</text>
<text x="186" y="66" font-size="12.5" fill="#25262b">parseArgs 解析命令行参数</text>
<text x="158" y="108" font-size="11" fill="#6b6e76" font-weight="600">2</text>
<text x="186" y="108" font-size="12.5" fill="#25262b">resolveAppMode 判定 interactive / print / json / rpc</text>
<text x="158" y="150" font-size="11" fill="#6b6e76" font-weight="600">3</text>
<text x="186" y="150" font-size="12.5" fill="#25262b">迁移旧版配置</text>
<text x="158" y="192" font-size="11" fill="#ffffff" font-weight="600">4</text>
<text x="186" y="192" font-size="12.5" fill="#ffffff" font-weight="600">选择 / 新建 / 恢复 / fork 会话 → 确定最终会话 cwd</text>
<text x="158" y="234" font-size="11" fill="#6b6e76" font-weight="600">5</text>
<text x="186" y="234" font-size="12.5" fill="#25262b">项目信任判断</text>
<text x="158" y="276" font-size="11" fill="#ffffff" font-weight="600">6</text>
<text x="186" y="276" font-size="12.5" fill="#ffffff" font-weight="600">按最终 cwd 创建 Settings / Models / Resources</text>
<text x="158" y="318" font-size="11" fill="#6b6e76" font-weight="600">7</text>
<text x="186" y="318" font-size="12.5" fill="#25262b">解析模型、思考等级与工具集合</text>
<text x="158" y="360" font-size="11" fill="#6b6e76" font-weight="600">8</text>
<text x="186" y="360" font-size="12.5" fill="#25262b">创建 AgentSessionRuntime</text>
<line x1="400" y1="372" x2="400" y2="386" stroke="#c4c6cd" stroke-width="1.5"/>
<line x1="202" y1="386" x2="598" y2="386" stroke="#c4c6cd" stroke-width="1.5"/>
<line x1="202" y1="386" x2="202" y2="400" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a2)"/>
<line x1="334" y1="386" x2="334" y2="400" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a2)"/>
<line x1="466" y1="386" x2="466" y2="400" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a2)"/>
<line x1="598" y1="386" x2="598" y2="400" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a2)"/>
<g fill="#25262b">
<rect x="140" y="402" width="124" height="48" rx="10"/>
<rect x="272" y="402" width="124" height="48" rx="10"/>
<rect x="404" y="402" width="124" height="48" rx="10"/>
<rect x="536" y="402" width="124" height="48" rx="10"/>
</g>
<text x="202" y="424" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">interactive</text>
<text x="202" y="441" text-anchor="middle" font-size="10.5" fill="#c4c6cd">TUI 交互</text>
<text x="334" y="424" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">print</text>
<text x="334" y="441" text-anchor="middle" font-size="10.5" fill="#c4c6cd">单次输出</text>
<text x="466" y="424" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">json</text>
<text x="466" y="441" text-anchor="middle" font-size="10.5" fill="#c4c6cd">事件流</text>
<text x="598" y="424" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">rpc</text>
<text x="598" y="441" text-anchor="middle" font-size="10.5" fill="#c4c6cd">stdin / stdout</text>
<text x="400" y="472" text-anchor="middle" font-size="11" fill="#6b6e76">四种模式共享同一个 AgentSessionRuntime，Agent 逻辑只有一份</text>
</svg>
<figcaption>图 2：启动编排。模式在第 2 步就判定，但分流发生在第 8 步之后——中间六步四种模式完全一样。</figcaption>
</figure>

### 2.1 模式选择不是单看一个参数

`resolveAppMode()` 同时考虑显式 `--mode`、`--print`、stdin 是否是 TTY、stdout 是否是 TTY：显式 RPC 优先，显式 JSON 其次，`--print`、管道输入或重定向输出会进入单次打印模式，只有 stdin/stdout 都是终端时才进入交互模式。

这使以下调用自然落到不同通道：

```bash
pi                         # interactive
pi -p "解释这个仓库"       # print
cat error.log | pi -p      # print，读取管道
pi --mode json "检查代码"  # JSON 事件流
pi --mode rpc              # stdin/stdout RPC
```

相关判断见 [`main.ts:109-124`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/main.ts#L109-L124)。

### 2.2 为什么先确定会话 cwd，再创建运行时

Pi 的设置、扩展、技能、`AGENTS.md` 和模型注册都可能是项目级的。因此，恢复其他项目的会话时，不能先按当前 shell 的 cwd 加载所有资源，再跳到旧会话目录。

`main()` 先通过 `SessionManager` 确定最终会话 cwd，再创建绑定到该 cwd 的服务。源码注释明确说明：`--session` 和 `--resume` 可能选择另一个项目，项目资源必须在目标 cwd 确定后解析。参见 [`main.ts:627-650`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/main.ts#L627-L650)。

这是很实用的工程经验：

> 任何会被「工作目录」影响的服务，都应在最终工作目录确定之后创建。

否则恢复会话时极容易出现「模型来自 A 项目、工具在 B 项目执行、规则又从 C 目录加载」的混合状态。

### 2.3 运行模式共享同一个会话核心

模式分流发生在运行时已经创建之后：RPC 调 `runRpcMode(runtime)`，交互模式创建 `InteractiveMode(runtime, options)`，print/json 调 `runPrintMode(runtime, options)`。

也就是说，TUI、JSON 输出和 RPC 并没有各写一套 Agent 逻辑；它们只是同一个 `AgentSessionRuntime` 的不同消费者。这是 Pi 能保持行为一致的重要原因。

## 三、SDK 装配：怎样从配置得到一个可运行的 AgentSession

核心工厂是 [`createAgentSession()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/sdk.ts#L169-L398)。它做了六件关键事情。

### 3.1 创建四类基础服务

`ModelRuntime` 负责模型目录、认证和流式请求；`SettingsManager` 管全局与项目设置；`SessionManager` 管会话树与 JSONL 持久化；`ResourceLoader` 负责扩展、技能、模板、主题和上下文文件。

四者调用者都可以传入自定义实现，也可以使用默认实现。这使 `createAgentSession()` 同时适用于 CLI 和嵌入式 SDK。

### 3.2 恢复模型与思考等级

如果会话已有数据，工厂优先恢复会话中记录的 provider/model 和 thinking level；恢复失败才退到设置默认值或第一个可用模型。思考等级还会通过 `clampThinkingLevel()` 收敛到模型真实支持的范围。参见 [`sdk.ts:187-243`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/sdk.ts#L187-L243)。

设计上的好处是：会话可以跨进程恢复；模型被移除时能优雅回退；UI 里的 thinking 配置不会向不支持的模型发送非法值。

### 3.3 默认只启用四个编码工具

源码把默认活跃工具设为：

```ts
["read", "bash", "edit", "write"]
```

`grep`、`find`、`ls` 也内置，但不是默认集合，因为 `bash` 已可承载 `rg`、`find` 和 `ls`。调用者仍可使用 allowlist、denylist 或 `noTools` 精确控制。参见 [`sdk.ts:245-251`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/sdk.ts#L245-L251) 和[工具注册表](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/tools/index.ts#L81-L195)。

### 3.4 在 LLM 边界前转换应用消息

`Agent` 内部允许存在 UI 专用、扩展专用消息；模型只认识 `user`、`assistant`、`toolResult`。因此创建 Agent 时注入 `convertToLlm`，在每次模型请求前完成过滤与转换。

Pi 还在这个边界做了图片阻断：如果动态设置禁止图片，就把消息中的图片替换为文本占位。这是很好的「最后一道防线」思路——不要只在用户输入入口过滤，还要在真正发给模型之前再保证一次。参见 [`sdk.ts:255-290`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/sdk.ts#L255-L290)。

### 3.5 注入而不是硬编码模型调用

创建 `Agent` 时传入 `streamFn`。该函数再调用 `modelRuntime.streamSimple()`，同时叠加 HTTP/WebSocket 超时、provider 重试设置、会话标识、provider attribution headers，以及扩展的请求头、请求体、响应钩子。代码见 [`sdk.ts:294-360`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/sdk.ts#L294-L360)。

因此 `pi-agent-core` 根本不需要依赖任何具体供应商，也不需要知道 API Key 存在哪里。

### 3.6 最后才创建 AgentSession

`Agent` 创建完成并恢复消息后，才包进 `AgentSession`。后者获得设置、会话、资源加载器、扩展引用和工具策略，成为 Coding Agent 的高层运行对象。这一装配顺序可以概括为：基础服务 → 恢复状态 → 创建通用 Agent → 注入边界函数 → 创建应用 AgentSession。

## 四、Agent 内核：一个状态机，而不是一个「智能对象」

[`Agent`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent.ts#L167-L238) 的职责很克制：保存 `systemPrompt`、`model`、`thinkingLevel`、`tools`、`messages`；管理一次活动运行的 `AbortController`；管理 steering 和 follow-up 两个队列；调用低层 Agent Loop；根据事件归约内部状态；按订阅顺序等待事件监听器。

它不知道 cwd、文件、终端、JSONL、扩展目录或设置文件。

### 4.1 状态为什么使用快照数组

`Agent` 在接收 `tools` 和 `messages` 数组时复制顶层数组，在开始一次运行时也创建 context snapshot。参见 [`agent.ts:68-95`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent.ts#L68-L95) 和 [`agent.ts:433-479`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent.ts#L433-L479)。

这避免调用方在 Agent 运行中原地替换外部数组，导致当前循环的上下文突然变化。注意这只是浅复制：消息对象本身仍可能被高层有意替换或修正。

### 4.2 两种排队消息语义完全不同

Pi 明确区分 `steer`（当前 assistant turn 和工具批次完成后、下一次模型调用前注入）和 `followUp`（Agent 原本准备结束时才注入）。两类队列都支持 `all` 或 `one-at-a-time` 消费模式，实现在 [`PendingMessageQueue`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent.ts#L125-L159)。

这不是 UI 小功能，而是 Agent 交互语义：用户发现方向不对，用 steer 改变下一步；用户追加另一个独立任务，用 follow-up 等当前任务自然完成。

### 4.3 `agent_end` 不等于已经空闲

`Agent.subscribe()` 的监听器会按注册顺序逐个 `await`。`agent_end` 是最后一个循环事件，但只有所有监听器处理完，`finishRun()` 才会把 `isStreaming` 清掉并解析 `waitForIdle()`。

这是为了把持久化、扩展处理等异步副作用也纳入「一次运行完成」的定义。相关约定见 [`agent.ts:240-249`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent.ts#L240-L249) 与 [`agent.ts:482-538`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent.ts#L482-L538)。

这是一个容易被忽略的可靠性细节：如果「运行结束」只代表模型流结束，下一条输入可能在上一轮会话还没落盘时开始。

## 五、最核心的源码：Agent Loop 如何运转

Agent Loop 位于 [`packages/agent/src/agent-loop.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts)。它可以脱离 Coding Agent 单独使用。先把其逻辑压缩成伪代码：

```ts
emit(agent_start)
emit(turn_start)
emit(initial user messages)

while (true) {                       // follow-up 外层循环
  while (hasToolCalls || hasSteer) { // tool/steer 内层循环
    injectPendingMessages()
    assistant = await streamModel()

    if (assistant errored or aborted) return end()

    toolCalls = assistant.toolCalls
    toolResults = await execute(toolCalls)
    append(toolResults)
    emit(turn_end)

    refreshContextModelAndTools()
    if (shouldStopAfterTurn()) return end()
    pending = drainSteering()
  }

  pending = drainFollowUp()
  if (!pending.length) break
}

emit(agent_end)
```

### 5.1 为什么是内外两层循环

<figure class="diagram">
<svg viewBox="0 0 800 460" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Agent Loop 的两层循环：内层在有工具调用或 steering 时回到注入步骤，外层在 follow-up 队列非空时回到同一步骤">
<text x="400" y="26" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">两条回边都回到同一个入口，区别只在于「什么时候允许回」</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="220" y="48" width="360" height="40" rx="9"/>
<rect x="220" y="104" width="360" height="40" rx="9"/>
<rect x="220" y="160" width="360" height="40" rx="9"/>
<rect x="220" y="216" width="360" height="40" rx="9"/>
</g>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="220" y="272" width="360" height="40" rx="9"/>
<rect x="220" y="328" width="360" height="40" rx="9"/>
</g>
<rect x="220" y="384" width="360" height="40" rx="9" fill="#25262b"/>
<text x="400" y="73" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">injectPendingMessages()</text>
<text x="400" y="129" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">streamModel() → assistant 消息</text>
<text x="400" y="185" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">执行工具调用 → toolResult</text>
<text x="400" y="241" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">turn_end · 刷新上下文、模型与工具</text>
<text x="400" y="297" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">还有 toolCall 或 steering 吗？</text>
<text x="400" y="353" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">drainFollowUp()：队列里还有消息吗？</text>
<text x="400" y="409" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">agent_end</text>
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="400" y1="88" x2="400" y2="102" marker-end="url(#pi-a1)"/>
<line x1="400" y1="144" x2="400" y2="158" marker-end="url(#pi-a1)"/>
<line x1="400" y1="200" x2="400" y2="214" marker-end="url(#pi-a1)"/>
<line x1="400" y1="256" x2="400" y2="270" marker-end="url(#pi-a1)"/>
<line x1="400" y1="312" x2="400" y2="326" marker-end="url(#pi-a1)"/>
<line x1="400" y1="368" x2="400" y2="382" marker-end="url(#pi-a1)"/>
</g>
<path d="M220 292 H140 V68 H214" fill="none" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<path d="M580 348 H664 V68 H586" fill="none" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<text x="120" y="196" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600" transform="rotate(-90 120 196)">内层 · 工具与 steering</text>
<text x="686" y="208" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600" transform="rotate(-90 686 208)">外层 · follow-up</text>
<text x="182" y="286" text-anchor="middle" font-size="11" fill="#6b6e76">是</text>
<text x="416" y="324" font-size="11" fill="#6b6e76">否</text>
<text x="622" y="342" text-anchor="middle" font-size="11" fill="#6b6e76">是</text>
<text x="416" y="380" font-size="11" fill="#6b6e76">否</text>
<text x="400" y="448" text-anchor="middle" font-size="11" fill="#6b6e76">只用一个 while (toolCalls.length) 就没法同时表达「立刻改方向」和「全部做完再追加」</text>
</svg>
<figcaption>图 3：双层循环。内层继续处理模型产生的工具调用和 steering，外层在 Agent 将要结束时才检查 follow-up——两条回边的优先级差别就是这两种交互语义的差别。</figcaption>
</figure>

### 5.2 一轮 turn 的准确定义

在 Pi 中，一轮 turn 是「一次 assistant 响应 + 该响应发起的全部工具调用及结果」。所以事件序列通常是这样：

<figure class="diagram">
<svg viewBox="0 0 800 362" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="一轮 turn 的事件序列：turn_start、assistant 消息的 start/update/end、工具执行事件、toolResult 消息，最后 turn_end">
<line x1="110" y1="48" x2="110" y2="320" stroke="#c4c6cd" stroke-width="1.5"/>
<g fill="#9a9da6">
<circle cx="110" cy="64" r="4"/>
<circle cx="110" cy="104" r="4"/>
<circle cx="110" cy="144" r="4"/>
<circle cx="110" cy="184" r="4"/>
<circle cx="110" cy="224" r="4"/>
<circle cx="110" cy="264" r="4"/>
<circle cx="110" cy="304" r="4"/>
</g>
<rect x="130" y="48" width="560" height="32" rx="8" fill="#25262b"/>
<text x="146" y="69" font-size="12.5" fill="#ffffff" font-weight="600">turn_start</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="154" y="88" width="536" height="32" rx="8"/>
<rect x="154" y="128" width="536" height="32" rx="8"/>
<rect x="154" y="168" width="536" height="32" rx="8"/>
<rect x="154" y="208" width="536" height="32" rx="8"/>
<rect x="154" y="248" width="536" height="32" rx="8"/>
</g>
<text x="170" y="109" font-size="12.5" fill="#25262b">message_start(assistant)</text>
<text x="674" y="109" text-anchor="end" font-size="10.5" fill="#6b6e76">partial 消息先进上下文</text>
<text x="170" y="149" font-size="12.5" fill="#25262b">message_update × N</text>
<text x="674" y="149" text-anchor="end" font-size="10.5" fill="#6b6e76">文本 / thinking / toolCall 参数增量</text>
<text x="170" y="189" font-size="12.5" fill="#25262b">message_end(assistant)</text>
<text x="674" y="189" text-anchor="end" font-size="10.5" fill="#6b6e76">用最终消息替换 partial</text>
<text x="170" y="229" font-size="12.5" fill="#25262b">tool_execution_start / update / end × N</text>
<text x="674" y="229" text-anchor="end" font-size="10.5" fill="#6b6e76">按真实完成顺序发出</text>
<text x="170" y="269" font-size="12.5" fill="#25262b">message_start / message_end(toolResult) × N</text>
<text x="674" y="269" text-anchor="end" font-size="10.5" fill="#6b6e76">按模型原始调用顺序写入</text>
<rect x="130" y="288" width="560" height="32" rx="8" fill="#25262b"/>
<text x="146" y="309" font-size="12.5" fill="#ffffff" font-weight="600">turn_end</text>
<text x="400" y="346" text-anchor="middle" font-size="11" fill="#6b6e76">如果工具结果需要模型继续回答，紧接着会再发一个 turn_start</text>
</svg>
<figcaption>图 4：一轮 turn 的事件序列。注意最后两组的顺序差别——事件按完成顺序发，消息按调用顺序写，这个区别在第六节展开。</figcaption>
</figure>

### 5.3 只在模型边界转换消息

Agent Loop 始终处理 `AgentMessage[]`。只有真正请求模型前，才执行两次转换：

<figure class="diagram">
<svg viewBox="0 0 800 298" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="消息在模型边界的投影：会话领域里的五类 AgentMessage 经过 transformContext 与 convertToLlm，只有三类 Message 到达供应商">
<rect x="48" y="56" width="272" height="200" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="80" font-size="11" fill="#6b6e76" font-weight="600">AgentMessage[] · 会话领域</text>
<rect x="64" y="92" width="240" height="26" rx="6" fill="#25262b"/>
<text x="184" y="110" text-anchor="middle" font-size="11.5" fill="#ffffff">user · assistant · toolResult</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="64" y="124" width="240" height="26" rx="6"/>
<rect x="64" y="156" width="240" height="26" rx="6"/>
<rect x="64" y="188" width="240" height="26" rx="6"/>
<rect x="64" y="220" width="240" height="26" rx="6"/>
</g>
<text x="184" y="142" text-anchor="middle" font-size="11.5" fill="#25262b">UI 专用消息</text>
<text x="184" y="174" text-anchor="middle" font-size="11.5" fill="#25262b">扩展自定义消息</text>
<text x="184" y="206" text-anchor="middle" font-size="11.5" fill="#25262b">压缩摘要 · 分支摘要</text>
<text x="184" y="238" text-anchor="middle" font-size="11.5" fill="#25262b">图片内容</text>
<line x1="320" y1="126" x2="342" y2="126" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<g fill="#25262b">
<rect x="344" y="100" width="128" height="52" rx="10"/>
<rect x="344" y="172" width="128" height="52" rx="10"/>
</g>
<line x1="408" y1="152" x2="408" y2="172" stroke="#9a9da6" stroke-width="1.5"/>
<text x="408" y="122" text-anchor="middle" font-size="11.5" fill="#ffffff" font-weight="600">transformContext()</text>
<text x="408" y="139" text-anchor="middle" font-size="10.5" fill="#c4c6cd">扩展链式改写</text>
<text x="408" y="194" text-anchor="middle" font-size="11.5" fill="#ffffff" font-weight="600">convertToLlm()</text>
<text x="408" y="211" text-anchor="middle" font-size="10.5" fill="#c4c6cd">过滤 + 图片阻断</text>
<line x1="472" y1="198" x2="494" y2="198" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<rect x="496" y="56" width="256" height="200" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="512" y="80" font-size="11" fill="#6b6e76" font-weight="600">Message[] · 供应商可见</text>
<g fill="#25262b">
<rect x="512" y="94" width="224" height="34" rx="8"/>
<rect x="512" y="136" width="224" height="34" rx="8"/>
<rect x="512" y="178" width="224" height="34" rx="8"/>
</g>
<text x="624" y="116" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">user</text>
<text x="624" y="158" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">assistant（text · thinking · toolCall）</text>
<text x="624" y="200" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">toolResult</text>
<text x="624" y="236" text-anchor="middle" font-size="11" fill="#6b6e76">供应商适配层永远只面对这三类</text>
<text x="400" y="282" text-anchor="middle" font-size="11" fill="#6b6e76">被挡在边界外的不是丢失——它们仍在会话历史里，只是不进入这一次请求</text>
</svg>
<figcaption>图 5：模型边界。上下文裁剪与注入都在应用消息层完成，供应商适配层永远只面对有限的标准消息联合类型。</figcaption>
</figure>

对应源码是 [`streamAssistantResponse():281-312`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts#L281-L312)。这样做有三个好处：UI 消息、压缩摘要、扩展消息可以保留在会话领域中；上下文裁剪与注入可以在应用消息层工作；供应商适配层永远只面对有限的标准消息联合类型。

### 5.4 流式响应怎样落成最终消息

`pi-ai` 统一的流事件包括 `start`、`text_start/delta/end`、`thinking_start/delta/end`、`toolcall_start/delta/end`，以及 `done` 或 `error`。定义见 [`pi-ai/types.ts:504-528`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/ai/src/types.ts#L504-L528)。

Agent Loop 在收到 `start` 时把 partial message 放入 context；后续 delta 用新的 partial 替换最后一项；收到 `done/error` 后用最终消息替换 partial，再发 `message_end`。实现见 [`agent-loop.ts:314-371`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts#L314-L371)。

因此 UI 无需自己拼接各种厂商的 SSE chunk，只消费统一的 `message_update`。

## 六、工具调用：验证、拦截、并发、顺序与失败隔离

工具类型由三部分组成：

```ts
interface AgentTool {
  name: string
  description: string
  parameters: TypeBoxSchema
  execute(id, params, signal, onUpdate): Promise<AgentToolResult>
}
```

详细类型见 [`agent/types.ts:354-403`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/types.ts#L354-L403)。

### 6.1 工具调用的完整流水线

一次工具调用不是直接 `tool.execute(rawArgs)`：

<figure class="diagram">
<svg viewBox="0 0 800 468" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="一次工具调用的九步流水线：先发 tool_execution_start，再查找工具、修正参数、Schema 验证、beforeToolCall 拦截、执行、afterToolCall 替换结果，最后生成 toolResult 消息；中间任何一步抛错都转成错误工具结果">
<rect x="56" y="60" width="488" height="34" rx="8" fill="#25262b"/>
<text x="300" y="82" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">tool_execution_start</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="56" y="106" width="488" height="34" rx="8"/>
<rect x="56" y="152" width="488" height="34" rx="8"/>
<rect x="56" y="198" width="488" height="34" rx="8"/>
<rect x="56" y="290" width="488" height="34" rx="8"/>
<rect x="56" y="336" width="488" height="34" rx="8"/>
</g>
<rect x="56" y="244" width="488" height="34" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<rect x="56" y="382" width="488" height="34" rx="8" fill="#25262b"/>
<text x="300" y="128" text-anchor="middle" font-size="12.5" fill="#25262b">在工具表里查找该工具</text>
<text x="300" y="174" text-anchor="middle" font-size="12.5" fill="#25262b">prepareArguments · 可选的兼容修正</text>
<text x="300" y="220" text-anchor="middle" font-size="12.5" fill="#25262b">TypeBox Schema 验证</text>
<text x="300" y="266" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">beforeToolCall · 权限与扩展可阻断</text>
<text x="300" y="312" text-anchor="middle" font-size="12.5" fill="#25262b">execute · 可持续推送 partial update</text>
<text x="300" y="358" text-anchor="middle" font-size="12.5" fill="#25262b">afterToolCall · 可替换结果</text>
<text x="300" y="404" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">tool_execution_end → toolResult 消息</text>
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="300" y1="94" x2="300" y2="104" marker-end="url(#pi-a1)"/>
<line x1="300" y1="140" x2="300" y2="150" marker-end="url(#pi-a1)"/>
<line x1="300" y1="186" x2="300" y2="196" marker-end="url(#pi-a1)"/>
<line x1="300" y1="232" x2="300" y2="242" marker-end="url(#pi-a1)"/>
<line x1="300" y1="278" x2="300" y2="288" marker-end="url(#pi-a1)"/>
<line x1="300" y1="324" x2="300" y2="334" marker-end="url(#pi-a1)"/>
<line x1="300" y1="370" x2="300" y2="380" marker-end="url(#pi-a1)"/>
</g>
<g stroke="#c4c6cd" stroke-width="1.2" stroke-dasharray="4 4">
<line x1="544" y1="123" x2="610" y2="123"/>
<line x1="544" y1="169" x2="610" y2="169"/>
<line x1="544" y1="215" x2="610" y2="215"/>
<line x1="544" y1="261" x2="610" y2="261"/>
<line x1="544" y1="307" x2="610" y2="307"/>
<line x1="544" y1="353" x2="610" y2="353"/>
</g>
<line x1="612" y1="123" x2="612" y2="380" stroke="#c4c6cd" stroke-width="1.2" stroke-dasharray="4 4" marker-end="url(#pi-a1)"/>
<rect x="572" y="384" width="180" height="52" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="662" y="406" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">转成错误 toolResult</text>
<text x="662" y="424" text-anchor="middle" font-size="10.5" fill="#6b6e76">Agent Loop 不中断</text>
<text x="662" y="82" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">任何一步抛错</text>
<text x="662" y="100" text-anchor="middle" font-size="10.5" fill="#6b6e76">↓</text>
<text x="400" y="456" text-anchor="middle" font-size="11" fill="#6b6e76">错误进入上下文，模型能读到并自我修正——而不是让整个循环因异常直接断裂</text>
</svg>
<figcaption>图 6：工具调用流水线。相关实现在 <code>prepareToolCall()</code>、<code>executePreparedToolCall()</code> 和 <code>finalizeExecutedToolCall()</code> 三个函数里。</figcaption>
</figure>

相关实现在 [`prepareToolCall()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts#L600-L664)、[`executePreparedToolCall()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts#L666-L707) 和 [`finalizeExecutedToolCall()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts#L709-L754)。

### 6.2 为什么先发 `tool_execution_start` 再做拦截

`tool_execution_start` 在参数准备和 `beforeToolCall` 之前发出。即使工具被权限钩子阻断，UI 仍能展示「模型尝试调用了什么」，随后收到带错误结果的 `tool_execution_end`。

这对审计尤其重要：被阻断的危险意图不应从事件记录里消失。

### 6.3 并行执行，但按模型原顺序写回

默认 `toolExecution` 是 `parallel`。Pi 的策略很细：依照 assistant 消息中的顺序，逐个完成查找、校验和 `beforeToolCall`；允许执行的工具并发运行；`tool_execution_end` 按真实完成顺序发出，UI 能及时更新；`toolResult` 消息则用 `Promise.all` 的输入顺序收集，仍按模型原始调用顺序写入上下文。

<figure class="diagram">
<svg viewBox="0 0 800 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="三个工具调用并行执行：完成顺序是 B、C、A，但写回上下文的顺序仍是模型声明的 A、B、C">
<text x="400" y="24" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">模型在一条 assistant 消息里发起三个工具调用</text>
<g fill="#25262b">
<rect x="48" y="36" width="224" height="36" rx="9"/>
<rect x="288" y="36" width="224" height="36" rx="9"/>
<rect x="528" y="36" width="224" height="36" rx="9"/>
</g>
<text x="160" y="59" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">toolCall A</text>
<text x="400" y="59" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">toolCall B</text>
<text x="640" y="59" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">toolCall C</text>
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="160" y1="72" x2="160" y2="94" marker-end="url(#pi-a1)"/>
<line x1="400" y1="72" x2="400" y2="94" marker-end="url(#pi-a1)"/>
<line x1="640" y1="72" x2="640" y2="94" marker-end="url(#pi-a1)"/>
</g>
<rect x="48" y="98" width="704" height="110" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="120" font-size="11" fill="#6b6e76" font-weight="600">并行执行 · tool_execution_end 按真实完成顺序发出</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="180" y="130" width="420" height="18" rx="9"/>
<rect x="180" y="154" width="180" height="18" rx="9"/>
<rect x="180" y="178" width="300" height="18" rx="9"/>
</g>
<text x="72" y="143" font-size="11.5" fill="#25262b" font-weight="600">A</text>
<text x="72" y="167" font-size="11.5" fill="#25262b" font-weight="600">B</text>
<text x="72" y="191" font-size="11.5" fill="#25262b" font-weight="600">C</text>
<text x="610" y="143" font-size="10.5" fill="#6b6e76">第 3 个完成</text>
<text x="370" y="167" font-size="10.5" fill="#6b6e76">第 1 个完成</text>
<text x="490" y="191" font-size="10.5" fill="#6b6e76">第 2 个完成</text>
<line x1="400" y1="208" x2="400" y2="228" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<text x="400" y="248" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">toolResult 用 Promise.all 的输入顺序收集</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="48" y="256" width="224" height="36" rx="9"/>
<rect x="288" y="256" width="224" height="36" rx="9"/>
<rect x="528" y="256" width="224" height="36" rx="9"/>
</g>
<text x="160" y="279" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">toolResult A</text>
<text x="400" y="279" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">toolResult B</text>
<text x="640" y="279" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">toolResult C</text>
<text x="400" y="316" text-anchor="middle" font-size="11" fill="#6b6e76">实时事件按完成顺序，持久化语义按声明顺序——并行速度、即时反馈和确定性历史同时拿到</text>
</svg>
<figcaption>图 7：顺序的两种口径。实现见 <code>executeToolCallsParallel()</code>；如果全局配置为 sequential，或批次中任一工具声明 <code>executionMode: "sequential"</code>，整批都会串行。</figcaption>
</figure>

实现见 [`executeToolCallsParallel():489-554`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts#L489-L554) 和 [`executeToolCalls():411-426`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts#L411-L426)。这是一个非常值得复用的模式：

> 实时事件按完成顺序，持久化语义按声明顺序。

### 6.4 为什么输出截断时不能执行工具

当模型因输出 token 上限以 `stopReason: "length"` 停止时，即使局部 JSON 能被修复解析，工具参数仍可能被静默截断。Pi 选择把该消息里的所有工具调用都判为失败，请模型重新发完整调用，而不是冒险执行。

源码说明见 [`failToolCallsFromTruncatedMessage()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts#L374-L406)。这是 Tool Calling 安全中很重要、但很多简单实现会遗漏的一点。

### 6.5 内置文件工具的几个工程细节

Pi 内置七类工具，其中默认启用前四个：

- `read`：文本分页读取、图片处理、行数和字节双重截断；
- `bash`：进程树取消、超时、流式输出、截断后保存完整临时文件；
- `edit`：唯一且不重叠的精确文本替换；
- `write`：创建父目录并写完整文件；
- `grep`：优先 `rg`，尊重 `.gitignore`，限制匹配数和行长度；
- `find`：文件模式搜索；
- `ls`：目录枚举。

特别值得注意的是 [`withFileMutationQueue()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/tools/file-mutation-queue.ts#L28-L60)：针对同一个真实文件路径的修改被串行化，不同文件仍可以并行修改，不存在的文件退回使用解析后的绝对路径作为队列键。

这与 Agent Loop 的并行工具执行配套，避免模型同一轮对同一个文件发多个写操作时互相覆盖。

## 七、AgentSession：把通用循环变成真正的 Coding Agent

`AgentSession` 是仓库中最重的单个领域类之一。它并不重新实现 Agent Loop，而是在通用 Agent 周围增加应用能力。

### 7.1 构造时做什么

构造函数保存服务引用、安装 Agent 事件订阅、安装工具前后钩子、安装下一轮刷新逻辑，并构建运行时工具和系统提示词。参见 [`agent-session.ts:305-403`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/agent-session.ts#L305-L403)。

可以把它看作一个「策略与副作用适配器」：Agent 的纯运行事件进来，出去的是扩展事件、会话落盘、UI 事件、自动重试、上下文压缩和下一轮继续。

### 7.2 输入不是直接发给模型

`AgentSession.prompt()` 的前置流水线是：

1. 如果是扩展 slash command，立即执行；
2. 拒绝在手动压缩进行中直接启动新 prompt；
3. 发 `input` 扩展事件，允许 handled/transform/continue；
4. 展开 `/skill:name` 与 prompt template；
5. 若 Agent 正在运行，按 steer/follow-up 入队；
6. 检查模型与认证；
7. 必要时先压缩旧上下文；
8. 创建用户消息并注入 pending next-turn 自定义消息；
9. 发 `before_agent_start`，允许扩展增加消息或修改 system prompt；
10. 调用 `_runAgentPrompt()`。

源码见 [`agent-session.ts:1116-1273`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/agent-session.ts#L1116-L1273)。

这个顺序体现了清晰的语义边界：输入扩展作用于原始输入；技能和模板负责文本展开；`before_agent_start` 作用于已展开且即将进入运行的内容。

### 7.3 一次用户 prompt 可能包含多次 Agent run

`_runAgentPrompt()` 调用 `agent.prompt()` 后，还会检查自动重试、上下文溢出恢复、自动压缩，以及 `agent_end` 扩展刚加入的排队消息；只要需要，就调用 `agent.continue()`。参见 [`agent-session.ts:1063-1105`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/agent-session.ts#L1063-L1105)。

因此：`Agent` 的一次 run 是低层生命周期；`AgentSession` 的一次用户操作可能组织多个 run；只有 `agent_settled` 才表示重试、压缩和续跑都结束。

### 7.4 事件先经过扩展，再通知 UI，再持久化

`_handleAgentEvent()` 的主要顺序是：更新高层队列显示状态 → 映射并发送扩展事件 → 通知 `AgentSession` 监听器 → 在 `message_end` 时追加到 SessionManager → 记录 assistant 状态供重试和压缩判断。对应源码见 [`agent-session.ts:609-681`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/agent-session.ts#L609-L681)。

扩展的 `message_end` 甚至可以返回同 role 的替换消息；AgentSession 会原地替换已经进入 Agent 状态的对象，保证状态、后续事件和落盘内容一致。实现见 [`agent-session.ts:762-780`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/agent-session.ts#L762-L780)。

## 八、会话设计：JSONL 不是数组，而是一棵追加式树

Pi 的本地会话格式非常值得学习。每个文件第一行是 header，后续每行是一个 JSON entry。每个 entry 都有：

```ts
{
  type: string,
  id: string,
  parentId: string | null,
  timestamp: string
}
```

类型定义见 [`session-manager.ts:30-156`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/session-manager.ts#L30-L156)。

### 8.1 为什么用树而不是线性消息数组

`SessionManager` 维护一个当前 `leafId`：新 entry 的 `parentId` 指向当前 leaf，追加后新 entry 成为 leaf；回到历史节点只需把 leaf 移到旧 entry，下一次追加自然产生一条新分支；原有历史从不删除或改写。

<figure class="diagram">
<svg viewBox="0 0 800 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="追加式会话树：从 assistant B 长出新分支，原分支的 C 和 D 保留不删；当前 leaf 是 H，沿 parentId 回溯得到当前上下文">
<text x="400" y="24" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">每个 entry 记录 parentId；追加即前进，移动 leaf 即分支</text>
<text x="398" y="78" text-anchor="middle" font-size="10.5" fill="#6b6e76">原分支保留，不删除也不改写</text>
<g fill="#25262b">
<rect x="56" y="86" width="104" height="48" rx="10"/>
<rect x="172" y="86" width="104" height="48" rx="10"/>
</g>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="288" y="86" width="104" height="48" rx="10"/>
<rect x="404" y="86" width="104" height="48" rx="10"/>
</g>
<text x="108" y="106" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">user A</text>
<text x="108" y="122" text-anchor="middle" font-size="10.5" fill="#c4c6cd">root</text>
<text x="224" y="106" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">assistant B</text>
<text x="224" y="122" text-anchor="middle" font-size="10.5" fill="#c4c6cd">分叉点</text>
<text x="340" y="106" text-anchor="middle" font-size="12" fill="#6b6e76" font-weight="600">toolResult C</text>
<text x="340" y="122" text-anchor="middle" font-size="10.5" fill="#6b6e76">旧分支</text>
<text x="456" y="106" text-anchor="middle" font-size="12" fill="#6b6e76" font-weight="600">user D</text>
<text x="456" y="122" text-anchor="middle" font-size="10.5" fill="#6b6e76">旧分支</text>
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="160" y1="110" x2="170" y2="110" marker-end="url(#pi-a1)"/>
<line x1="276" y1="110" x2="286" y2="110" marker-end="url(#pi-a1)"/>
<line x1="392" y1="110" x2="402" y2="110" marker-end="url(#pi-a1)"/>
</g>
<path d="M224 134 V152 H340 V164" fill="none" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<g fill="#25262b">
<rect x="288" y="168" width="104" height="48" rx="10"/>
<rect x="404" y="168" width="104" height="48" rx="10"/>
<rect x="636" y="168" width="104" height="48" rx="10"/>
</g>
<rect x="520" y="168" width="104" height="48" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="340" y="188" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">user E</text>
<text x="340" y="204" text-anchor="middle" font-size="10.5" fill="#c4c6cd">新分支起点</text>
<text x="456" y="188" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">assistant F</text>
<text x="456" y="204" text-anchor="middle" font-size="10.5" fill="#c4c6cd">回答</text>
<text x="572" y="188" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">compaction</text>
<text x="572" y="204" text-anchor="middle" font-size="10.5" fill="#6b6e76">摘要 entry</text>
<text x="688" y="188" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">消息 H</text>
<text x="688" y="204" text-anchor="middle" font-size="10.5" fill="#c4c6cd">当前 leaf</text>
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="392" y1="192" x2="402" y2="192" marker-end="url(#pi-a1)"/>
<line x1="508" y1="192" x2="518" y2="192" marker-end="url(#pi-a1)"/>
<line x1="624" y1="192" x2="634" y2="192" marker-end="url(#pi-a1)"/>
</g>
<text x="340" y="238" text-anchor="middle" font-size="10.5" fill="#6b6e76">新分支从 B 长出，不复制历史</text>
<line x1="688" y1="216" x2="688" y2="250" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="5 5" marker-end="url(#pi-a1)"/>
<rect x="56" y="252" width="684" height="76" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="72" y="274" font-size="11" fill="#6b6e76" font-weight="600">buildSessionContext() 的投影结果 · 沿 parentId 回溯到 root 后反转</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="72" y="284" width="212" height="32" rx="8"/>
<rect x="296" y="284" width="212" height="32" rx="8"/>
<rect x="520" y="284" width="212" height="32" rx="8"/>
</g>
<text x="178" y="305" text-anchor="middle" font-size="11.5" fill="#25262b">compaction summary</text>
<text x="402" y="305" text-anchor="middle" font-size="11.5" fill="#25262b">firstKeptEntryId 之后的条目</text>
<text x="626" y="305" text-anchor="middle" font-size="11.5" fill="#25262b">压缩之后新增的条目</text>
<text x="400" y="350" text-anchor="middle" font-size="11" fill="#6b6e76">fork 不复制整段历史，编辑旧问题不破坏原分支，会话文件天然可审计</text>
</svg>
<figcaption>图 8：追加式会话树。见 <code>SessionManager</code> 类注释与 <code>branch()</code>——label、模型切换、thinking 变化都能成为时间线上的不可变事件。</figcaption>
</figure>

见 [`SessionManager` 类注释](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/session-manager.ts#L844-L854) 和 [`branch()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/session-manager.ts#L1354-L1365)。

### 8.2 entry 不都进入模型上下文

会话 entry 包括 `message`、`thinking_level_change`、`model_change`、`compaction`、`branch_summary`、`custom`、`custom_message`、`label` 和 `session_info`。

其中普通 `custom` 用于扩展状态持久化，不进入 LLM；`custom_message`、分支摘要和压缩摘要会转换成应用消息。映射函数见 [`sessionEntryToContextMessages()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/session-manager.ts#L379-L407)。

这再次体现了「存储历史」和「模型上下文」不是同一个东西。

### 8.3 怎样从整棵树重建当前上下文

重建分两步：先从当前 leaf 沿 `parentId` 回溯到 root，再反转成当前分支路径；然后处理最新 compaction，只保留摘要、`firstKeptEntryId` 之后的近期条目，以及压缩发生后的新条目。实现见 [`buildContextEntries()` 和 `buildSessionContext()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/session-manager.ts#L410-L470)。

### 8.4 为什么延迟到出现 assistant 后才真正创建文件

`_persist()` 会等待会话中出现 assistant 消息，再把 header 和之前的条目整体写入文件；之后才转为逐行 append。参见 [`session-manager.ts:1015-1049`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/session-manager.ts#L1015-L1049)。

这样可以减少只启动、未真正发生一次交互的空会话文件，同时一旦会话成立，后续操作仍保持追加式写入。

## 九、上下文压缩：摘要不是替换历史，而是改变「投影」

Pi 的 compaction 不会删除旧 entry。它追加一条 `compaction` entry，随后 `buildSessionContext()` 在投影时省略旧消息，用摘要和保留窗口替代。

<figure class="diagram">
<svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="压缩的三个阶段：会话历史只追加，追加一条 compaction entry，下一次请求时的投影只带摘要、保留窗口和新条目">
<text x="48" y="32" font-size="11" fill="#6b6e76" font-weight="600">① 会话历史 · 永远只追加</text>
<rect x="48" y="42" width="704" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<rect x="60" y="52" width="398" height="24" rx="6" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="259" y="69" text-anchor="middle" font-size="11" fill="#6b6e76">旧条目 · 不删除、不改写</text>
<rect x="466" y="52" width="274" height="24" rx="6" fill="#25262b"/>
<text x="603" y="69" text-anchor="middle" font-size="11" fill="#ffffff">近期窗口 · keepRecentTokens</text>
<line x1="462" y1="42" x2="462" y2="86" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="4 4"/>
<text x="462" y="104" text-anchor="middle" font-size="10.5" fill="#6b6e76">findCutPoint()：绝不从 toolResult 切开</text>
<line x1="400" y1="110" x2="400" y2="128" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<text x="48" y="142" font-size="11" fill="#6b6e76" font-weight="600">② 追加一条 compaction entry</text>
<rect x="48" y="152" width="704" height="44" rx="10" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<g fill="#ffffff" stroke="#c4c6cd" stroke-width="1.2">
<rect x="60" y="162" width="164" height="24" rx="6"/>
<rect x="232" y="162" width="164" height="24" rx="6"/>
<rect x="404" y="162" width="164" height="24" rx="6"/>
<rect x="576" y="162" width="164" height="24" rx="6"/>
</g>
<text x="142" y="179" text-anchor="middle" font-size="10.5" fill="#25262b">summary</text>
<text x="314" y="179" text-anchor="middle" font-size="10.5" fill="#25262b">firstKeptEntryId</text>
<text x="486" y="179" text-anchor="middle" font-size="10.5" fill="#25262b">tokensBefore</text>
<text x="658" y="179" text-anchor="middle" font-size="10.5" fill="#25262b">已读 / 已改文件列表</text>
<line x1="400" y1="200" x2="400" y2="212" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#pi-a1)"/>
<text x="48" y="226" font-size="11" fill="#6b6e76" font-weight="600">③ 下一次请求时的投影</text>
<rect x="48" y="236" width="704" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<g fill="#25262b">
<rect x="60" y="246" width="221" height="24" rx="6"/>
<rect x="289" y="246" width="221" height="24" rx="6"/>
<rect x="518" y="246" width="221" height="24" rx="6"/>
</g>
<text x="170" y="263" text-anchor="middle" font-size="10.5" fill="#ffffff">summary</text>
<text x="399" y="263" text-anchor="middle" font-size="10.5" fill="#ffffff">firstKeptEntryId 之后的条目</text>
<text x="628" y="263" text-anchor="middle" font-size="10.5" fill="#ffffff">压缩后新增的条目</text>
<text x="400" y="296" text-anchor="middle" font-size="11" fill="#6b6e76">完整历史仍在文件里；改变的只是「这一次请求带哪些消息」</text>
</svg>
<figcaption>图 9：压缩即投影。这对调试、审计和重新分支非常有价值——摘要错了可以重来，因为原始条目一条都没少。</figcaption>
</figure>

### 9.1 什么时候触发

默认设置为：

```ts
reserveTokens: 16384
keepRecentTokens: 20000
```

当估算上下文大于 `contextWindow - reserveTokens` 时触发。源码见 [`compaction.ts:126-237`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/compaction/compaction.ts#L126-L237)。

token 估算优先使用最近一次有效 assistant usage，再对其后的消息使用字符数除以四的近似；图片按固定字符量估算。这比对全历史都用粗略字符估算更稳。

### 9.2 怎样选择切点

算法从最新消息向后累计 token，直到达到 `keepRecentTokens`，再选合法切点。它不会从 `toolResult` 开始，因为工具结果不能脱离发起它的 assistant tool call。若必须在一个很大的 turn 中间切开，会另生成 turn-prefix summary，给保留下来的后半段补足语义。切点算法见 [`findCutPoint()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/compaction/compaction.ts#L387-L461)。

### 9.3 连续压缩怎样避免摘要丢信息

如果此前已有 compaction，新摘要不是从零生成，而是把旧摘要放进 `<previous-summary>`，要求模型保留原信息并融合新增进度。源码见 [`generateSummaryWithUsage()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/compaction/compaction.ts#L621-L685)。

此外，Pi 从工具调用中提取已读/已修改文件列表并附加到摘要，降低压缩后 Agent 忘记工作集的概率。

### 9.4 三种压缩原因

AgentSession 区分 `manual`（用户主动 `/compact`）、`threshold`（正常超过阈值）和 `overflow`（供应商明确返回上下文溢出，需要压缩后自动重试一次）。这三种原因都进入扩展事件，使扩展可以取消或自定义摘要，但是否自动续跑的语义不同。

## 十、多模型适配：统一的是领域协议，不是假装所有 API 一样

`pi-ai` 定义了有限而稳定的领域对象：`UserMessage`、`AssistantMessage`（内容可以是 text、thinking、toolCall）、`ToolResultMessage`、`Usage` 和统一 cost、`StopReason`，以及统一的流式事件。定义见 [`pi-ai/types.ts:334-444`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/ai/src/types.ts#L334-L444)。

### 10.1 Provider 是真正的运行单元

`Provider` 拥有 id/name/base URL、认证策略、同步模型目录与可选动态刷新、模型可用性过滤、`stream` 和 `streamSimple`，以及可选的 deferred fetch/cancel。接口见 [`models.ts:88-149`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/ai/src/models.ts#L88-L149)。

`Models` 则是 Provider 集合：负责查找模型、解析认证、刷新目录并把调用路由到拥有该模型的 Provider。

### 10.2 Provider 与 API protocol 是两个维度

这是 Pi 模型层很好的抽象：Provider 是 OpenAI、Anthropic、OpenRouter、GitHub Copilot 等产品/认证边界；API 是 `openai-responses`、`openai-completions`、`anthropic-messages`、`google-generative-ai` 等线上协议。

多个 Provider 可以复用同一 API 实现；一个 Provider 也可以按模型使用多个 API。`createProvider()` 支持单一 stream 实现或按 `model.api` 分发的映射，见 [`models.ts:739-832`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/ai/src/models.ts#L739-L832)。

这比「每个供应商写一整套重复客户端」更易扩展，也比「所有模型都当 OpenAI-compatible」更尊重真实差异。

### 10.3 认证在每次请求前解析

`ModelsImpl.applyAuth()` 会找到 provider，解析 API key、OAuth 或环境认证，合并认证头、模型头和本次请求头，应用 header transform，必要时覆盖 base URL，最后把最终模型和 options 交给 provider。实现见 [`models.ts:628-695`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/ai/src/models.ts#L628-L695)。

每次请求都解析认证，对长时间运行的 OAuth 会话尤其重要：工具可能运行很久，不能假设启动时拿到的 token 永远有效。

## 十一、自扩展机制：Pi 怎样让扩展深入运行生命周期

官方称 Pi 为「self extensible coding agent」，源码里的 Extension API 确实覆盖了几乎所有关键边界。

扩展可以注册工具、slash command、快捷键与 CLI flag、自定义消息与 entry 与 Markdown renderer、Provider 和 OAuth、主题与技能与 prompt 资源、UI 状态与 widget 与 header/footer。还可以监听项目信任与资源发现、会话启动与切换与 fork 与压缩与树导航、原始输入、模型上下文、provider 请求体与请求头与响应、Agent/turn/message/tool 生命周期，以及模型与 thinking level 变化。完整 API 见 [`extensions/types.ts:1190-1431`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/extensions/types.ts#L1190-L1431)。

### 11.1 扩展不是「一个回调数组」

不同事件有不同的组合语义：

| 事件 | 组合方式 |
|---|---|
| `input` | transform 可以链式修改，handled 会短路 |
| `context` | 每个扩展接收上一个扩展修改后的消息数组 |
| `before_agent_start` | 可以累加自定义消息，后一个扩展看到前一个修改后的 system prompt |
| `tool_call` | 任一处理器返回 block 就立即阻断 |
| `tool_result` | 字段级覆盖并继续传给后续扩展 |
| 普通生命周期事件 | 依次通知并隔离异常 |

例如上下文链式变换在 [`emitContext()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/extensions/runner.ts#L984-L1014)，输入链在 [`emitInput()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/extensions/runner.ts#L1195-L1235)，工具阻断在 [`emitToolCall()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/extensions/runner.ts#L932-L953)。

这说明一个成熟插件系统不仅要定义「有哪些钩子」，还要为每个钩子定义顺序、合并方式、短路条件、异常策略，以及是否允许修改领域对象。

### 11.2 技能与扩展是不同机制

扩展是可执行 TypeScript，能注册行为；技能主要是按需注入的 Markdown 指令。

当用户输入 `/skill:name args` 时，AgentSession 读取对应 `SKILL.md`、移除 frontmatter、包进带路径信息的 `<skill>` 块，再附加参数。实现见 [`_expandSkillCommand()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/agent-session.ts#L1304-L1333)。

系统提示词只列出技能元数据；真正使用某技能时才加载全文。这是一种上下文节省机制。

### 11.3 项目上下文怎样加载

`ResourceLoader` 从全局 agent 目录和 cwd 的祖先目录查找 `AGENTS.md` 或 `CLAUDE.md`，按祖先到当前目录的顺序装入，并处理嵌套 worktree 的重复规则文件。实现见 [`loadProjectContextFiles()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/resource-loader.ts#L70-L156)。

系统提示词最终由六段组合：默认或自定义 prompt、当前可见工具及 guidelines、append system prompt、project context files、skill 索引、当前 cwd。构造逻辑见 [`buildSystemPrompt()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/system-prompt.ts#L27-L161)。

## 十二、TUI：事件驱动组件树与差分终端渲染

`pi-tui` 的组件协议很小：

```ts
interface Component {
  render(width: number): string[]
  handleInput?(data: string): void
  invalidate(): void
}
```

参见 [`tui.ts:20-47`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/tui/src/tui.ts#L20-L47)。组件只返回「给定宽度下的终端行」，不直接写 stdout。

### 12.1 Agent 事件怎样变成组件更新

`InteractiveMode` 订阅 `AgentSessionEvent`：`message_start(assistant)` 创建流式消息组件；`message_update` 更新 assistant 内容，并在 tool call 参数逐步出现时创建/更新工具组件；`tool_execution_update` 更新工具的流式输出；`message_end` 把流式状态定稿；`agent_end` 清理工作状态。对应代码见 [`interactive-mode.ts:3023-3244`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L3023-L3244)。

每次状态变化只调用 `requestRender()`；真正何时、怎样写终端由 TUI 层决定。

### 12.2 差分渲染怎样减少闪烁

主屏幕渲染器保存 `previousLines`、终端宽高、光标位置和 viewport。每帧：

1. 让组件树渲染出新的字符串行；
2. 合成 overlay；
3. 提取硬件光标标记；
4. 比较新旧行，找到首尾变化区间；
5. 只移动光标并重画变化行；
6. 只有宽度变化、视口无法安全更新等情况才全量重画；
7. 用 synchronized output 控制序列包裹输出，降低视觉撕裂。

核心见 [`TuiMainScreen.doRender()`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/tui/src/tui-main-screen.ts#L180-L419)。

图片需要额外处理：Kitty 图片占多行，任一相关行变化时，差分区间会扩展到完整图片区域，并先删除旧图片 id，再重画。

### 12.3 为什么 TUI 自己就值得拆成包

终端 UI 包含许多与 Agent 无关但复杂的领域问题：ANSI 可见宽度、东亚宽字符、Markdown 和语法高亮、IME 硬件光标定位、alternate screen 与 main screen、overlay 焦点、鼠标和滚动视图、Kitty/iTerm 图片协议、终端 resize 与 tmux 键盘协议。

把这些逻辑留在 Coding Agent 主类里，会让 Agent 行为无法测试，也会让 UI 改动持续污染核心运行逻辑。

## 十三、新远程架构：Protocol、Client、Server 与 Storage

当前 `protocol`／`client`／`server`／`storage` 属于正在演进的实验架构，Server README 也明确说尚未替换旧 JSONL IPC、子进程 supervisor 和 CLI。阅读时应把它视为「Pi 下一阶段的会话服务层」，而不是已经完全接管本地 CLI 的路径。

<figure class="diagram">
<svg viewBox="0 0 800 244" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="远程协议的两部分：4 字节大端长度加一个定长 CBOR item 的帧格式，以及 awaitingHello 到 handshaking 到 ready 到 closing 的握手状态机">
<text x="48" y="32" font-size="11" fill="#6b6e76" font-weight="600">① 线上帧格式</text>
<rect x="48" y="42" width="200" height="44" rx="10" fill="#25262b"/>
<text x="148" y="62" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">uint32 大端长度</text>
<text x="148" y="78" text-anchor="middle" font-size="10.5" fill="#c4c6cd">固定 4 字节</text>
<rect x="256" y="42" width="496" height="44" rx="10" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="504" y="62" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">一个定长（definite-length）CBOR item</text>
<text x="504" y="78" text-anchor="middle" font-size="10.5" fill="#6b6e76">默认单帧上限 16 MiB，解码后再过一遍 TypeBox 严格校验</text>
<text x="400" y="106" text-anchor="middle" font-size="10.5" fill="#6b6e76">FrameDecoder 先验证声明长度，再按 64 KiB block 累积 payload；流结束时检查截断</text>
<text x="48" y="140" font-size="11" fill="#6b6e76" font-weight="600">② 握手状态机</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="48" y="150" width="158" height="48" rx="10"/>
<rect x="230" y="150" width="158" height="48" rx="10"/>
<rect x="594" y="150" width="158" height="48" rx="10"/>
</g>
<rect x="412" y="150" width="158" height="48" rx="10" fill="#25262b"/>
<text x="127" y="172" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">awaitingHello</text>
<text x="127" y="189" text-anchor="middle" font-size="10.5" fill="#6b6e76">只接受 hello</text>
<text x="309" y="172" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">handshaking</text>
<text x="309" y="189" text-anchor="middle" font-size="10.5" fill="#6b6e76">校验 PROTOCOL_VERSION</text>
<text x="491" y="172" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">ready</text>
<text x="491" y="189" text-anchor="middle" font-size="10.5" fill="#c4c6cd">request · response · event</text>
<text x="673" y="172" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">closing → closed</text>
<text x="673" y="189" text-anchor="middle" font-size="10.5" fill="#6b6e76">全部 lease 失效</text>
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="206" y1="174" x2="228" y2="174" marker-end="url(#pi-a1)"/>
<line x1="388" y1="174" x2="410" y2="174" marker-end="url(#pi-a1)"/>
<line x1="570" y1="174" x2="592" y2="174" marker-end="url(#pi-a1)"/>
</g>
<text x="400" y="228" text-anchor="middle" font-size="11" fill="#6b6e76">snapshot 才是权威状态；progress 只是短暂 UI 提示，不能被 reducer 当成最终结果</text>
</svg>
<figcaption>图 10：协议帧与握手。客户端第一条消息必须是带 <code>PROTOCOL_VERSION</code> 的 hello，服务端返回连接 id 与权威 ServerSnapshot。</figcaption>
</figure>

### 13.1 协议为什么用「4 字节长度 + CBOR」

`FrameDecoder` 可处理任意碎片和粘包，先验证声明长度，再按 64 KiB block 累积 payload；默认单帧上限 16 MiB，流结束时会检查截断。实现见 [`framing.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/protocol/src/framing.ts#L1-L165)。

CBOR 解码后还要经过 TypeBox Schema 严格验证；对象未知字段会被拒绝，非法对象原型、循环结构、非协议值也会被拒绝。见 [`codec.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/protocol/src/codec.ts#L18-L172)。

### 13.2 协议先 hello，再 request/response/event

客户端第一条消息必须是带 `PROTOCOL_VERSION` 的 `hello`。服务端返回连接 id 与权威 ServerSnapshot。之后：request 用 id 关联 response；server event 异步推送；session/server snapshot 是权威状态；progress 只是短暂 UI 提示，不能被 reducer 当作最终状态。

这避免客户端对长任务做过度乐观的本地状态推断。

### 13.3 Client 用 lease 表达会话所有权

`PiClient` 不只是一个 request map。它为会话提供 exclusive lease（生命周期/修改协调者独占）与 shared lease（多个低层消费者共享）；最后一个 lease 释放后才发 detach；断线或服务端移除会使所有 lease 失效；detach 失败会记录待协调清理，下一次获取前先修复。

核心状态表见 [`client.ts:39-77`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/client/src/client.ts#L39-L77)，所有权检查见 [`client.ts:381-407`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/client/src/client.ts#L381-L407)。

lease 比简单的 `attached: boolean` 更准确地表达「谁有权操作、谁负责释放」。

### 13.4 Server 把传输与会话后端分开

`PiServer` 接收一个 `PiSessionBackend` 和多个 listener。listener 负责 Unix socket、WebSocket 等传输的认证与连接建立；Server 只处理有序字节流、握手、协议消息和会话命令。

实现见 [`server.ts:107-245`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/server/src/server.ts#L107-L245)。请求随后交给 `LiveSessionManager.executeCommand()`，结果通过相同 request id 返回，见 [`server.ts:247-264`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/server/src/server.ts#L247-L264)。

### 13.5 SQLite 包为什么独立

Agent Core 不应强制所有浏览器、Bun 或轻量调用者引入 Node 内建 SQLite。于是 SQLite 适配器被拆到独立包，提供仓库、迁移、物化分支视图和可选 FTS 搜索。

这延续了整个仓库的依赖原则：核心类型与状态尽量运行时中立，Node 专属能力放到显式子包。

## 十四、安全边界：项目信任不等于沙箱

Pi 顶层 README 明确说明：它没有内置的文件系统、进程、网络或凭据权限系统，默认以启动它的用户和进程权限运行。因此：

- 项目信任解决的是「是否加载项目级设置、扩展、技能和指令」；
- 工具 `beforeToolCall` 可以作为应用级策略拦截点；
- 但两者都不是操作系统隔离；
- 真正的强边界需要容器、微型 VM 或外部 sandbox。

这一区分非常重要。扩展本身是任意 TypeScript，技能也可能指示模型执行命令。官方文档同样要求安装第三方 Pi Package 前审查源码。

另外，工具并行设计中对「同文件写入串行化」、模型输出截断时拒绝执行工具、协议层严格限制帧大小与未知字段，都属于防止意外行为和资源滥用的工程防线，但不能替代系统沙箱。

## 十五、这套设计最值得借鉴的八点

**1. 用事件作为内核与界面的合同。** 模型流、工具进度、会话落盘、TUI、JSON 输出、RPC 都围绕同一事件语义组织。新增界面不需要改 Agent Loop。

**2. 区分领域消息和模型消息。** 会话可以保存 UI/扩展/摘要消息，模型边界再投影。这比让整个系统只能保存三种 LLM message 更灵活。

**3. 注入 `streamFn`，让 Agent Core 不依赖供应商。** Agent Loop 只要求一个满足契约的异步事件流。模型认证和供应商差异全部下沉。

**4. 实时顺序与确定性顺序分离。** 并行工具的完成事件立即发出，但结果按原调用顺序进入历史。用户体验和可重复语义两者兼得。

**5. 会话存储采用追加式树。** 分支、标签、模型切换、压缩都成为不可变事件，当前上下文只是对历史树的一次投影。

**6. 把压缩当作上下文投影，而不是删除历史。** 摘要只改变后续发给模型的消息集，完整历史仍保留。这对调试、审计和重新分支非常有价值。

**7. 插件钩子必须定义组合语义。** 不同事件需要链式变换、短路、覆盖或只读通知。Pi 为这些情况分别实现，而不是给所有事件套同一个 `Promise.all`。

**8. 核心与运行时专属能力分包。** Agent Core 不依赖 Node 文件系统，Client 根入口不依赖 Unix socket，SQLite 放独立包。依赖边界直接提升可复用性。

## 十六、也要看到它的代价与可改进空间

### 16.1 `AgentSession` 和 `InteractiveMode` 已经很大

虽然底层分层清晰，但高层应用类承担的策略仍很多：会话、压缩、重试、扩展绑定、模型切换、树导航都集中在 `AgentSession`；`InteractiveMode` 同时管理组件、命令、快捷键、弹窗、扩展 UI 和大量事件映射。

这不一定是错误，因为它们确实是应用编排层，但继续演进时可以考虑按状态域拆成 RetryCoordinator、CompactionCoordinator、SessionNavigationService、InteractiveTranscriptController 和 ExtensionUiHost。

### 16.2 事件数量多，理解成本高

底层 AgentEvent、高层 AgentSessionEvent、ExtensionEvent 和 Protocol Event 互相映射。好处是边界明确，代价是新贡献者必须先理解各层事件的所有权。可通过生成式事件文档、事件序列测试和统一 trace id 降低心智负担。

### 16.3 扩展能力强，也扩大了可信计算基

扩展能修改请求、上下文、工具结果和 Provider，意味着它本质上处于高权限位置。Pi 用 project trust 控制项目扩展加载，但用户级扩展和已信任包仍需要严格供应链管理。

### 16.4 新远程架构仍处于过渡期

当前同时存在本地 JSONL 会话、旧 RPC/IPC 与新 CBOR 会话服务。代码清楚标注了迁移状态，学习时不要误以为所有 CLI 操作已经经过 `PiServer`。

## 十七、推荐的源码学习路线

不要从 6000 多行的 `interactive-mode.ts` 开始。建议按下面顺序阅读。

**第一阶段：理解消息和事件。** 依次读 [`packages/ai/src/types.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/ai/src/types.ts)、[`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/types.ts)、[`agent-loop.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent-loop.ts) 和 [`agent.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/agent/src/agent.ts)。读完后，自己画出「无工具」和「有两个并行工具」的事件序列。

**第二阶段：理解 Coding Agent 装配。** 读 [`core/sdk.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/sdk.ts)、[`core/agent-session.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/agent-session.ts)、[`core/session-manager.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/session-manager.ts) 和 [`core/tools/`](https://github.com/earendil-works/pi/tree/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/tools)。此时重点回答：哪些状态属于 Agent，哪些属于 AgentSession，哪些必须持久化？

**第三阶段：理解自扩展与上下文管理。** 读 [`extensions/types.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/extensions/types.ts)、[`extensions/runner.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/extensions/runner.ts)、[`resource-loader.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/resource-loader.ts) 和 [`compaction/compaction.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/core/compaction/compaction.ts)。

**第四阶段：理解展示与远程化。** 读 [`print-mode.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/coding-agent/src/modes/print-mode.ts)，然后只看 `interactive-mode.ts` 中的构造、订阅和 `handleEvent()`（不要先逐行读完整文件），再读 [`tui-main-screen.ts`](https://github.com/earendil-works/pi/blob/04133eb01b082248f7d667c1214e09477a1c3db1/packages/tui/src/tui-main-screen.ts)，最后是 [`protocol`](https://github.com/earendil-works/pi/tree/04133eb01b082248f7d667c1214e09477a1c3db1/packages/protocol)、[`client`](https://github.com/earendil-works/pi/tree/04133eb01b082248f7d667c1214e09477a1c3db1/packages/client) 和 [`server`](https://github.com/earendil-works/pi/tree/04133eb01b082248f7d667c1214e09477a1c3db1/packages/server)。

## 十八、用 100 行思路复刻一个最小 Pi

如果想通过实践理解，可以先实现一个极简版，不要一开始复制所有功能。

第一步，定义统一消息：

```ts
type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; blocks: Block[]; stopReason: string }
  | { role: "toolResult"; callId: string; text: string; isError: boolean }
```

第二步，定义模型流：

```ts
type StreamFn = (
  model: Model,
  context: Context,
  options: { signal?: AbortSignal }
) => AsyncIterable<ModelEvent>
```

第三步，只实现核心循环：

```ts
while (true) {
  const assistant = await collect(streamFn(model, context))
  context.messages.push(assistant)

  const calls = assistant.blocks.filter(isToolCall)
  if (!calls.length) break

  const results = await Promise.all(calls.map(runValidatedTool))
  context.messages.push(...results)
}
```

第四步，再按顺序逐项加上 Pi 的关键能力：生命周期事件 → `AbortController` → tool args Schema 验证 → partial tool update → parallel/sequential → steer/follow-up → JSONL append-only history → 分支与 leaf → compaction 投影 → 扩展钩子的组合语义 → TUI 或远程协议。

每增加一项，都可以直接对照 Pi 的对应文件，而不是一口气阅读整个仓库。

## 结语：Pi 的「最小」不是代码少，而是核心概念少

Pi 当前仓库并不小，尤其 Coding Agent 和 TUI 已经积累了大量真实世界细节。但它的核心概念仍然很集中：Message 表示状态，Event 表示变化，AgentLoop 推动变化，AgentSession 编排副作用，Projection 决定模型看见什么，Extension 在明确边界插入策略，UI 和 Protocol 只是不同消费者。

如果只记住一个源码阅读结论，可以记住这一点：

> 一个可维护的 Coding Agent，不应把「模型调用、工具执行、界面刷新、历史持久化、上下文压缩」写成同一段控制流。应先定义稳定消息和事件，再让各层围绕它们协作。

Pi 的源码正是这个原则在真实产品中的一份完整样本。

## 主要资料

1. [Pi GitHub 仓库](https://github.com/earendil-works/pi)
2. [本解析固定的源码提交 `04133eb`](https://github.com/earendil-works/pi/tree/04133eb01b082248f7d667c1214e09477a1c3db1)
3. [Pi 官方文档](https://pi.dev/docs/latest)
4. [Pi 扩展文档](https://pi.dev/docs/latest/extensions)
5. [Pi 会话文档](https://pi.dev/docs/latest/sessions)
6. [Pi 上下文压缩文档](https://pi.dev/docs/latest/compaction)
7. [Pi 安全文档](https://pi.dev/docs/latest/security)
