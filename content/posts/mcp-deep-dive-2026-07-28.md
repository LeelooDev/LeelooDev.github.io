---
title: 深入理解 MCP：原理、架构、消息、传输、安全与 2026-07-28 最新更新
date: 2026-08-04T16:00:00
category: code
tags: [MCP, Agent, 协议, LLM, 架构, 安全]
cover: /images/mcp-deep-dive-cover.jpg
coverAlt: 淡绿色手绘插画：一片针叶林中间立着一棵大树，树枝上挂着秋千，一个孩子坐在上面；左边是冒着炊烟的小房子和两只兔子，右边两只小狗在草地上奔跑
excerpt: 从集成问题出发，逐层拆解 Model Context Protocol 的 Host–Client–Server 架构、JSON-RPC 消息、Tools/Resources/Prompts、stdio 与 Streamable HTTP，并详解把协议核心改成无状态的 2026-07-28 大版本。九张图，一份迁移清单。
dek: MCP 最有价值的地方不是让模型突然懂得更多，而是为 AI 应用和真实世界之间划出一条可描述、可替换、可授权、可观测的边界。
---

> 截至 2026 年 8 月 4 日，MCP 最新稳定规范是 **`2026-07-28`**。它已于 2026 年 7 月 28 日正式发布，不再是候选版。官方将其称为 MCP 发布以来规模最大的一次修订：协议核心由连接级有状态模型转为无状态模型，并对发现、传输、服务端索取输入、订阅、缓存、扩展和弃用机制进行了系统重构。[查看官方 Release](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28) 与 [完整变更清单](https://modelcontextprotocol.io/specification/2026-07-28/changelog)。

## 一、为什么 AI 需要 MCP

大模型擅长在已有上下文中推理，却天然不知道你的本地文件、数据库、代码仓库、工单系统和实时业务状态，更不能在没有接口的情况下替你发邮件、提交代码或修改订单。

过去的解决方式是为每个 AI 应用和每个外部系统单独写连接器。假设有 5 个 AI 应用、20 个数据或工具系统，最坏情况下需要维护 100 组定制集成，而且每一组都要重复解决：能力描述、参数校验、调用、错误、流式返回、授权、用户确认和版本兼容。

<figure class="diagram">
<svg viewBox="0 0 800 316" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="左边是每个 AI 应用与每个外部系统两两定制集成的 N 乘 M 连线，右边是双方各自对接同一个协议后变成 N 加 M 次实现">
<defs>
<marker id="mcp-a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
<marker id="mcp-a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<rect x="48" y="44" width="336" height="228" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="68" font-size="11" fill="#6b6e76" font-weight="600">从前 · N × M 组定制集成</text>
<g stroke="#c4c6cd" stroke-width="1">
<line x1="140" y1="98" x2="292" y2="93"/><line x1="140" y1="98" x2="292" y2="131"/><line x1="140" y1="98" x2="292" y2="169"/><line x1="140" y1="98" x2="292" y2="207"/>
<line x1="140" y1="148" x2="292" y2="93"/><line x1="140" y1="148" x2="292" y2="131"/><line x1="140" y1="148" x2="292" y2="169"/><line x1="140" y1="148" x2="292" y2="207"/>
<line x1="140" y1="198" x2="292" y2="93"/><line x1="140" y1="198" x2="292" y2="131"/><line x1="140" y1="198" x2="292" y2="169"/><line x1="140" y1="198" x2="292" y2="207"/>
</g>
<g fill="#25262b">
<rect x="64" y="80" width="76" height="36" rx="8"/>
<rect x="64" y="130" width="76" height="36" rx="8"/>
<rect x="64" y="180" width="76" height="36" rx="8"/>
</g>
<text x="102" y="103" text-anchor="middle" font-size="11" fill="#ffffff">应用 A</text>
<text x="102" y="153" text-anchor="middle" font-size="11" fill="#ffffff">应用 B</text>
<text x="102" y="203" text-anchor="middle" font-size="11" fill="#ffffff">应用 C</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="292" y="79" width="76" height="28" rx="7"/>
<rect x="292" y="117" width="76" height="28" rx="7"/>
<rect x="292" y="155" width="76" height="28" rx="7"/>
<rect x="292" y="193" width="76" height="28" rx="7"/>
</g>
<text x="330" y="97" text-anchor="middle" font-size="10.5" fill="#25262b">文件</text>
<text x="330" y="135" text-anchor="middle" font-size="10.5" fill="#25262b">数据库</text>
<text x="330" y="173" text-anchor="middle" font-size="10.5" fill="#25262b">工单</text>
<text x="330" y="211" text-anchor="middle" font-size="10.5" fill="#25262b">SaaS</text>
<text x="216" y="248" text-anchor="middle" font-size="10.5" fill="#6b6e76">每条连线都要各写一遍</text>
<text x="216" y="264" text-anchor="middle" font-size="10.5" fill="#6b6e76">Schema、错误、授权、确认</text>
<rect x="416" y="44" width="336" height="228" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="432" y="68" font-size="11" fill="#6b6e76" font-weight="600">现在 · N + M 次实现</text>
<g stroke="#c4c6cd" stroke-width="1.2">
<line x1="508" y1="98" x2="546" y2="140" marker-end="url(#mcp-a1)"/>
<line x1="508" y1="148" x2="546" y2="148" marker-end="url(#mcp-a1)"/>
<line x1="508" y1="198" x2="546" y2="158" marker-end="url(#mcp-a1)"/>
<line x1="590" y1="140" x2="656" y2="93" marker-end="url(#mcp-a1)"/>
<line x1="590" y1="146" x2="656" y2="131" marker-end="url(#mcp-a1)"/>
<line x1="590" y1="152" x2="656" y2="169" marker-end="url(#mcp-a1)"/>
<line x1="590" y1="158" x2="656" y2="207" marker-end="url(#mcp-a1)"/>
</g>
<g fill="#25262b">
<rect x="432" y="80" width="76" height="36" rx="8"/>
<rect x="432" y="130" width="76" height="36" rx="8"/>
<rect x="432" y="180" width="76" height="36" rx="8"/>
</g>
<text x="470" y="103" text-anchor="middle" font-size="11" fill="#ffffff">Host A</text>
<text x="470" y="153" text-anchor="middle" font-size="11" fill="#ffffff">Host B</text>
<text x="470" y="203" text-anchor="middle" font-size="11" fill="#ffffff">Host C</text>
<rect x="548" y="80" width="42" height="136" rx="10" fill="#25262b"/>
<text x="569" y="148" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600" transform="rotate(-90 569 148)">MCP</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="660" y="79" width="76" height="28" rx="7"/>
<rect x="660" y="117" width="76" height="28" rx="7"/>
<rect x="660" y="155" width="76" height="28" rx="7"/>
<rect x="660" y="193" width="76" height="28" rx="7"/>
</g>
<text x="698" y="97" text-anchor="middle" font-size="10.5" fill="#25262b">Server</text>
<text x="698" y="135" text-anchor="middle" font-size="10.5" fill="#25262b">Server</text>
<text x="698" y="173" text-anchor="middle" font-size="10.5" fill="#25262b">Server</text>
<text x="698" y="211" text-anchor="middle" font-size="10.5" fill="#25262b">Server</text>
<text x="584" y="248" text-anchor="middle" font-size="10.5" fill="#6b6e76">两边各实现一次协议</text>
<text x="584" y="264" text-anchor="middle" font-size="10.5" fill="#6b6e76">发现、调用、流式、授权都复用</text>
<text x="400" y="302" text-anchor="middle" font-size="11" fill="#6b6e76">协议不会统一业务语义，也不会替你做权限设计——它消灭的是重复的连接胶水</text>
</svg>
<figcaption>图 1：MCP 想解决的第一个问题。把 N×M 的集成矩阵拆成两边各自对着同一份规范建设。</figcaption>
</figure>

MCP 试图把这个 **N×M 的集成矩阵**拆成两边围绕同一协议建设：AI 应用实现 MCP Host/Client，外部系统实现 MCP Server，双方通过稳定的消息和能力模型互操作。

这不会让业务语义自动统一，也不会消灭权限设计和数据治理，但它能把大量重复的「连接胶水」变成可复用的协议基础设施。

MCP 最初由 Anthropic 在 2024 年 11 月 25 日开源，目标是建立 AI 应用连接外部数据和工具的开放标准；2025 年 12 月，项目被捐赠给 Linux Foundation 旗下的 Agentic AI Foundation，以中立治理方式继续演进。[最初公告](https://www.anthropic.com/news/model-context-protocol)；[Linux Foundation 公告](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)。

## 二、MCP 到底是什么

一句较准确的定义是：

**MCP 是面向 AI 应用的开放应用层协议，用统一方式描述、发现和调用外部上下文与能力。**

这里每个词都重要：

- **应用层协议**：它规定消息语义、角色、能力和交互模式，不负责替代 TCP、HTTP 或进程管道。
- **面向 AI 应用**：真正收发 MCP 消息的通常是 Host 内的 Client，而不是神经网络模型本身。
- **外部上下文与能力**：既包含可读取的数据，也包含可执行动作和可复用工作流。
- **开放协议**：不同模型、客户端、服务端和语言 SDK 可以实现同一规范。

MCP 不是模型，不负责推理；不是 Agent 框架，不规定规划循环；不是向量数据库，不负责检索算法；不是插件商店，也不保证某个 Server 值得信任。它解决的是「怎样连接和交互」，而不是「模型应该怎样思考」或「第三方能力是否安全」。

官方入门文档把它比作 AI 应用的 USB-C 接口。这个类比适合解释标准化连接，但 MCP 实际还包含能力声明、消息语义、授权与用户交互等更高层约束。[官方介绍](https://modelcontextprotocol.io/docs/getting-started/intro)。

## 三、Host、Client、Server：MCP 的三层架构

MCP 采用 Host–Client–Server 架构。一个 Host 可以管理多个 Client，而每个 Client 只对应一个 Server。[官方架构规范](https://modelcontextprotocol.io/specification/2026-07-28/architecture)。

<figure class="diagram">
<svg viewBox="0 0 800 316" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MCP 的三层架构：Host 内部包含用户、模型、上下文与策略以及多个 Client，每个 Client 跨过信任边界连接一个 Server">
<text x="48" y="24" font-size="11" fill="#6b6e76" font-weight="600">一个 Host 管多个 Client；一个 Client 只连一个 Server</text>
<rect x="48" y="36" width="468" height="228" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="60" font-size="11" fill="#6b6e76" font-weight="600">MCP Host · 对话、模型、权限、编排、审计</text>
<rect x="64" y="72" width="104" height="44" rx="9" fill="#25262b"/>
<text x="116" y="100" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">用户</text>
<rect x="64" y="128" width="104" height="44" rx="9" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="116" y="156" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">LLM</text>
<rect x="188" y="72" width="136" height="100" rx="9" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="256" y="104" text-anchor="middle" font-size="11.5" fill="#25262b">上下文与策略</text>
<text x="256" y="126" text-anchor="middle" font-size="11.5" fill="#25262b">谁能调用什么</text>
<text x="256" y="148" text-anchor="middle" font-size="11.5" fill="#25262b">确认与审计</text>
<g fill="#25262b">
<rect x="344" y="72" width="156" height="44" rx="9"/>
<rect x="344" y="128" width="156" height="44" rx="9"/>
</g>
<text x="422" y="100" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">MCP Client A</text>
<text x="422" y="156" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">MCP Client B</text>
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="168" y1="94" x2="186" y2="94" marker-end="url(#mcp-a1)"/>
<line x1="168" y1="150" x2="186" y2="150" marker-end="url(#mcp-a1)"/>
<line x1="324" y1="94" x2="342" y2="94" marker-end="url(#mcp-a1)"/>
<line x1="324" y1="150" x2="342" y2="150" marker-end="url(#mcp-a1)"/>
</g>
<text x="64" y="204" font-size="11" fill="#6b6e76">模型看到的是 Host 整理过的视图——哪些工具定义、哪些结果进入上下文</text>
<text x="64" y="222" font-size="11" fill="#6b6e76">由 Host 决定，而不是把整条 MCP 连接摊开给它。</text>
<line x1="546" y1="36" x2="546" y2="264" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="5 5"/>
<text x="546" y="284" text-anchor="middle" font-size="10.5" fill="#6b6e76">信任边界</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="564" y="72" width="188" height="44" rx="9"/>
<rect x="564" y="128" width="188" height="44" rx="9"/>
</g>
<text x="658" y="100" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">文件 / 代码 Server</text>
<text x="658" y="156" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">数据库 / 业务 Server</text>
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="500" y1="94" x2="562" y2="94" marker-end="url(#mcp-a1)"/>
<line x1="500" y1="150" x2="562" y2="150" marker-end="url(#mcp-a1)"/>
</g>
<text x="531" y="84" text-anchor="middle" font-size="9.5" fill="#6b6e76">stdio</text>
<text x="531" y="140" text-anchor="middle" font-size="9.5" fill="#6b6e76">HTTP</text>
<text x="658" y="198" text-anchor="middle" font-size="10.5" fill="#6b6e76">只看到自己被调用的那部分</text>
<text x="658" y="216" text-anchor="middle" font-size="10.5" fill="#6b6e76">看不到对话全文，也看不到彼此</text>
<text x="400" y="306" text-anchor="middle" font-size="11" fill="#6b6e76">跨 Server 的编排留在 Host 里——单个 Server 被攻破或被诱导时，影响范围才是可控的</text>
</svg>
<figcaption>图 2：三层架构与那条虚线。Host 是唯一的策略执行点，Server 永远在边界之外。</figcaption>
</figure>

### 1. Host：安全边界与总协调者

Host 是用户真正使用的 AI 应用，例如桌面助手、IDE、命令行编码代理或企业聊天应用。它负责管理对话和模型上下文，创建并隔离多个 MCP Client，汇总来自不同 Server 的能力，决定哪些内容交给模型，展示授权、确认和敏感操作提示，以及执行组织策略和审计。

一个关键设计原则是：Server 不应该默认看到完整对话，也不应该「窥视」其他 Server。跨服务编排留在 Host 中，这能减小单个 Server 被攻破或恶意诱导后的影响范围。

### 2. Client：一对一的协议端点

Client 是 Host 内部的连接器。一个 Client 与一个特定 Server 通信，负责消息编码、版本与能力信息、请求关联、订阅、错误处理和传输适配。

因此，「某个聊天应用支持 MCP」和「某个模型支持 MCP」不是一回事。模型可能只看到 Host 整理后的工具定义和结果；真正理解线级协议的是 Client。

### 3. Server：聚焦能力的适配层

Server 将文件系统、数据库、SaaS API 或内部服务包装成 MCP 原语。它可以是本地子进程，也可以是远程服务。好的 Server 应聚焦一个清晰领域，暴露最小必要能力，并把底层系统的复杂性隐藏在稳定接口后面。

## 四、三类核心服务端原语

MCP 把 Server 暴露的主要能力分为 Prompts、Resources 和 Tools。它们的区别不仅是数据形态，更在于「谁掌握控制权」。[服务端能力概览](https://modelcontextprotocol.io/specification/2026-07-28/server)。

<figure class="diagram">
<svg viewBox="0 0 800 288" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="三类服务端原语的控制权对照：Prompts 由用户控制，Resources 由应用控制，Tools 由模型提出调用">
<text x="400" y="26" text-anchor="middle" font-size="11" fill="#6b6e76" font-weight="600">区别不在数据形态，而在谁按下那个按钮</text>
<g fill="#25262b">
<rect x="48" y="40" width="224" height="48" rx="10"/>
<rect x="288" y="40" width="224" height="48" rx="10"/>
<rect x="528" y="40" width="224" height="48" rx="10"/>
</g>
<text x="160" y="64" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="600">Prompts</text>
<text x="160" y="81" text-anchor="middle" font-size="11" fill="#c4c6cd">用户控制</text>
<text x="400" y="64" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="600">Resources</text>
<text x="400" y="81" text-anchor="middle" font-size="11" fill="#c4c6cd">应用控制</text>
<text x="640" y="64" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="600">Tools</text>
<text x="640" y="81" text-anchor="middle" font-size="11" fill="#c4c6cd">模型控制</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="48" y="96" width="224" height="132" rx="10"/>
<rect x="288" y="96" width="224" height="132" rx="10"/>
<rect x="528" y="96" width="224" height="132" rx="10"/>
</g>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="64" y="110" width="192" height="34" rx="7"/>
<rect x="64" y="150" width="192" height="34" rx="7"/>
<rect x="64" y="190" width="192" height="34" rx="7"/>
<rect x="304" y="110" width="192" height="34" rx="7"/>
<rect x="304" y="150" width="192" height="34" rx="7"/>
<rect x="304" y="190" width="192" height="34" rx="7"/>
<rect x="544" y="110" width="192" height="34" rx="7"/>
<rect x="544" y="150" width="192" height="34" rx="7"/>
<rect x="544" y="190" width="192" height="34" rx="7"/>
</g>
<text x="160" y="131" text-anchor="middle" font-size="11.5" fill="#25262b">显式发布的模板与工作流</text>
<text x="160" y="171" text-anchor="middle" font-size="11.5" fill="#25262b">/review-pr、会议纪要模板</text>
<text x="160" y="211" text-anchor="middle" font-size="11.5" fill="#25262b">用户从菜单或斜杠命令选</text>
<text x="400" y="131" text-anchor="middle" font-size="11.5" fill="#25262b">用 URI 寻址的只读上下文</text>
<text x="400" y="171" text-anchor="middle" font-size="11.5" fill="#25262b">file:/// 、git://、库表结构</text>
<text x="400" y="211" text-anchor="middle" font-size="11.5" fill="#25262b">Host 判断该不该注入</text>
<text x="640" y="131" text-anchor="middle" font-size="11.5" fill="#25262b">可执行的外部动作</text>
<text x="640" y="171" text-anchor="middle" font-size="11.5" fill="#25262b">搜索、查库存、建工单</text>
<text x="640" y="211" text-anchor="middle" font-size="11.5" fill="#25262b">模型提出，Host 决定执行</text>
<text x="400" y="270" text-anchor="middle" font-size="11" fill="#6b6e76">「模型控制」只是说模型能提出调用意图——它不是授权凭证，最终按钮仍在 Host 和用户手里</text>
</svg>
<figcaption>图 3：三类原语。选错原语的典型症状是「什么都做成 Tool」，于是用户失去了选择权，Host 也失去了注入时机的判断权。</figcaption>
</figure>

### Prompts：把高质量工作流产品化

Prompt 不是随意塞入模型的隐藏文本，而是 Server 显式发布、由用户或界面选择的模板。它可包含参数，并生成结构化消息。适合把领域专家的固定流程做成菜单、斜杠命令或表单入口。

### Resources：可寻址的上下文

Resource 用 URI 唯一标识，例如 `file:///project/README.md`、`git://repo/commit/...` 或自定义 URI。Client 可以列出、读取、缓存资源，并在 Host 判断合适时把内容交给模型。Resource 强调的是「数据是什么」，而不是「执行一个动作」。[Resources 规范](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)。

### Tools：可执行的外部能力

Tool 包含名称、描述、输入 Schema，可选输出 Schema 和 annotations。Client 通过 `tools/list` 发现工具，模型基于描述和上下文提出调用，Host 再决定是否执行 `tools/call`。[Tools 规范](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)。

需要警惕一个常见误解：**「模型控制」不等于「模型拥有最终权限」**。规范建议对敏感工具保留人类确认；Host 也应实施策略、参数检查、权限控制和审计。模型的选择只是调用意图，不是授权凭证。

## 五、协议内核：JSON-RPC、Schema、能力与错误

### 1. JSON-RPC 2.0 是消息骨架

MCP 使用 UTF-8 编码的 JSON-RPC 2.0。核心消息有三类：**Request** 带 `id`、`method` 和可选 `params`，需要响应；**Response** 用相同 `id` 返回 `result` 或 `error`；**Notification** 没有 `id`，接收方不返回响应。

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": { "city": "Shanghai" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "example-host",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

`2026-07-28` 规定普通成功结果必须包含 `resultType: "complete"`；需要更多输入时则返回 `resultType: "input_required"`。旧版本响应没有 `resultType` 时，新 Client 为兼容应将其视为 `complete`。[基础协议](https://modelcontextprotocol.io/specification/2026-07-28/basic)。

### 2. JSON Schema 让工具契约机器可读

Tool 的 `inputSchema` 描述参数，`outputSchema` 描述结构化输出。默认方言是 JSON Schema 2020-12。最新规范允许 `oneOf`、`anyOf`、`allOf`、条件和 `$defs/$ref` 等完整表达能力，输出的 `structuredContent` 也可以是任意 JSON 值。

Schema 同时是一项安全边界：实现不得默认联网解析外部 `$ref`，否则恶意 Schema 可能触发 SSRF；还应限制递归深度、子 Schema 数和验证时间，防止组合规则造成资源耗尽。[Schema 要求](https://modelcontextprotocol.io/specification/2026-07-28/basic#json-schema-usage)。

### 3. 能力声明避免「猜功能」

Server 通过 `server/discover` 发布支持的版本、Tools、Resources、Prompts 及扩展；Client 则在每个请求的 `_meta.io.modelcontextprotocol/clientCapabilities` 中声明自己能处理的功能，例如 Elicitation。

这不是装饰性元数据。若 Client 没声明某项能力，Server 就不能假设它能处理相应交互。能力机制使实现可以渐进增加功能，而不必要求所有端点一次性实现整套规范。

### 4. 错误模型：三层错误各归各位

MCP 的错误分三层，混在一起是新手最常见的实现问题。

**传输层错误。** 进程崩溃、连接断开、HTTP 5xx。它们发生在 JSON-RPC 之下，Client 只能重连或放弃，模型完全不该看到。

**协议层错误。** JSON-RPC 的 `error` 对象，表示「这条请求本身有问题」：方法不存在、参数不合法、版本不支持。除 JSON-RPC 标准码外，MCP 把 `-32020` 到 `-32099` 保留给规范自身，目前包含 Header Mismatch、Missing Required Client Capability 和 Unsupported Protocol Version。

**工具执行错误。** 查不到订单、余额不足、下游超时。这类结果**不应该**写成 JSON-RPC `error`，而应作为正常的 `tools/call` 成功响应返回，并在结果里标明失败。

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "result": {
    "resultType": "complete",
    "isError": true,
    "content": [{ "type": "text", "text": "订单 o_789 不存在或无权访问" }]
  }
}
```

区分的理由很实际：协议层错误说明 Client 写错了，重试同样的请求没有意义；工具执行错误则是**模型需要读到的信息**——它可以据此换一个参数、改用另一个工具，或者如实告诉用户。如果把「订单不存在」写成 JSON-RPC error，这条信息通常会在 Client 的错误处理里被吞掉，模型只会看到一句「调用失败」，然后原样重试。

顺带一提，`2026-07-28` 把 Resource Not Found 从 MCP 自定义的 `-32002` 改成了 JSON-RPC 标准的 `-32602 Invalid Params`——读一个不存在的 URI 属于参数问题，不需要一个专有错误码。

## 六、一次完整调用怎样发生

以「查询订单，缺少权限时让用户完成授权」为例，当前协议的典型路径如下。

<figure class="diagram">
<svg viewBox="0 0 800 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="一次带授权的工具调用的十四个步骤：发现、列举工具、模型选择、首次调用返回 input_required、用户授权、携带 inputResponses 重试、返回结果、注入模型">
<text x="48" y="24" font-size="11" fill="#6b6e76" font-weight="600">深色是人参与的步骤；白底是模型参与的步骤；浅灰是 Host 与 Server 之间的线级消息</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="48" y="40" width="704" height="28" rx="7"/>
<rect x="48" y="73" width="704" height="28" rx="7"/>
<rect x="48" y="106" width="704" height="28" rx="7"/>
<rect x="48" y="139" width="704" height="28" rx="7"/>
<rect x="48" y="271" width="704" height="28" rx="7"/>
<rect x="48" y="304" width="704" height="28" rx="7"/>
<rect x="48" y="403" width="704" height="28" rx="7"/>
<rect x="48" y="436" width="704" height="28" rx="7"/>
</g>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.4">
<rect x="48" y="172" width="704" height="28" rx="7"/>
<rect x="48" y="205" width="704" height="28" rx="7"/>
<rect x="48" y="469" width="704" height="28" rx="7"/>
<rect x="48" y="502" width="704" height="28" rx="7"/>
</g>
<g fill="#25262b">
<rect x="48" y="337" width="704" height="28" rx="7"/>
<rect x="48" y="370" width="704" height="28" rx="7"/>
</g>
<g font-size="10.5" fill="#6b6e76">
<text x="64" y="59">Host → Server</text>
<text x="64" y="92">Server → Host</text>
<text x="64" y="125">Host → Server</text>
<text x="64" y="158">Server → Host</text>
<text x="64" y="191">Host → LLM</text>
<text x="64" y="224">LLM → Host</text>
<text x="64" y="290">Host → Server</text>
<text x="64" y="323">Server → Host</text>
<text x="64" y="422">Host → Server</text>
<text x="64" y="455">Server → Host</text>
<text x="64" y="488">Host → LLM</text>
<text x="64" y="521">LLM → Host</text>
</g>
<g font-size="10.5" fill="#c4c6cd">
<text x="64" y="356">Host → 用户</text>
<text x="64" y="389">用户 → Host</text>
</g>
<g font-size="12" fill="#25262b">
<text x="176" y="59">server/discover（Client 可选调用，Server 必须实现）</text>
<text x="176" y="92">返回支持的协议版本、能力与扩展</text>
<text x="176" y="125">tools/list</text>
<text x="176" y="158">工具列表，附 ttlMs 与 cacheScope</text>
<text x="176" y="191">只交出这一轮相关的工具定义，不是整份清单</text>
<text x="176" y="224">提出调用 get_order(order_id)</text>
<text x="176" y="290">tools/call，_meta 里带协议版本与客户端能力</text>
<text x="176" y="323">resultType = input_required，附 inputRequests 与 requestState</text>
<text x="176" y="422">重试同一个请求，附 inputResponses 与原样的 requestState</text>
<text x="176" y="455">resultType = complete，返回订单数据</text>
<text x="176" y="488">注入工具结果</text>
<text x="176" y="521">生成面向用户的回答</text>
</g>
<g font-size="12" fill="#ffffff">
<text x="176" y="356">展示域名、原因与影响范围，请求授权</text>
<text x="176" y="389">完成授权</text>
</g>
<line x1="400" y1="240" x2="400" y2="264" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<text x="400" y="550" text-anchor="middle" font-size="11" fill="#6b6e76">第 8 到第 11 步就是 MRTR：Server 全程没有主动发起过任何一条 JSON-RPC Request</text>
</svg>
<figcaption>图 4：一次带授权的完整调用。注意第 5 步——模型拿到的从来不是整条 MCP 连接，而是 Host 挑过的那一小份。</figcaption>
</figure>

这里有几个容易忽略的要点：

1. `server/discover` 对 Server 是强制实现，对 Client 是可选调用。Client 也可以直接发业务请求，在收到 `UnsupportedProtocolVersionError` 后选择共同版本重试。[版本与兼容](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)。
2. 模型通常不直接读取整个 MCP 连接；Host 选择相关工具定义交给模型，防止上下文无限膨胀。
3. Server 不能在任意时刻突然向 Client 发起 JSON-RPC Request。它只能在处理一个已有请求时，以 `InputRequiredResult` 表达所需输入。
4. Host 收集用户输入、模型采样结果或 Roots 信息后，携带 `inputResponses` 和原样返回的 `requestState` 重试原请求。这种模式叫 **Multi Round-Trip Requests，MRTR**。

## 七、传输层：stdio 与 Streamable HTTP

MCP 的消息语义与传输分离。标准传输只有两种：stdio 和 Streamable HTTP。SSE 不是第三种传输，而是 Streamable HTTP 某些响应采用的流式编码方式。[传输概览](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)。

<figure class="diagram">
<svg viewBox="0 0 800 318" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="两种标准传输的线级对照：stdio 用 stdin 与 stdout 换行分帧、日志走 stderr；Streamable HTTP 每条消息一个 POST，响应可以是单个 JSON 或该请求的 SSE 流">
<rect x="48" y="44" width="336" height="228" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="68" font-size="11" fill="#6b6e76" font-weight="600">stdio · 同机子进程</text>
<rect x="64" y="84" width="100" height="44" rx="9" fill="#25262b"/>
<text x="114" y="112" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">Client</text>
<rect x="268" y="84" width="100" height="44" rx="9" fill="#25262b"/>
<text x="318" y="112" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">Server</text>
<line x1="166" y1="98" x2="264" y2="98" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<line x1="266" y1="118" x2="168" y2="118" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<text x="215" y="93" text-anchor="middle" font-size="10" fill="#6b6e76">stdin</text>
<text x="215" y="134" text-anchor="middle" font-size="10" fill="#6b6e76">stdout</text>
<line x1="318" y1="128" x2="318" y2="160" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<rect x="252" y="164" width="116" height="30" rx="7" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="310" y="184" text-anchor="middle" font-size="11" fill="#25262b">stderr · 日志</text>
<text x="64" y="218" font-size="10.5" fill="#6b6e76">一行一条消息，消息里不能有裸换行</text>
<text x="64" y="236" font-size="10.5" fill="#6b6e76">stdout 只允许出现合法 MCP 消息</text>
<text x="64" y="254" font-size="10.5" fill="#6b6e76">取消用 notifications/cancelled</text>
<rect x="416" y="44" width="336" height="228" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="432" y="68" font-size="11" fill="#6b6e76" font-weight="600">Streamable HTTP · 单一 endpoint</text>
<rect x="432" y="84" width="100" height="44" rx="9" fill="#25262b"/>
<text x="482" y="112" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">Client</text>
<rect x="636" y="84" width="100" height="44" rx="9" fill="#25262b"/>
<text x="686" y="112" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">Server</text>
<line x1="534" y1="106" x2="632" y2="106" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<text x="583" y="100" text-anchor="middle" font-size="10" fill="#6b6e76">POST /mcp</text>
<path d="M686 128 V140 H504 V144" fill="none" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<path d="M686 128 V140 H664 V144" fill="none" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="432" y="146" width="144" height="32" rx="7"/>
<rect x="592" y="146" width="144" height="32" rx="7"/>
</g>
<text x="504" y="167" text-anchor="middle" font-size="11" fill="#25262b">单个 JSON 响应</text>
<text x="664" y="167" text-anchor="middle" font-size="11" fill="#25262b">该请求的 SSE 流</text>
<text x="432" y="202" font-size="10.5" fill="#6b6e76">Header 必带 MCP-Protocol-Version、Mcp-Method</text>
<text x="432" y="220" font-size="10.5" fill="#6b6e76">按名字寻址的三类方法还要带 Mcp-Name</text>
<text x="432" y="238" font-size="10.5" fill="#6b6e76">没有 GET 事件流，也没有 Mcp-Session-Id</text>
<text x="432" y="256" font-size="10.5" fill="#6b6e76">客户端关掉该请求的流即表示取消</text>
<text x="400" y="302" text-anchor="middle" font-size="11" fill="#6b6e76">SSE 不是第三种传输，只是 Streamable HTTP 某些响应采用的流式编码</text>
</svg>
<figcaption>图 5：两种标准传输。左边把复杂度交给操作系统，右边把复杂度交给已经很成熟的 HTTP 基础设施。</figcaption>
</figure>

### 1. stdio：本地子进程与换行分帧

在 stdio 模式中，Client 启动 Server 子进程：

- Client 向 Server 的 `stdin` 写 JSON-RPC；
- Server 从 `stdout` 返回 JSON-RPC；
- 每条消息占一行，消息内部不能包含原始换行；
- `stdout` 只能出现合法 MCP 消息，日志必须写到 `stderr`；
- 多个并发请求共享同一字节流，依靠 JSON-RPC `id` 关联响应；
- 取消请求时，Client 发送 `notifications/cancelled`；
- 关闭时先关闭 Server 的输入流，必要时再升级为进程强制终止。

stdio 的优势是简单、延迟低、不必暴露网络端口，适合本地文件、IDE 和开发工具。风险是 Server 进程通常继承 Client 的用户权限和一部分环境；安装一个不可信本地 Server，本质上接近运行一段不可信代码。应限制可执行命令、环境变量、文件和网络访问，并尽量使用沙箱。[stdio 规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)。

新版还有一个反直觉点：**stdio 进程不是会话，也不等于某一段对话**。Host 可以在同一个进程中交错处理不同任务；Server 不得通过「这是同一根管道」推断共享上下文。

### 2. Streamable HTTP：单端点、逐请求 POST、可选 SSE

远程 Server 通常使用 Streamable HTTP。`2026-07-28` 的核心规则是：

- Server 暴露一个 MCP endpoint，例如 `https://example.com/mcp`；
- 每一条 JSON-RPC 消息都是独立 HTTP POST；
- Client 的 `Accept` 同时声明 `application/json` 与 `text/event-stream`；
- Server 可返回单个 JSON 响应，也可返回与该请求绑定的 SSE 流；
- SSE 流可以先发送 progress/log 等相关 Notification，最后发送正式 Response；
- Client 关闭该请求的 SSE 流即表示取消请求；
- 不再提供 GET 事件流端点，也没有 `Mcp-Session-Id`；
- `Last-Event-ID`、事件重放和断点续传已移除。中断后应以新 request id 重发，并依靠业务幂等设计避免重复副作用。

HTTP 请求还必须镜像关键元数据：

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: get_weather
Authorization: Bearer <access-token>
```

`Mcp-Method` 适用于全部请求；`tools/call`、`resources/read`、`prompts/get` 还要求 `Mcp-Name`。消息体仍是真实来源；Header 与 Body 不一致时 Server 必须拒绝。这样，网关可以不深度解析 JSON 就完成路由、限流、观测和策略判断。[Streamable HTTP 规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)。

### 3. `subscriptions/listen`：长时通知的专用请求

工具列表、资源列表或某个资源变化时，Client 可以发起长生命周期的 `subscriptions/listen` 请求，并选择希望接收的事件类型。其 HTTP 响应保持为 SSE 流；stdio 下则继续复用 stdout，由 `subscriptionId` 区分。

它与普通请求的进度流不同：普通请求的 progress 只走该请求自己的响应流；全局变更通知才走 listen 流。断线不会自动补发历史事件，因此 Client 重新连接后应重新拉取依赖的列表或资源，把事件当作「缓存可能过期」的信号，而不是唯一事实来源。

### 4. 如何选择传输

| 维度 | stdio | Streamable HTTP |
|---|---|---|
| 典型部署 | 同机本地进程 | 远程、多租户服务 |
| 分帧 | 一行一个 JSON-RPC | 一请求一个 POST；JSON 或 SSE 响应 |
| 身份与授权 | 环境、进程或自定义机制 | OAuth/HTTP Authorization |
| 扩缩容 | 随 Host 启停子进程 | 适合负载均衡和水平扩容 |
| 取消 | `notifications/cancelled` | 关闭请求响应流 |
| 主要风险 | 本地代码执行与权限过大 | OAuth、SSRF、DNS rebinding、跨租户隔离 |

## 八、「无状态协议」究竟意味着什么

`2026-07-28` 最大的变化，是把协议状态从连接上拿掉。

<figure class="diagram">
<svg viewBox="0 0 800 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="旧版把协议状态挂在连接上，负载均衡必须粘住同一台实例；新版每个请求自描述，任意实例都能处理">
<text x="48" y="24" font-size="11" fill="#6b6e76" font-weight="600">2025-11-25 及更早 · 状态挂在连接上</text>
<rect x="48" y="34" width="704" height="118" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<rect x="64" y="60" width="110" height="44" rx="9" fill="#25262b"/>
<text x="119" y="88" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">Client</text>
<line x1="176" y1="82" x2="196" y2="82" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<rect x="200" y="60" width="340" height="44" rx="9" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="370" y="78" text-anchor="middle" font-size="11.5" fill="#25262b">initialize → 能力协商 → Mcp-Session-Id</text>
<text x="370" y="95" text-anchor="middle" font-size="10.5" fill="#6b6e76">之后每条请求都依赖这份连接级上下文</text>
<line x1="542" y1="82" x2="562" y2="82" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<rect x="566" y="60" width="170" height="44" rx="9" fill="#25262b"/>
<text x="651" y="88" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">只能是实例 #1</text>
<text x="64" y="134" font-size="10.5" fill="#6b6e76">负载均衡要粘住同一台机器；网关光看 Header 判断不出这条请求在做什么</text>
<line x1="400" y1="156" x2="400" y2="176" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a2)"/>
<text x="48" y="194" font-size="11" fill="#6b6e76" font-weight="600">2026-07-28 · 状态回到每一个请求里</text>
<rect x="48" y="204" width="704" height="118" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<rect x="64" y="230" width="110" height="44" rx="9" fill="#25262b"/>
<text x="119" y="258" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">Client</text>
<line x1="176" y1="252" x2="196" y2="252" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<rect x="200" y="230" width="340" height="44" rx="9" fill="#25262b"/>
<text x="370" y="248" text-anchor="middle" font-size="11.5" fill="#ffffff">每请求 _meta：协议版本 · 客户端能力 · 可选身份</text>
<text x="370" y="265" text-anchor="middle" font-size="10.5" fill="#c4c6cd">授权凭据随 HTTP 请求一起到达</text>
<line x1="542" y1="252" x2="562" y2="252" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="566" y="230" width="54" height="44" rx="9"/>
<rect x="624" y="230" width="54" height="44" rx="9"/>
<rect x="682" y="230" width="54" height="44" rx="9"/>
</g>
<text x="593" y="258" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">#1</text>
<text x="651" y="258" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">#2</text>
<text x="709" y="258" text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">#3</text>
<text x="64" y="304" font-size="10.5" fill="#6b6e76">任意一台健康实例都能处理；业务状态改用显式句柄表达，不再藏在连接里</text>
</svg>
<figcaption>图 6：状态搬家。请求变得自描述之后，MCP 才真正能落在普通负载均衡、缓存和网关之上。</figcaption>
</figure>

旧模型先 `initialize`，Server 返回能力和可能的 `Mcp-Session-Id`，后续请求依赖这一连接级上下文。远程部署因此常需要粘性会话或共享 session store；网关也难以仅凭 Header 判断请求含义。

新模型要求每个请求自描述：协议版本、Client 能力以及可选 Client 身份都在 `_meta` 内，授权凭据也随 HTTP 请求到达。任意健康 Server 实例都可以处理它，负载均衡器无需记住「这个 Client 上次去了哪台机器」。[无状态规则](https://modelcontextprotocol.io/specification/2026-07-28/basic#statelessness)。

无状态并不等于业务不能保存状态。购物篮、浏览器页面、数据库事务或长任务仍可能跨调用存在。区别在于状态必须显式化：

```text
create_basket()              -> { "basket_id": "b_123" }
add_item(basket_id="b_123")  -> { "ok": true }
checkout(basket_id="b_123")  -> { "order_id": "o_789" }
```

`basket_id` 是应用层句柄，可以被模型看到、推理和传递；它不再隐藏于传输连接或 MCP session 中。工程代价是 Server 作者必须设计句柄的权限绑定、过期、幂等和不可猜测性；收益是请求可路由、可重试、可追踪，也更容易跨进程扩容。

## 九、授权与安全：协议统一不等于自动可信

### 1. HTTP 授权模型

MCP 的 HTTP 授权框架把受保护的 MCP Server 视为 OAuth Resource Server，把 MCP Client 视为 OAuth Client，Authorization Server 负责用户认证、同意和发放 Token。授权是可选能力；若使用 HTTP，应遵循规范；stdio 不应套用该流程，而应从环境或本地安全设施取得凭据。[授权规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)。

<figure class="diagram">
<svg viewBox="0 0 800 308" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MCP 的 HTTP 授权三个角色：MCP Client 作为 OAuth Client、Authorization Server 负责认证与发放 Token、MCP Server 作为 Resource Server；下方是四条必须自己实现的校验">
<g fill="#25262b">
<rect x="48" y="48" width="216" height="64" rx="10"/>
<rect x="292" y="48" width="216" height="64" rx="10"/>
<rect x="536" y="48" width="216" height="64" rx="10"/>
</g>
<text x="156" y="76" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">MCP Client</text>
<text x="156" y="95" text-anchor="middle" font-size="10.5" fill="#c4c6cd">OAuth Client</text>
<text x="400" y="76" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">Authorization Server</text>
<text x="400" y="95" text-anchor="middle" font-size="10.5" fill="#c4c6cd">认证 · 同意 · 发放 Token</text>
<text x="644" y="76" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">MCP Server</text>
<text x="644" y="95" text-anchor="middle" font-size="10.5" fill="#c4c6cd">OAuth Resource Server</text>
<line x1="266" y1="80" x2="288" y2="80" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<line x1="510" y1="80" x2="532" y2="80" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<text x="277" y="130" text-anchor="middle" font-size="10" fill="#6b6e76">取 Token</text>
<text x="521" y="130" text-anchor="middle" font-size="10" fill="#6b6e76">带 Token</text>
<rect x="48" y="152" width="704" height="110" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="176" font-size="11" fill="#6b6e76" font-weight="600">协议不会替你做的四件事</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="64" y="186" width="159" height="56" rx="8"/>
<rect x="235" y="186" width="159" height="56" rx="8"/>
<rect x="406" y="186" width="159" height="56" rx="8"/>
<rect x="577" y="186" width="159" height="56" rx="8"/>
</g>
<text x="143" y="210" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="600">校验响应里的 iss</text>
<text x="143" y="228" text-anchor="middle" font-size="10.5" fill="#6b6e76">存在就必须验</text>
<text x="314" y="210" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="600">凭据按签发者隔离</text>
<text x="314" y="228" text-anchor="middle" font-size="10.5" fill="#6b6e76">不跨 AS 复用</text>
<text x="485" y="210" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="600">只收给自己的 Token</text>
<text x="485" y="228" text-anchor="middle" font-size="10.5" fill="#6b6e76">校验 audience</text>
<text x="656" y="210" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="600">不向下游透传</text>
<text x="656" y="228" text-anchor="middle" font-size="10.5" fill="#6b6e76">避免 confused deputy</text>
<text x="400" y="292" text-anchor="middle" font-size="11" fill="#6b6e76">stdio 不套用这套流程——凭据应来自环境变量或本地安全设施，而不是走一遍 OAuth</text>
</svg>
<figcaption>图 7：授权的角色划分。三个方框是协议给的，下面那四件事是实现者自己的责任。</figcaption>
</figure>

`2026-07-28` 进一步收紧了授权：Client 必须校验授权响应中的 `iss`（若存在），持久化 Client 凭据必须按签发者隔离，不得把某个 Authorization Server 的凭据复用于另一个；OAuth Client ID Metadata Documents 成为推荐注册方式，Dynamic Client Registration 被弃用但暂留兼容。

### 2. 五条不能交给协议「自动解决」的安全原则

**最小权限。** 工具、资源和 OAuth scope 都应按实际操作拆分。读取订单与退款不应共用一个全能 scope；需要高权限时应进行 step-up authorization。

**用户确认。** 删除、转账、发布、发送消息等高影响操作不能只凭模型的一次 Tool Call 就执行。Host 应明确显示 Server、动作、关键参数和影响。

**把描述当不可信输入。** Tool description、Resource 内容和返回文本都可能包含提示注入。它们不能覆盖系统策略，也不能成为授权依据。Tool annotations 只能辅助 UI，不是可信的安全证明。

**限制本地 Server。** 一键安装必须展示完整启动命令，最好实施代码签名、来源校验和沙箱。不要让本地 HTTP Server 绑定 `0.0.0.0`；Streamable HTTP 必须校验 `Origin`，本地服务宜绑定 `127.0.0.1`，以降低 DNS rebinding 风险。

**防止 Token 透传与 SSRF。** Server 不应把收到的 Token 原样转发到下游，也不应接受不是为自己签发的 Token。Client 在 OAuth 元数据发现中要限制协议、私网地址、重定向和 DNS 变化，避免被恶意 Server 引导访问云元数据或内网服务。官方的[安全最佳实践](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)详细讨论了 confused deputy、Token passthrough、SSRF、DNS rebinding 和本地 Server compromise。

## 十、2026-07-28 最新稳定版详细更新

这不是在旧协议上增加几个字段，而是把 MCP 的分布式运行模型重新整理了一遍。

### 1. 移除握手和协议级会话

`initialize`、`notifications/initialized` 和 `Mcp-Session-Id` 被移除。协议版本和能力改为每请求携带。直接结果是：

- Server 不应从连接推断身份、能力或对话；
- HTTP 请求可被普通负载均衡器分发到任意实例；
- 不再需要为 MCP 协议本身维护粘性路由或共享 Session Store；
- 授权、租户和业务句柄必须显式出现在每次请求可验证的位置。

### 2. 新增 `server/discover`

所有现代 Server 必须实现 `server/discover`，返回支持的协议版本和能力。Client 可以先发现再调用，也可以乐观调用并在收到 `-32022 UnsupportedProtocolVersion` 后降级重试。stdio 下它还承担「现代 Server 或旧握手 Server」的探测作用。

### 3. MRTR 取代 Server 主动 Request

旧版允许 Server 在 SSE 或双向通道中向 Client 发 `sampling/createMessage`、`elicitation/create`、`roots/list` 等 Request。新版禁止 Server 发起 JSON-RPC Request，改由 `InputRequiredResult` 表示「当前请求尚未完成，还需要输入」。

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "result": {
    "resultType": "input_required",
    "inputRequests": {
      "confirm": {
        "type": "elicitation",
        "message": "确认删除 3 个文件吗？",
        "schema": { "type": "boolean" }
      }
    },
    "requestState": "opaque-server-state"
  }
}
```

<figure class="diagram">
<svg viewBox="0 0 800 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MRTR 的两次往返：首次调用返回 input_required 与 requestState，Client 收集输入后带着 inputResponses 重试同一个请求，Server 才返回 complete">
<rect x="96" y="40" width="168" height="36" rx="9" fill="#25262b"/>
<text x="180" y="63" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">Host / MCP Client</text>
<rect x="536" y="40" width="168" height="36" rx="9" fill="#25262b"/>
<text x="620" y="63" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">MCP Server</text>
<line x1="180" y1="76" x2="180" y2="292" stroke="#c4c6cd" stroke-width="1.2" stroke-dasharray="4 4"/>
<line x1="620" y1="76" x2="620" y2="292" stroke="#c4c6cd" stroke-width="1.2" stroke-dasharray="4 4"/>
<line x1="180" y1="110" x2="616" y2="110" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<text x="400" y="103" text-anchor="middle" font-size="10.5" fill="#6b6e76">tools/call（第 1 轮，id = 42）</text>
<line x1="620" y1="152" x2="184" y2="152" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<text x="400" y="145" text-anchor="middle" font-size="10.5" fill="#6b6e76">resultType = input_required + inputRequests + requestState</text>
<rect x="96" y="180" width="168" height="38" rx="8" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2"/>
<text x="180" y="204" text-anchor="middle" font-size="11" fill="#25262b">收集 inputResponses</text>
<text x="292" y="194" font-size="10.5" fill="#6b6e76">向用户要一次确认，或让模型做一次采样</text>
<text x="292" y="212" font-size="10.5" fill="#6b6e76">requestState 原样保存，不由 Client 或模型改写</text>
<line x1="180" y1="252" x2="616" y2="252" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<text x="400" y="245" text-anchor="middle" font-size="10.5" fill="#6b6e76">重试同一个请求（新 id）+ inputResponses + requestState</text>
<line x1="620" y1="288" x2="184" y2="288" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<text x="400" y="281" text-anchor="middle" font-size="10.5" fill="#6b6e76">resultType = complete</text>
<text x="400" y="324" text-anchor="middle" font-size="11" fill="#6b6e76">中间交互不再依赖原连接存活，任何用户提示也都能追溯到一次由 Client 发起的操作</text>
</svg>
<figcaption>图 8：MRTR。Server 想要东西时不能「回头呼叫」，只能把请求挂起、说明缺什么，然后等 Client 带着答案再来一次。</figcaption>
</figure>

Client 获得用户答案后重试原请求。`requestState` 应被视为 Server 生成的不透明状态，不应由 Client 或模型修改。这个设计让中间交互不依赖原连接仍然存活，并保证用户提示总能追溯到一个由 Client 发起的操作。

### 4. 订阅机制统一

HTTP GET 流、`resources/subscribe` 和 `resources/unsubscribe` 被 `subscriptions/listen` 取代。Client 主动声明关心的工具列表、Prompt 列表、Resource 列表或具体 Resource 更新，Server 只发送已同意的通知类型。

同时取消 SSE 的 `Last-Event-ID` 恢复和消息重放。设计思路是让列表读取结果可缓存、通知只负责失效提示；断线后的正确动作是重新同步状态，而不是假设事件日志永远可重放。

### 5. 更适合网关的 Header、缓存和追踪

- Streamable HTTP 强制 `Mcp-Method` 与必要时的 `Mcp-Name`；
- Tool Schema 可以用 `x-mcp-header` 把特定原始参数镜像为 `Mcp-Param-*`，便于网关做分片或策略；
- `tools/list`、`prompts/list`、`resources/list`、`resources/read`、`resources/templates/list` 的结果加入 `ttlMs` 和 `cacheScope`；
- `_meta` 约定 W3C Trace Context 的 `traceparent`、`tracestate`、`baggage`，便于串起 Host、SDK、Server 和下游系统的分布式追踪。

这些变化体现了一个明确方向：MCP 不再假设自己运行在一条需要深度理解协议的特殊长连接上，而是尽量适配成熟的 HTTP 网关、缓存、限流、负载均衡和 OpenTelemetry 设施。

### 6. Extensions 成为一等公民

Client 和 Server 能在 capabilities 的 `extensions` Map 中按反向域名 ID 声明扩展，例如 `io.modelcontextprotocol/tasks`。扩展可以独立于核心规范演进；一方不支持时，另一方必须回退到核心行为或明确拒绝。

本版包含两个重要官方扩展方向：

- **MCP Apps**：Server 可以声明交互式 HTML UI，Host 在沙箱 iframe 内渲染；UI 发起的操作仍经过 Host 的调用、授权和审计路径。[MCP Apps 概览](https://modelcontextprotocol.io/extensions/apps/overview)
- **Tasks**：长任务从 `2025-11-25` 的实验性核心功能迁出。Server 可以返回 Task Handle，Client 用 `tasks/get` 轮询、`tasks/update` 补充输入、`tasks/cancel` 取消。旧实验 API 与新扩展不具备线级兼容性。[Tasks Extension](https://modelcontextprotocol.io/seps/2663-tasks-extension)

### 7. 弃用策略正式建立

新策略把能力分为 Active、Deprecated 和 Removed，并设定至少 12 个月的弃用窗口。

<figure class="diagram">
<svg viewBox="0 0 800 296" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="能力生命周期：Active 到 Deprecated 到 Removed，中间至少间隔十二个月；下方列出本次进入弃用的六项能力">
<g>
<rect x="68" y="52" width="200" height="52" rx="10" fill="#25262b"/>
<rect x="300" y="52" width="200" height="52" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<rect x="532" y="52" width="200" height="52" rx="10" fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2" stroke-dasharray="5 4"/>
</g>
<text x="168" y="76" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">Active</text>
<text x="168" y="93" text-anchor="middle" font-size="10.5" fill="#c4c6cd">推荐使用</text>
<text x="400" y="76" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Deprecated</text>
<text x="400" y="93" text-anchor="middle" font-size="10.5" fill="#6b6e76">仍可运行，但不该再作首选</text>
<text x="632" y="76" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">Removed</text>
<text x="632" y="93" text-anchor="middle" font-size="10.5" fill="#6b6e76">从规范里删掉</text>
<line x1="270" y1="78" x2="296" y2="78" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<line x1="502" y1="78" x2="528" y2="78" stroke="#c4c6cd" stroke-width="1.5" marker-end="url(#mcp-a1)"/>
<text x="283" y="122" text-anchor="middle" font-size="10" fill="#6b6e76">标记弃用</text>
<text x="515" y="122" text-anchor="middle" font-size="10" fill="#6b6e76">至少 12 个月后</text>
<rect x="48" y="140" width="704" height="120" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="164" font-size="11" fill="#6b6e76" font-weight="600">本次进入 Deprecated 的六项</text>
<g fill="#f4f5f7" stroke="#c4c6cd" stroke-width="1.2">
<rect x="64" y="172" width="216" height="34" rx="7"/>
<rect x="292" y="172" width="216" height="34" rx="7"/>
<rect x="520" y="172" width="216" height="34" rx="7"/>
<rect x="64" y="214" width="216" height="34" rx="7"/>
<rect x="292" y="214" width="216" height="34" rx="7"/>
<rect x="520" y="214" width="216" height="34" rx="7"/>
</g>
<text x="172" y="193" text-anchor="middle" font-size="11.5" fill="#25262b">Roots → 改用工具参数</text>
<text x="400" y="193" text-anchor="middle" font-size="11.5" fill="#25262b">Sampling → Server 直连模型</text>
<text x="628" y="193" text-anchor="middle" font-size="11.5" fill="#25262b">Logging → stderr / OTel</text>
<text x="172" y="235" text-anchor="middle" font-size="11.5" fill="#25262b">旧 HTTP+SSE 传输</text>
<text x="400" y="235" text-anchor="middle" font-size="11.5" fill="#25262b">includeContext 的两个值</text>
<text x="628" y="235" text-anchor="middle" font-size="11.5" fill="#25262b">OAuth 动态客户端注册</text>
<text x="400" y="284" text-anchor="middle" font-size="11" fill="#6b6e76">Deprecated 不等于本版立刻不能用；但新写的实现不该再把它们当成架构前提</text>
</svg>
<figcaption>图 9：弃用窗口。十二个月是下限而非承诺上限——真正的信号是「新实现不要再往这上面建东西」。</figcaption>
</figure>

具体地说，Roots 建议改为通过 Tool 参数、Resource URI 或 Server 配置传入目录和文件；Sampling 建议 Server 直接集成模型供应商 API；Logging 在 stdio 下使用 `stderr`，结构化观测使用 OpenTelemetry；旧 HTTP+SSE 传输迁移到 Streamable HTTP；`includeContext` 的 `thisServer` 与 `allServers` 不再使用；OAuth Dynamic Client Registration 优先换成 Client ID Metadata Documents。

### 8. Schema、结果和错误进一步标准化

- 所有成功结果增加必需的 `resultType`；
- Tool 的输入与输出完整采用 JSON Schema 2020-12 能力；
- `structuredContent` 不再限于对象；
- Resource Not Found 从 MCP 自定义 `-32002` 改为 JSON-RPC `-32602 Invalid Params`；
- MCP 将 `-32020` 至 `-32099` 保留给规范错误；当前包含 Header Mismatch、Missing Required Client Capability 和 Unsupported Protocol Version。

### 9. 新旧版本的核心差异

| 主题 | `2025-11-25` 及更早 | `2026-07-28` |
|---|---|---|
| 初始化 | `initialize` + `initialized` | 无握手；每请求自描述 |
| 协议状态 | 连接/Session 级 | 协议级无状态 |
| HTTP Session | 可用 `Mcp-Session-Id` | 移除 |
| Server 向 Client 要输入 | Server 主动 JSON-RPC Request | `InputRequiredResult` + 重试原请求 |
| 独立通知流 | HTTP GET/SSE 和分散订阅 | `subscriptions/listen` POST 响应流 |
| SSE 恢复 | 可用 Event ID / `Last-Event-ID` | 不支持；断线后重发和重新同步 |
| 版本协商 | 初始化阶段协商 | 每请求声明；可 `server/discover` |
| 列表缓存 | 主要依赖变更通知 | `ttlMs` + `cacheScope` + 通知 |
| Tasks | 实验性核心能力 | 官方扩展，API 重做 |
| 扩展 | 有限、流程不完整 | 正式扩展框架和独立演进 |

## 十一、迁移到 2026-07-28 的工程清单

如果已有 `2025-11-25` 或更早实现，迁移应被当作协议版本升级，而不是简单更新 SDK：

1. **先确认 SDK 与对端支持。** 规范发布不等于所有 Client、Server 和 SDK 已同步采用；保留版本探测和降级路径。
2. **实现双时代兼容。** 现代模式用每请求 `_meta`；旧模式仍走 `initialize`。stdio 通过 `server/discover` 探测，HTTP 依据现代错误体与状态码判断。
3. **移除对连接状态的依赖。** 不再用连接、进程或 Session ID 代表用户、租户、对话或任务。
4. **显式化业务状态。** 为跨调用对象设计不可猜测、权限绑定、可过期的 Handle；写操作设计 Idempotency Key 或重复请求防护。
5. **更新结果解析。** 处理 `complete`、`input_required` 和扩展定义的 `resultType`；兼容旧响应缺少该字段的情况。
6. **将反向调用改为 MRTR。** 不要等待 Server 在独立流上发 Request；保存并回传 `requestState`，正确关联多个 `inputRequests`。
7. **重做通知。** 使用 `subscriptions/listen`，断线后重新订阅并重新读取权威状态；不要依赖事件重放。
8. **更新 HTTP 层。** 删除 GET stream 与 `Mcp-Session-Id`，按要求发送并校验 `MCP-Protocol-Version`、`Mcp-Method`、`Mcp-Name`。
9. **接入缓存与观测。** 正确区分 public/private cache scope，尊重 TTL，并传播 W3C Trace Context。
10. **迁移 Tasks。** 不再调用旧 `tasks/result` 或依赖 `tasks/list`；按官方扩展重新实现完整生命周期。
11. **检查 Schema 和错误码。** 支持 JSON Schema 2020-12，限制复杂 Schema 资源消耗，同时兼容旧 `-32002` 但新请求使用 `-32602`。
12. **重新做安全评审。** 无状态减少了会话劫持面，却不自动解决 Token、权限、SSRF、Prompt Injection、重复写入和本地代码执行。

## 十二、MCP 与相邻技术有什么不同

### MCP 与 Function Calling

Function Calling 通常是模型 API 内部的「模型如何输出结构化调用意图」；MCP 是应用与外部能力之间的发现、调用和传输协议。Host 常把 MCP Tool 转换成模型供应商的 Function/Tool 定义，再把模型生成的调用映射回 `tools/call`。两者互补，不是替代关系。

### MCP 与 OpenAPI

OpenAPI 描述 HTTP API 的路径、参数和响应；MCP 描述 AI 应用可发现的 Resources、Prompts、Tools 以及围绕它们的交互、安全和流式模式。MCP Server 完全可以在内部调用一个 OpenAPI 服务，也可以从 OpenAPI 自动生成 Tool，但二者抽象层不同。

### MCP 与 RAG

RAG 是检索并把相关内容加入模型上下文的应用模式。MCP Resource 或 Tool 可以成为 RAG 的数据入口，但 MCP 不规定 Embedding、向量库、切块、排序或召回算法。

### MCP 与 Agent-to-Agent 协议

MCP 主要处理 Host/Client 与能力提供方 Server 的连接；Agent-to-Agent 协议更关注独立 Agent 之间的身份、任务委派和协作。把 MCP Server 直接称为「另一个 Agent」往往会混淆权限、状态与自治边界。

## 十三、七个常见误区

这些说法在讨论里出现的频率很高，但每一条都会把架构带偏。

| 常见说法 | 实际情况 |
|---|---|
| 「接入 MCP 就安全了」 | 协议负责互操作，不负责信任。授权、沙箱、确认、最小权限和输出净化仍然要自己做。 |
| 「MCP 是模型协议」 | 模型通常并不直接说 MCP。真正的协议参与者是 Host 里的 Client，模型只看到 Host 整理后的工具定义。 |
| 「SSE 是第三种传输」 | 标准传输只有 stdio 和 Streamable HTTP。SSE 只是后者某些响应采用的流式编码。 |
| 「无状态 = 业务不能有状态」 | 被禁止的是隐式的连接级协议状态。购物篮、事务、长任务都可以存在，只是要用显式句柄表达。 |
| 「Tool 描述和 annotations 可以当策略」 | 它们是来自 Server 的输入，可能被注入。只能辅助 UI 展示，不能作为授权依据。 |
| 「一个 Server 就是另一个 Agent」 | Server 是能力提供方，没有自己的规划循环和自治权限。混为一谈会把权限和状态边界弄乱。 |
| 「SDK 能编译就是兼容了」 | 线级兼容要按协议版本测：Header、`resultType`、错误码、MRTR 往返，一项都不能靠推测。 |

## 十四、什么时候适合使用 MCP

MCP 适合以下场景：

- 同一种数据或工具希望被多个 AI Host 复用；
- 一个 Host 需要组合多个独立能力提供方；
- 需要标准化工具发现、参数 Schema、流式结果、用户输入与授权；
- 希望本地和远程能力共享同一语义模型；
- 需要逐步扩展能力并保持跨实现兼容。

以下情况未必需要 MCP：

- 单个应用只调用一个稳定内部函数，且没有复用需求；
- 服务之间完全不涉及 AI 上下文或 Tool Discovery，普通 REST/gRPC 已足够；
- 实时音视频或大文件传输是核心，MCP 只应承载控制与引用，不应替代专用媒体协议；
- 团队尚未建立授权、审计、沙箱和用户确认机制，却希望靠「接入协议」自动获得安全性。

## 十五、落地时最重要的十条建议

1. 把 Host 当作最终策略执行点，不让模型或 Server 绕过授权。
2. 一个 Server 聚焦一个清晰职责，避免暴露庞大而模糊的万能工具集。
3. Tool 名称和描述要稳定、具体、可区分；Schema 要紧而不松。
4. 对读取和写入使用不同 Tool，并让高影响参数在确认界面中可见。
5. 把 Resource 内容、Tool 描述和返回值全部视为不可信输入。
6. HTTP 使用 OAuth 最小 scope、受众校验、Issuer 隔离和严格重定向校验。
7. 本地 Server 优先使用 stdio，并限制进程的文件、网络、环境和系统权限。
8. 写操作为网络重试设计幂等性；SSE 断线后不要盲目重复副作用。
9. 为每个请求记录 Client、Server、Tool、授权主体、确认事件、耗时和结果摘要，但不要记录 Secret。
10. 明确声明和测试协议版本，不把「SDK 能编译」误当成「线级兼容已经完成」。

## 结语：MCP 真正标准化的是边界

MCP 最有价值的地方，不是让模型突然拥有更多知识，而是为 AI 应用与真实世界之间建立一条可描述、可替换、可授权、可观测的边界。

`2026-07-28` 的无状态改造进一步强化了这一点：连接不再冒充会话，隐式上下文不再决定请求含义，Server 向 Client 索取输入也不再依赖特殊双向长连接。每个请求携带处理它所需的协议信息，业务状态通过显式句柄表达，长时能力通过扩展独立演进。

这让 MCP 更像一项真正的基础设施协议：本地可以简单到两根标准流，远程可以自然落在普通 HTTP、OAuth、负载均衡、缓存和 OpenTelemetry 之上。与此同时，它也把责任划分得更清楚——协议负责互操作，Host 负责信任与控制，Server 负责能力边界，模型负责提出意图，而用户始终应该保有最终决定权。

## 参考资料

1. [MCP 2026-07-28 Release](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28)
2. [2026-07-28 Key Changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
3. [MCP Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture)
4. [Base Protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic)
5. [Versioning and Compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
6. [stdio Transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)
7. [Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
8. [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
9. [Server Features](https://modelcontextprotocol.io/specification/2026-07-28/server)
10. [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
11. [Resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
12. [Elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)
13. [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
14. [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)
15. [SEP-2663: Tasks Extension](https://modelcontextprotocol.io/seps/2663-tasks-extension)
16. [Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)
17. [Linux Foundation Announces the Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
