---
title: 企业级 AI Agent + RAG 架构选型：高星项目实现、框架边界与生产路线图
date: 2026-08-10T22:30:00
category: code
tags: [AI Agent, RAG, Workflow, LangGraph, 多智能体, 系统架构, 工程实践]
cover: /images/cover-ai-agent-architecture.jpeg
coverAlt: 巨型客轮从海面驶来，船身和天空被花卉、人物与节庆图案覆盖
coverFit: cover
coverPosition: center 68%
excerpt: 本文回到 Dify、LangGraph、CrewAI、LlamaIndex、GraphRAG、OpenAI Agents SDK、Temporal 等高星项目的代码与官方文档，结合 22 个生产问题，给出企业级 Agent 的默认架构、框架边界和完整落地路线图。
dek: 高星项目真正证明的不是“Agent 越多越先进”，而是状态、控制流、工具、权限和故障恢复必须由工程系统掌握。
---

> 一个 Agent Demo 只需要证明“模型能完成一次任务”；企业系统必须证明“不同用户、不同数据和不同故障下，它仍然不会越权、失控、丢状态或无限花钱”。这两件事之间隔着的，不是再增加几个 Agent，而是一整套确定性工程。

Workflow、ReAct、Plan-and-Execute、Graph、Supervisor、GraphRAG、Agentic RAG 经常被画在同一张选型表里，好像企业必须从中挑出一个赢家。这个问题从一开始就问错了：它们分属控制流、执行策略、协作拓扑、运行时和知识检索等不同层级，本来就可以组合。

这篇文章先从一份 Agent + RAG 架构调研出发，再回到 Dify、LangGraph、CrewAI、LlamaIndex、GraphRAG、OpenAI Agents SDK、smolagents、Temporal 等项目的仓库与官方文档，核对它们如何保存状态、调度节点、限制循环、隔离租户、恢复任务和保护工具调用。吴恩达的课程与 Karpathy 的演讲只用于解释设计思想，不替代代码证据。

调研报告中的置信标签没有被直接照搬。凡是无法在源码、官方文档或原始论文中复核的数字和归因，都不进入正文。本文还把 22 个生产问题中的并发、超时、队列、缓存、多租户、断点续跑、模型调度和发布治理放回同一张架构图里，最终只回答一个问题：

**如果今天从零建设企业级 Agent，默认到底应该选择哪一套？**

## 一、先给答案：企业默认选择“工作流主干 + 有界 Agent”

我的结论是：

> **企业默认应采用“工作流优先、局部自治”的架构：由受控路由层和持久化工作流掌握主流程，只在无法提前枚举的局部使用有边界的单 Agent；知识检索默认采用模块化 RAG，模型、工具、状态和权限分别经过独立的工程控制层。**

把它压缩成一个公式，就是：

```text
企业级 Agent
= 确定性控制面
+ 持久化工作流 / 状态机
+ 有界单 Agent
+ 模块化 RAG
+ 模型网关 / 工具网关
+ 评测 / 安全 / 可观测性
```

这里的“有界”不是形容词，而是一组硬约束：最大步骤数、最大工具调用次数、最大 Token、绝对截止时间、重试预算、并发上限和成本预算都由系统强制执行。Agent 不能自行扩大权限，也不能仅凭一句“任务已完成”改变业务终态。

默认不选择的，是下面三条看起来更“先进”的路径：

- 不让所有请求都进入自由 ReAct 循环。
- 不让多个 Agent 通过无边界群聊控制核心业务。
- 不让所有知识查询都走 GraphRAG 或 Agentic RAG。

这些能力不是不能用，而是必须在真实任务上证明收益后，作为条件分支开启。

### 第一版真正可用的企业闭环

写第一行框架代码前，先把最小路径画清楚：

```text
企业用户 / 业务系统
        |
        v
认证 + tenant/user/session/run 上下文
        |
        v
受控路由层
        |
        +----> 固定工作流 -------> 模块化 RAG -----> 带引用回答
        |
        +----> 有界 Agent ------> 工具网关 --------> 确定性验收
        |
        +----> 高风险动作 -----> 策略校验 + 人工审批
                                      |
                                      v
                             状态、审计、链路记录持久化
```

这条链路跑稳以后，才逐步加入模型级联、缓存、长任务、GraphRAG、Agentic RAG 和多 Agent。顺序很重要，因为后面的每一层自主性都会放大前面没有解决的状态、权限和故障问题。

### 高星项目的实现，到底证明了什么

Star 只能说明社区关注度，不能直接证明生产成熟度。下面的数量是 2026 年 8 月 10 日的快照；真正用于判断的是仓库中的状态模型、执行循环、队列、检查点、安全边界和维护状态。

| 项目 | 代码或官方文档呈现的实现 | 对企业选型的意义 |
| --- | --- | --- |
| [Dify](https://github.com/langgenius/dify)（约 15.2 万 Star） | `WorkflowRun` 持久化租户、应用、工作流版本、图、状态、Token 和步骤；图引擎使用队列与可伸缩 Worker | 一个 Agent 平台首先是工作流、状态、队列、版本和运营系统，不是聊天循环；但多租户商用必须先核对许可证 |
| [AutoGen](https://github.com/microsoft/autogen)（约 6.0 万） | 以 Core、AgentChat、Extensions 分层，支持消息驱动与多 Agent；官方已宣布进入维护模式 | Star 代表历史影响力，不代表今天仍适合新项目；新项目应评估其后继 [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) |
| [CrewAI](https://github.com/crewAIInc/crewAI)（约 5.7 万） | 明确区分负责自主协作的 Crews 与负责状态、分支和事件控制的 Flows | 即使是多 Agent 框架，也在用确定性 Flow 包住自治 Crew；核心业务不应只靠角色对话推进 |
| [LlamaIndex](https://github.com/run-llama/llama_index)（约 5.2 万） | 将连接器、解析、索引、检索器、查询引擎和重排器拆成可替换模块 | 企业 RAG 是可评测的数据与检索管道，不是“选一个向量数据库”就结束 |
| [LangGraph](https://github.com/langchain-ai/langgraph)（约 3.9 万） | 以状态图、检查点和中断表达长任务；恢复时可能重新进入节点 | 它适合复杂状态与人工介入，但副作用仍要由业务代码保证幂等，不能把“有检查点”等同于“天然只执行一次” |
| [Microsoft GraphRAG](https://github.com/microsoft/graphrag)（约 3.5 万） | 索引阶段生成实体、关系、社区与摘要；查询层区分 Local、Global、DRIFT 和 Basic Search | GraphRAG 是针对实体关系和全局归纳的专用检索系统，不是普通知识问答的通用替代品 |
| [smolagents](https://github.com/huggingface/smolagents)（约 2.9 万） | 执行循环有最大步数；代码 Agent 提供受限解释器和远程沙箱选项，并明确本地执行器不是安全边界 | “循环有上限、代码在隔离环境执行”应是代码 Agent 的默认要求，不能依赖 Prompt 自律 |
| [OpenAI Agents SDK](https://github.com/openai/openai-agents-python)（约 2.9 万） | `Runner` 管理模型、工具和交接循环，并提供最大轮次、会话、Tracing 与工具 Guardrail | 适合轻量执行内核；首尾 Guardrail 不会自动覆盖所有内部工具与交接，关键工具仍需独立授权和校验 |
| [12-Factor Agents](https://github.com/humanlayer/12-factor-agents)（约 2.5 万） | 强调自己掌握提示词、上下文、控制流和执行状态，并把 Agent 做小、做成无状态归约器 | 可靠 Agent 往往是“大部分普通软件 + 少量模型决策”，而不是把完整业务流程交给模型即兴发挥 |
| [Temporal](https://github.com/temporalio/temporal)（约 2.2 万） | 通过事件历史重放恢复工作流；工作流代码要求确定性，外部副作用放入可重试 Activity | 跨服务、跨天和高价值长任务需要持久执行底座；LLM 与工具调用应作为 Activity，而不是塞进可重放的确定性工作流代码 |
| [Microsoft Agent Framework](https://github.com/microsoft/agent-framework)（约 1.3 万） | 提供图工作流、检查点、Agent/工具/模型中间件和多种协作模式；自托管时仍由应用负责身份、授权、存储、部署和扩缩容 | 它是 AutoGen 的官方后继，适合微软技术栈评估，但框架不会替企业完成平台治理，预发布的托管组件也要单独审慎验证 |

Dify 的代码尤其能说明“平台”和“框架”的区别：工作流运行记录不是一段聊天历史，而是带租户、版本、状态、步骤和成本的业务记录；图引擎也不是递归调用几个 Python 函数，而是有队列、Worker、流式协调和存储策略。与此同时，[Dify 当前许可证](https://github.com/langgenius/dify/blob/main/LICENSE)对经营多租户服务设有额外条件，企业不能把“代码公开”误解为“任何商业形态都可以直接使用”。

这些项目共同指向五条工程事实：

1. 运行状态与聊天上下文必须分开保存。
2. 确定性工作流与模型自主决策必须分层。
3. 工具调用、交接和节点输出都要有结构化契约。
4. 检查点、队列、版本、权限和链路追踪是一等能力，而不是上线后的补丁。
5. 框架只提供运行原语，企业仍需负责身份、授权、租户隔离、容量、发布和事故恢复。

### 吴恩达和 Karpathy 的材料应该怎样使用

[吴恩达的 Agentic AI 课程](https://www.deeplearning.ai/courses/agentic-ai)把反思、工具使用、规划和多 Agent 协作作为四类可组合的设计模式。它非常适合帮助团队理解“模型可以怎样推进任务”，但这些模式并不等同于生产平台架构：课程中的 Reflection 不能代替验收器，工具使用不能代替授权，规划也不能代替持久化状态机。

[Karpathy 在《Software Is Changing (Again)》中的讨论](https://www.youtube.com/watch?v=LCEmiRjPEtQ)更适合用来理解“部分自治”：LLM 软件不是一次性生成结果，而是人、模型和传统软件共同工作的系统，自治程度需要逐步开放。本文把这个思想落实为工程规则——自主性不是开关，而是按任务风险和评测证据授予的权限。

## 二、先别选框架：用六个问题判断任务形态

框架选型之前，先回答六个更基础的问题：

| 问题 | 如果答案是“是” | 架构含义 |
| --- | --- | --- |
| 合法路径能否提前枚举？ | 大部分可以 | 优先固定工作流，不要让模型控制全流程 |
| 下一步是否依赖环境反馈？ | 无法预知 | 在局部使用 ReAct / Agent |
| 任务是否跨分钟、跨会话或等待审批？ | 需要暂停恢复 | 引入持久化状态机或状态图运行时 |
| 子任务是否真正独立并可并行？ | 可以并行或需独立上下文 | 才考虑 Supervisor-Workers |
| 错误是否会造成资金、权限或外部承诺？ | 代价高 | 策略校验、确定性验证和人工审批优先 |
| 问题是事实、关系，还是多源多跳？ | 类型不同 | 分别路由 Modular、Graph、Agentic RAG |

这六个问题比“LangGraph 还是 CrewAI”“单 Agent 还是多 Agent”更接近架构本质。

“受控路由”也不意味着所有意图都要写成规则。更稳妥的顺序是：先用身份、权限、风险、租户策略和输入类型做确定性硬过滤，再让分类模型处理语义路由；路由结果必须满足结构化数据契约，并设置置信阈值、冲突处理和默认回退路径。模型可以建议去哪个能力，系统决定这条路径是否存在、是否允许、预算是否足够。

[Anthropic 的工程总结](https://www.anthropic.com/engineering/building-effective-agents)也强调从最简单、可组合的模式开始，只在结果确实改善时增加复杂度。原因并不神秘：Agent 用额外时延和成本换取灵活性，自主性越高，状态空间、故障面和评测成本越大。

## 三、先把概念放回正确层级

“Agent 架构”至少包含六层问题。把它们平铺比较，会产生大量伪选型。

| 层级 | 典型模式 | 回答的问题 |
| --- | --- | --- |
| 控制流 | 单次调用、Workflow、Agent | 下一步由代码还是模型决定？ |
| 执行内核 | ReAct、Plan-and-Execute、Verification | 一个任务内部怎样推进和纠错？ |
| 能力组织 | Router + Skills | 请求交给哪项能力？ |
| 协作拓扑 | Supervisor、Pipeline、Handoff、Blackboard | 多个执行者如何交接和聚合？ |
| 运行时 | 普通代码、状态机、状态图、持久工作流 | 状态如何持久化、暂停、恢复和回放？ |
| 知识检索 | Modular RAG、GraphRAG、Agentic RAG | 外部知识如何召回、验证和组合？ |

还有两层横切面不能被漏掉：

- **质量面**：数据结构校验、规则校验、生成—复核、测试和人工审批。
- **生产控制面**：身份、权限、预算、限流、队列、缓存、链路追踪、评测和发布。

因此，“ReAct 和 LangGraph 选哪个”是一个错误问题。ReAct 是执行循环，LangGraph 是一种表达状态与转移的运行时；完全可以用状态图实现一套 ReAct 循环，也可以用同一种状态图表达没有任何 Agent 自主性的固定审批流。

同样，“RAG 还是 Agent”也不是二选一。RAG 是知识能力，Agent 可以调用 RAG；固定 Workflow 也可以调用同一套 RAG。

## 四、企业级参考架构：用确定性工程包住自主决策

下面这张图是本文推荐的逻辑架构。它不是某个厂商产品清单，而是一组必须存在的职责边界。

<figure class="diagram">
<svg viewBox="0 0 880 650" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="企业级 AI Agent 与 RAG 参考架构：从接入、策略路由、持久化工作流，到执行、模型工具检索能力、状态和治理">
<defs>
<marker id="enterprise-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6b6e76"/></marker>
</defs>
<rect x="0" y="0" width="880" height="650" fill="#ffffff"/>
<text x="440" y="30" text-anchor="middle" font-size="15" font-weight="700" fill="#25262b">企业级 Agent 参考架构：工作流优先，Agent 按需进入</text>

<rect x="60" y="52" width="760" height="48" rx="10" fill="#f1f2f4" stroke="#c4c6cd"/>
<text x="440" y="73" text-anchor="middle" font-size="12" font-weight="600" fill="#25262b">接入面</text>
<text x="440" y="90" text-anchor="middle" font-size="11" fill="#555861">API 网关 · 企业身份 · 租户上下文 · 准入控制 · 截止时间</text>

<line x1="440" y1="100" x2="440" y2="126" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#enterprise-arrow)"/>
<rect x="60" y="128" width="760" height="48" rx="10" fill="#e3e4e8" stroke="#9a9da6"/>
<text x="440" y="149" text-anchor="middle" font-size="12" font-weight="600" fill="#25262b">决策面</text>
<text x="440" y="166" text-anchor="middle" font-size="11" fill="#555861">路由层 + 能力注册表 · 策略 · 风险 · 模型 / 检索路由 · 预算</text>

<line x1="440" y1="176" x2="440" y2="202" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#enterprise-arrow)"/>
<rect x="60" y="204" width="760" height="52" rx="10" fill="#25262b"/>
<text x="440" y="226" text-anchor="middle" font-size="12.5" font-weight="700" fill="#ffffff">持久化工作流控制层</text>
<text x="440" y="244" text-anchor="middle" font-size="11" fill="#e8e9ec">状态机 / 状态图 · 检查点 · 暂停与恢复 · 人工审批</text>

<line x1="440" y1="256" x2="440" y2="281" stroke="#6b6e76" stroke-width="1.5"/>
<line x1="175" y1="281" x2="705" y2="281" stroke="#6b6e76" stroke-width="1.5"/>
<line x1="175" y1="281" x2="175" y2="298" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#enterprise-arrow)"/>
<line x1="440" y1="281" x2="440" y2="298" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#enterprise-arrow)"/>
<line x1="705" y1="281" x2="705" y2="298" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#enterprise-arrow)"/>

<rect x="65" y="300" width="220" height="58" rx="9" fill="#f1f2f4" stroke="#c4c6cd"/>
<text x="175" y="324" text-anchor="middle" font-size="12" font-weight="600" fill="#25262b">确定性业务节点</text>
<text x="175" y="343" text-anchor="middle" font-size="10.5" fill="#6b6e76">工作流 · 规则 · 确定性校验</text>
<rect x="330" y="300" width="220" height="58" rx="9" fill="#d4d5d9" stroke="#9a9da6"/>
<text x="440" y="324" text-anchor="middle" font-size="12" font-weight="700" fill="#25262b">有边界的单 Agent</text>
<text x="440" y="343" text-anchor="middle" font-size="10.5" fill="#555861">规划 · 执行 · 证据验收</text>
<rect x="595" y="300" width="220" height="58" rx="9" fill="#f1f2f4" stroke="#c4c6cd"/>
<text x="705" y="324" text-anchor="middle" font-size="12" font-weight="600" fill="#25262b">按条件启用多 Agent</text>
<text x="705" y="343" text-anchor="middle" font-size="10.5" fill="#6b6e76">中心调度 · 独立执行者</text>

<line x1="175" y1="358" x2="175" y2="386" stroke="#9a9da6" stroke-width="1.3" marker-end="url(#enterprise-arrow)"/>
<line x1="440" y1="358" x2="440" y2="386" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#enterprise-arrow)"/>
<line x1="705" y1="358" x2="705" y2="386" stroke="#9a9da6" stroke-width="1.3" marker-end="url(#enterprise-arrow)"/>

<rect x="65" y="388" width="220" height="58" rx="9" fill="#ffffff" stroke="#9a9da6"/>
<text x="175" y="412" text-anchor="middle" font-size="12" font-weight="600" fill="#25262b">模型网关</text>
<text x="175" y="431" text-anchor="middle" font-size="10.5" fill="#6b6e76">路由 · 配额 · 降级 · 版本</text>
<rect x="330" y="388" width="220" height="58" rx="9" fill="#ffffff" stroke="#9a9da6"/>
<text x="440" y="412" text-anchor="middle" font-size="12" font-weight="600" fill="#25262b">工具网关</text>
<text x="440" y="431" text-anchor="middle" font-size="10.5" fill="#6b6e76">参数校验 · 授权 · 幂等 · 审计</text>
<rect x="595" y="388" width="220" height="58" rx="9" fill="#ffffff" stroke="#9a9da6"/>
<text x="705" y="412" text-anchor="middle" font-size="12" font-weight="600" fill="#25262b">检索路由层</text>
<text x="705" y="431" text-anchor="middle" font-size="10.5" fill="#6b6e76">模块化 · 图检索 · 自主检索</text>

<line x1="440" y1="446" x2="440" y2="474" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#enterprise-arrow)"/>
<rect x="60" y="476" width="760" height="62" rx="10" fill="#f1f2f4" stroke="#c4c6cd"/>
<text x="440" y="499" text-anchor="middle" font-size="12" font-weight="600" fill="#25262b">状态与数据面</text>
<text x="440" y="518" text-anchor="middle" font-size="10.8" fill="#555861">任务 / 步骤状态 · 队列 / 死信 · 缓存 · 对象存储 · 搜索 / 向量索引</text>

<line x1="440" y1="538" x2="440" y2="564" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#enterprise-arrow)"/>
<rect x="60" y="566" width="760" height="54" rx="10" fill="#25262b"/>
<text x="440" y="589" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">治理与质量面</text>
<text x="440" y="608" text-anchor="middle" font-size="10.8" fill="#e8e9ec">链路追踪 · 评测 · SLO · 成本 · 安全 · 审计 · 发布控制</text>
<text x="440" y="641" text-anchor="middle" font-size="10" fill="#6b6e76">深色为必须先建立的控制边界；多 Agent 和高级 RAG 是条件式能力，不是默认主链路。</text>
</svg>
<figcaption>图 1：推荐的企业级 Agent 逻辑架构。工作流掌握生命周期，模型只在有边界的节点中做概率性决策。</figcaption>
</figure>

### 这套架构为什么能进企业

它建立了六条不能倒置的控制边界：

1. **工作流决定生命周期**：Agent 不能无限运行，也不能跳过必要节点。
2. **策略引擎决定权限**：Agent 只能提出动作，不能批准自己的动作。
3. **验收器决定是否成功**：模型自述“完成了”不构成完成证据。
4. **模型网关决定实际模型**：业务逻辑不直接绑定某个供应商。
5. **工具网关决定动作能否执行**：工具参数始终被视为不可信输入。
6. **状态库存储事实**：聊天上下文不是数据库，更不是事务日志。

持久化状态图也不是所有请求的强制入口。简单同步工作流用普通代码更轻；只有出现复杂分支、跨会话、检查点、人工审批和故障恢复需求时，才值得引入 LangGraph 一类运行时。[LangGraph 官方文档](https://docs.langchain.com/oss/python/langgraph/persistence)把持久化状态组织为检查点；其 [Interrupt 机制](https://docs.langchain.com/oss/python/langgraph/interrupts)可以暂停和恢复执行，但节点可能在恢复时重新运行。因此，检查点解决的是“进度不会丢”，业务代码仍须解决“副作用不会重复”。

## 五、Agent 执行层：默认单 Agent，按证据升级

### 固定工作流是主路，不是“低级版本”

固定流程不等于只能写一条直线。Prompt Chaining、Routing、Parallelization、Orchestrator-Workers 和 Evaluator-Optimizer 已经覆盖大量企业任务。

例如客服工单处理可以拆成：

```text
读取工单与权限
      |
      v
意图分类 ----> 知识问答 ----> RAG + 引用
      |
      +-------> 状态查询 ----> 固定 API Workflow
      |
      +-------> 退款申请 ----> 规则校验 + 人工审批
```

每个分支都可以调用模型，但状态转移、权限、金额和审批条件仍由代码控制。这类系统通常比“让一个 Agent 自由决定所有步骤”更稳定，也更容易评测。

### 有界 ReAct 处理无法提前枚举的局部

真正需要 Agent 的，是下一步必须根据环境反馈动态决定的任务。它的核心循环很小：

```text
while 未完成且预算未耗尽:
    读取结构化状态与必要上下文
    生成候选动作或工具调用
    系统校验权限、Schema 和预算
    执行动作并记录真实结果
    用客观证据更新状态
```

生产外壳至少要包含：

- 最大步骤、最大工具调用和最大输出 Token。
- 整体截止时间与每个阶段的剩余时间预算。
- 重复调用、无进展和循环检测。
- 取消传播、错误分类和有限重试。
- 独立于模型的完成条件与结果校验。

### 长任务采用“规划 + 动态执行 + 客观验收”

Plan-and-Execute 不应该生成一份不可修改的长计划。更稳妥的组合是：

1. 先生成简短计划、依赖和验收标准。
2. 每个步骤内部使用 ReAct 适应现场变化。
3. 完成一步就持久化状态，而不是重新生成整份计划。
4. 前提变化时只修改受影响部分。
5. 最后用测试、Schema、数据库终态或引用证据验证。

反思机制也只能连接客观信号。测试失败后的修复、数据结构不合法后的重试、引用无法回源后的补检索都有意义；没有证据的“请再反思一下”通常只是增加一次模型调用。

### 状态图是运行时，不是更聪明的 Agent

当系统需要以下任一能力时，状态机或状态图运行时才开始产生净收益：

- 长任务检查点和断点续跑。
- 条件分支、循环和补偿路径。
- 人工审批、外部事件等待和跨会话恢复。
- 完整状态历史、回放和故障定位。

图上的节点可以是模型、函数、工具、人工操作或另一个工作流。状态图解决的是状态和控制，不会自动修复含糊的工具契约、错误的权限或缺失的验收标准。

### 多 Agent 的立项门槛不是角色数量

多 Agent 至少应满足下面一个条件，并且通过评测证明收益大于新增的时延、成本和故障面：

1. 子任务可以真正并行。
2. 子任务需要独立上下文，拆开后能减少污染或突破窗口压力。
3. 高价值结果需要独立视角复核，而且评测证明复核有效。

[Google Research 对 Agent 系统扩展的研究](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/)给出一个很重要的方向性结论：并行型任务能从多 Agent 协作中获益，而顺序型任务可能退化；中心化协调通常更利于错误控制。这也是企业默认选择 Supervisor-Worker，而不是自由群聊的原因。

| 拓扑 | 适合 | 不适合 |
| --- | --- | --- |
| Supervisor-Worker | 可并行研究、批量审查、独立模块分析 | 高频共享写状态、严格串行任务 |
| Pipeline / Handoff | 客服专家接管、固定阶段交接 | 交接边界含糊、强全局一致性 |
| 生成—复核（Maker-Checker） | 语义质量复核、代码或内容审查 | 替代权限、事务或人工审批 |
| Blackboard | 能力边界模糊的数据发现、探索研究 | 核心交易链路、严格低延迟场景 |
| Group Chat / Debate | 小范围探索、多观点讨论 | 成本敏感、强审计的生产主链 |

[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/multi_agent/)把多 Agent 编排明确分成模型决策与代码编排两类；其 [Handoff](https://openai.github.io/openai-agents-python/handoffs/)本质上也是一种带 Schema 和输入过滤的工具调用。企业落地的重点不是角色名字，而是任务书、输入过滤、结构化产物、预算和终止条件。

## 六、RAG 选型：默认使用模块化检索，复杂问题再升级

RAG 同样不是“向量库、知识图谱、Agentic 三选一”。更实用的做法是把检索路径分层。

| 路径 | 适合的问题 | 主要代价 | 本文建议 |
| --- | --- | --- | --- |
| Naive RAG | 单源、单跳、事实密集 | 对措辞变化和噪声敏感 | 只作为 PoC 或基线 |
| Modular RAG | 企业知识问答、规章、产品文档 | 管道更长，需要逐层评测 | 默认生产路径 |
| GraphRAG | 实体关系、全局主题、跨文档连接 | 图构建与增量维护成本高 | 关系型请求按需路由 |
| Agentic RAG | 多跳、多源、动态选择检索工具 | 调用次数、RT 和成本更难预测 | 复杂请求条件升级 |
| Corrective RAG | 召回不确定、需要补检索 | 需要可靠评分与停止条件 | Modular 与 Agentic 之间的中间档 |

### 企业默认的模块化 RAG 管道

```text
结构化解析 + 文档版本 + ACL
             |
             v
查询改写 / 扩展
             |
             v
服务端权限预过滤
             |
             v
向量 + BM25 混合召回
             |
             v
融合 + 重排 + 去重 + 压缩
             |
             v
生成带来源引用的回答
             |
             +----> 证据充分：回答
             |
             +----> 证据不足：补充检索或拒答
```

这里最重要的不是某个 Embedding 排行，而是每一层都能独立评测：

- 解析是否保留标题、表格、代码和来源。
- ACL 是否在召回前生效。
- Recall@K、MRR 或 NDCG 是否达到业务要求。
- Reranker 是否真的改善最终候选。
- 引用能否回到当前版本原文。
- 检索不足时系统是否会明确拒答。

### GraphRAG 主要处理关系型与全局型问题

[Microsoft GraphRAG 官方说明](https://microsoft.github.io/graphrag/index/overview/)展示了其索引管道：从非结构化文本中抽取实体、关系和声明，进行社区发现与摘要，再写入结构化表和向量索引。它适合“信息主要存在于关系和全局结构中”的问题，例如供应链关系、组织网络、研究主题演化。

如果知识库主要是独立 FAQ、操作手册和产品说明，图构建、实体消歧和增量维护很可能得不偿失。GraphRAG 更适合作为检索路由中的专用分支，而不是替代整个知识库检索。

### Agentic RAG 主要处理多源、多跳和动态检索

[Agentic RAG 调研](https://arxiv.org/abs/2501.09136)把规划、反思、工具使用和多 Agent 等模式嵌入检索流程，使系统能够决定是否检索、选择哪个来源、结果是否充分以及是否再次检索。

这带来适应性，也引入新的循环。生产上必须限制：

- 最大检索轮次和最大数据源数量。
- 每轮候选规模、Rerank 和上下文预算。
- 整体截止时间、Token 与调用成本。
- 证据充分度的程序规则或可校准评分。
- 无结果、来源冲突和供应商失败时的停止路径。

Agentic RAG 不应覆盖所有请求。事实型问题走固定检索更快、更便宜、更可重现。

### 百万级知识库先优化搜索空间

向量检索 RT 持续升高时，先拆分 Query Embedding、Metadata Filter、ANN、回表、Rerank 和网络耗时。常见优化顺序是：

1. 按租户、业务域、语言或时间分区，避免无差别全库搜索。
2. 在 ANN 阶段做服务端 Metadata/ACL 预过滤。
3. 根据 Recall—RT 曲线调 HNSW、IVF/PQ 等索引参数。
4. 控制候选集，再对较小集合执行 Rerank。
5. 清理重复 Chunk、Tombstone 和碎片，隔离索引写入与在线查询。
6. 缓存 Query Embedding 和允许复用的检索结果，并绑定索引与权限版本。

只降低 `topK` 或搜索深度会让 RT 变快，却可能让系统在不报错的情况下悄悄答错。任何性能调优都必须同时回归 Recall。

## 七、模型与工具网关：模型只能提出动作，系统负责放行

企业平台至少需要两个独立网关。

### 模型网关负责“这次调用发到哪里”

模型网关维护模型注册表与运行时路由：

- 能力：上下文窗口、工具调用、结构化输出、多模态。
- 约束：数据区域、敏感等级、租户白名单和供应商策略。
- 运行时：TTFT、TPOT、并发、RPM/TPM、429 和熔断状态。
- 经济性：输入/输出价格、缓存能力、每任务预算。
- 版本：模型、提示词、工具数据结构和评测结果。

调度时先做合规与能力硬过滤，再按质量、延迟、成本、配额和健康度评分。简单分类、抽取、改写可以走小模型；复杂规划或高风险任务升级大模型。小模型失败后再升级并不一定省钱，应计算：

```text
级联成本 = 小模型成本 + 升级概率 × 大模型成本
```

降级切换也不能只验证“接口能否返回 200”。备用模型必须通过工具协议、数据结构、上下文、质量、安全和数据驻留等兼容性评测。

### 工具网关负责“这个动作能不能发生”

工具调用的正确顺序应该是：

```text
LLM 生成候选调用
        |
        v
严格的数据结构校验
        |
        v
身份 / 租户 / 资源权限校验
        |
        v
业务规则、风险与预算校验
        |
        +----> 高风险：预演 / 人工审批
        |
        v
幂等执行 + 结果对账 + 审计
```

模型不能拥有超级管理员凭证，也不能决定自己的权限、重试次数和完成状态。支付、退款、删除、外发、部署等副作用必须使用幂等键；调用超时但结果未知时，先按幂等键查询最终状态，不能直接再执行一次。

这里不能只挂一个“输入安全检查”就算完成。以 [OpenAI Agents SDK 的 Guardrail 边界](https://openai.github.io/openai-agents-python/guardrails/)为例：输入 Guardrail 只运行在链路起点，输出 Guardrail 只运行在最终输出者；要覆盖每一次自定义函数调用，必须在工具层配置输入与输出 Guardrail。其托管工具、Handoff 和 `Agent.as_tool()` 也各有不同的保护边界。工程上因此要把授权、参数校验、审批和审计放在统一工具网关中，而不是假设 Agent 框架会自动覆盖全部调用路径。

### 哪些逻辑必须确定性执行

| 必须由代码、配置或策略引擎决定 | 可以由 LLM 提出候选 |
| --- | --- |
| 身份、权限、租户、数据可见范围 | 意图和实体抽取 |
| 金额、额度、审批和状态机转移 | 候选计划与工具选择 |
| 超时、重试、预算和停止条件 | 查询改写与相关性判断 |
| 数据结构、业务前置条件、幂等和事务 | 内容草稿和摘要 |
| 个人敏感信息、合规、审计和数据驻留 | 难以形式化的语义质量建议 |
| 测试、数据库终态和客观验收 | 对失败证据的修复建议 |

“硬编码”并不意味着把规则散落成几千个 `if/else`，而是让规则可测试、可审计、可版本化，并由确定性系统执行。

## 八、状态、上下文、记忆与缓存：四件事不要混在一起

很多串会话、内存泄漏和 Token 失控，都源于把“聊天记录”当成唯一状态源。

| 类型 | 保存什么 | 推荐载体 |
| --- | --- | --- |
| 工作流状态 | 当前步骤、状态、预算、版本、待办 | 持久化状态库 |
| 短期上下文 | 当前目标、最近对话、必要观察 | 有 Token 预算的上下文 |
| 长期记忆 | 用户偏好、已确认事实、历史事件 | 结构化档案 + 按需检索 |
| 任务产物 | 文档、日志、工具大结果、中间报告 | 对象存储 / 工作区 |
| 企业知识 | 企业文档、表、图和权限元数据 | RAG 索引与来源系统 |

### 会话隔离必须贯穿全链路

服务端可信身份应构造：

```text
tenant_id + user_id + session_id + run_id + step_id
```

这个命名空间必须进入数据库主键或行级安全策略（RLS）、Redis 键、向量过滤、对象存储路径、队列消息和审计。当前租户不能从提示词中读取，也不能在单例 Agent 上保存 `current_user` 或历史消息。

同一会话并发写入时，可以采用单写者模型，或使用带 `revision` 的乐观锁。异步 Worker 必须从消息中重建安全上下文，执行完成后清理请求状态，不能依赖线程本地变量残留。

### 上下文必须按预算组装

推荐分为：

1. 不可变系统策略。
2. 结构化当前工作状态。
3. 最近对话窗口。
4. 按权限检索的历史事实和知识。
5. 大型产物的摘要、URI 与 Hash。

窗口按 Token 而不是消息条数裁剪。旧对话摘要至少保留目标、事实、约束、决策、来源和未完成项；关键数字、权限和用户更正不能只存在于自由文本摘要。避免反复“摘要上次摘要”导致事实漂移，应能从原始事件重建。

### 缓存是一套分层体系

可以缓存：

- 稳定的系统提示词与工具定义前缀。
- 文档解析、切片、向量表示、查询向量和重排结果。
- 允许陈旧的只读工具结果。
- 确定性工作流节点和已完成任务结果。
- 低风险、经过评测的精确或语义响应。

缓存键至少包含安全作用域、模型/提示词/工具版本、索引版本、采样参数和规范化输入。所有缓存都要设置有效期、容量上限、失效规则和击穿保护。

不能用普通缓存替代：

- 支付、删除、发消息等副作用。
- 权限、余额、强实时库存和未知完成状态。
- 未通过校验的半截流或超时结果。
- 跨租户敏感内容。

会话状态、任务状态和审计是权威事实，不能只放缓存。

## 九、可靠性底座：所有资源有界，所有故障有边界

本地 Demo 上线后在高并发下崩溃，通常不是“模型突然变差”，而是本地环境默认串行、低负载、依赖稳定；生产环境则让请求交错执行，并同时放大共享可变状态、阻塞式 I/O、无界协程、连接池耗尽、内存积压和重试风暴。所谓“panic”往往是容量与隔离同时失效后的级联结果，不是一个统一的 Agent 特有异常。

生产系统必须同时限制：

- 请求、模型、工具和每个租户正在执行的并发量。
- Worker、线程或协程、连接池和文件描述符。
- 队列长度、最老任务年龄和重试任务数。
- 会话、缓存、工具返回、上下文和批处理字节数。

### 分层超时：每层只能花剩余预算

入口定义绝对截止时间，并为排队、检索、重排、LLM、工具和收尾分配阶段预算：

```text
本次调用上限
= min(阶段上限, 总截止时间 - 当前时间 - 收尾预留)
```

LLM 调用还要区分连接、排队、首 Token、流式空闲和完整生成超时。用户断开或总截止时间到期后，取消信号必须继续传到检索、模型和工具，避免用户已经离开，后台仍在消耗资源和付费。

重试只处理瞬时且幂等的错误，采用带随机抖动的指数退避，并且只允许一个层级负责。熔断器按供应商、模型和区域隔离；熔断后快速失败，转向备用模型、可信缓存、跳过非关键步骤、改为异步处理或进入人工队列。

### LLM 限流：收到 429 前就要控制

常见的供应商配额包括每分钟请求数（RPM）、每分钟 Token 数（TPM）和并发数，具体组合以供应商文档和响应头为准。调用前需要：

- 请求速率令牌桶。
- Token 预算令牌桶。
- 正在执行请求的并发信号量。
- 按租户和优先级的有界公平队列。

请求前按输入量和预计最大输出量预占 Token，完成后再按实际用量结算。限流器必须在所有实例之间共享，否则横向扩容会把实际流量成倍放大。收到 429 后遵守 `Retry-After`，并结合延迟与错误率主动降低并发。下游已经限流时继续增加 Worker，只会制造更大的排队和重试风暴。

### 队列治理：关注最老任务等待时间，不只看长度

当到达速率 `λ` 长期大于有效处理速率 `μ`，队列必然发散。治理包括：

- 在线、离线、长短任务与租户分队列或分配额。
- Worker 按最老任务等待时间、到达/完成速率和下游容量扩缩。
- 至少一次投递 + 幂等消费者。
- 租约、心跳和栅栏令牌防止失效 Worker 回写。
- 指数退避延迟队列、重试预算和死信队列。
- 结果持久化成功后再确认消息。

### 内存增长先区分泄漏与堆积

内存持续增长至少要区分四类原因：会话和缓存没有有效期或容量上限，属于无界持有；异步任务、流式响应和回调没有结束，属于生命周期泄漏；到达速率高于消费速率，属于任务和结果堆积；托管堆稳定但进程常驻内存继续增长，则要检查原生库、分配器碎片和大对象复制。

排查时要比较稳定负载前后的托管堆、进程常驻内存（RSS）、存活对象、任务数、连接池、文件描述符以及垃圾回收后的基线，再用堆快照差分和线程/协程 Dump 找到持续增长的引用链。修复后用长时间稳态压测验证内存是否进入平台期，不能靠定时重启掩盖问题；Worker 回收只能作为临时止血措施。

## 十、P95、模型调度与成本：优化的是成功任务

端到端 P95 不能靠“模型平均响应时间”解释。一次请求的关键路径可能包含准入排队、查询改写、向量计算、检索、重排、多轮 LLM、工具、验证和回传。

### 先用链路追踪找到真正的关键路径

优化顺序通常是：

1. 合并细粒度工具，减少模型往返和 N+1 调用。
2. 把互不依赖的检索和只读工具改成并行任务图。
3. 压缩提示词、历史、工具定义和检索上下文。
4. 路由、分类、抽取使用小模型，核心推理再升级。
5. 缓存查询向量、检索结果和允许复用的只读结果。
6. 每阶段设置剩余预算，慢依赖熔断并走降级。
7. 超出交互 SLO 的任务转异步，立即返回 `task_id`。

流式返回能缩短用户等到第一个 Token 的时间，却不一定缩短后台总耗时。验收必须同时看任务成功率、端到端 P95/P99、首 Token 时间、步骤数和成本，不能通过大量超时失败制造一个“更好看”的 P95。

### Token 降本要看“每个成功任务的成本”

```text
每个成功任务的成本
= 统计周期内模型、向量、重排、工具、检索和计算的全部成本
  ----------------------------------------------------------
                    同期成功任务数
```

有效降本手段包括：

- 结构化摘要和按需记忆，避免重放完整对话。
- 工具按意图延迟加载，返回必要字段而非完整 JSON。
- 减少没有客观收益的规划、反思、模型裁判和多层重试。
- 最大步骤、Token、工具次数和单租户预算。
- 小模型级联、前缀缓存、同请求合并和批处理。
- 用户取消后立即终止生成。

只看单次 Token 价格会掩盖低成功率、重复执行和人工返工。所有降本策略都必须用固定评测集验证质量没有下降。

## 十一、长任务与发布：上线本身也是一条工作流

### 长任务必须可检查点续跑

一个可恢复任务至少要持久化：

```text
run_id / workflow_version
step_id / step_version / input_hash
status / attempt
structured_state / output_artifact_uri
lease_owner / lease_expire_at
created_at / updated_at
```

每个步骤完成后原子提交状态与产物引用；外部副作用使用 `run_id + step_id` 或业务幂等键；状态未知时先对账。Worker 通过租约、心跳和栅栏令牌持有任务，宕机后从最后成功检查点恢复。

跨系统流程通常采用“至少一次执行 + 幂等效果”，不要轻易承诺端到端“只执行一次”。不可逆步骤需要 Saga 补偿或人工介入；消息与业务状态双写可以采用事务性发件箱/收件箱模式解决。

[Temporal 的架构文档](https://github.com/temporalio/temporal/blob/main/docs/architecture/README.md)把这个边界写得很清楚：工作流通过事件历史重放来恢复，因此工作流代码必须确定性；网络调用、LLM 调用和其他副作用放在活动任务（Activity）中，并设计为幂等或明确不可重试。这也解释了为什么企业长任务经常需要两层运行时：外层的持久工作流保证跨服务生命周期，内层的 Agent 运行时负责某一步中的动态推理。二者解决的问题不同，不能互相替代。

### 启动时最后接流量，停止时最先摘流量

启动顺序是：配置与密钥校验 → 可观测性初始化 → 连接与依赖 → 提示词/索引/模型预热 → Worker → 就绪检查。

停止顺序相反：先标记为未就绪 → 停止接单和领取任务 → 排空短请求 → 为长任务保存检查点并归还租约 → 刷新必要的链路记录与审计 → 关闭资源。

启动探针、存活探针和就绪探针代表不同状态。依赖短暂抖动时通常先摘除流量，而不是让进程陷入重启循环。

### 发布必须容忍新旧版本共存

无损发布需要：

- 影子流量、灰度发布或蓝绿发布，而不是一次全量替换。
- 提示词、模型、工具数据结构、索引和工作流都绑定版本。
- 数据库变更采用“扩展—迁移—收缩”，确保新旧版本在发布窗口内可以共存。
- 长连接排空，长任务固定旧执行器或显式迁移。
- 功能开关、紧急停止开关和自动回滚。
- 用任务成功率、P95、质量、安全和成本决定是否继续放量。

发布演练应覆盖：新旧实例同时读写、队列重复投递、长任务跨版本恢复、缓存版本变化、权限撤销和下游超时。

## 十二、权限与多租户：LLM 永远不能成为授权系统

企业多租户不是数据库多加一个 `tenant_id` 就结束了。

### 身份和权限

- 通过企业 IdP、OIDC/SAML 建立用户与服务身份。
- `tenant_id` 由服务端令牌映射，不能由前端或 LLM 声明。
- RBAC 管角色，ABAC/ReBAC 表达资源归属、数据等级和委托关系。
- 每个工具调用使用用户授权范围内的短期凭证。

### 数据隔离

- 共享数据库使用复合主键与行级安全策略；高安全租户可以独立使用数据库 Schema、数据库实例、索引和密钥。
- 向量检索必须由服务端注入租户命名空间与访问控制预过滤。
- 缓存、队列、对象存储、记忆、检查点、备份和审计全部携带租户作用域。
- 权限撤销后，缓存和长期任务不能继续使用旧权限。

[Microsoft Agent Framework 的自托管文档](https://learn.microsoft.com/en-us/agent-framework/hosting/self-hosting/)提供了一个很实用的反例提醒：默认会话存储可以是进程内存，而且没有淘汰策略；框架也不会替应用注册路由、认证用户、授权状态访问或提供持久化存储。文档要求把客户端传来的会话、检查点和任务 ID 一律视为不可信输入，并按已认证的租户、用户或工作区划分状态。换句话说，“框架支持 Session”不等于“系统已经实现会话隔离”。

### 提示词注入本质上是权限边界攻击

网页、邮件、代码、文档和工具结果都是不可信数据。它们可以影响模型，但不能改变系统策略、扩大工具权限或读取更多数据。

[OWASP 的 Prompt Injection 条目](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)明确指出 RAG 和微调不能彻底消除注入；[Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)则强调代表用户执行动作时必须保持用户的授权范围与最小权限。因此真正的防线是能力隔离、确定性授权、参数校验、人工批准和完整审计，而不是在系统提示词里再写一句“不要被攻击”。

跨租户测试必须覆盖伪造资源 ID、缓存 Key、向量过滤、任务恢复、连接池复用和权限撤销。串租户属于安全事故，目标必须是零。

## 十三、评测与可观测性：答案正确不等于链路正确

Agent 可能选错工具、违反预算、绕远路，最后碰巧得到一个看起来正确的答案。因此评测必须分三层：

| 层级 | 评什么 | 首选判定 |
| --- | --- | --- |
| 单步 | 工具选择、参数、检索相关性、节点产物 | 数据结构、规则、断言 |
| 轨迹 | 是否循环、漏步骤、越权、恢复路径 | 轨迹规则 + 分项评分标准 |
| 终态 | 任务是否完成、副作用是否正确 | 测试、数据库终态、人工标注 |

[Anthropic 的 Agent 评测实践](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)强调多轮 Agent 需要与系统复杂度相匹配的评估。最先建设的不是公开排行榜，而是一组来自真实业务、边界条件和线上失败的回归集。

### 四个北极星指标

```text
任务成功率
端到端 P95 / P99
每成功任务成本
安全与业务规则通过率
```

再向下拆：

| 维度 | 关键指标 |
| --- | --- |
| 质量 | 正确率、答案有据性、引用正确率、人工接管率 |
| 过程 | 步骤数、工具参数失败、循环、重规划、恢复成功率 |
| 性能 | 首 Token 时间、单 Token 生成时间、关键路径、任务等待时间、吞吐 |
| 成本 | 输入/输出/缓存 Token、重试浪费、单位成功成本 |
| 稳定性 | 超时、429、进程崩溃/内存溢出、熔断、降级、平均恢复时间 |
| 安全 | 越权、串租户、注入、敏感外发、危险操作未确认 |

链路追踪应使用 `trace_id/run_id` 串联路由、模型、RAG、工具、缓存、队列和终态，并记录模型、提示词、策略、工具和索引版本。[OpenTelemetry 的语义约定](https://opentelemetry.io/docs/specs/semconv/)提供跨系统统一命名的基础。

不要记录或展示模型隐藏思维链。生产审计需要的是可观察事实：状态转移、结构化路由结果、工具输入输出摘要、验证证据、Token、延迟、错误和版本。日志、链路记录和评测数据还必须脱敏、分权并设置保留周期。

## 十四、从零到生产：一张有退出条件的工程路线图

固定“八周上线”或“十二周落地”没有普适意义。企业项目更应该按退出条件推进：上一阶段没有通过，就不扩大自主性。

<figure class="diagram">
<svg viewBox="0 0 880 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="企业级 Agent 从零到生产的六阶段路线图：定义、闭环、可靠、安全、规模和条件升级">
<defs>
<marker id="roadmap-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6b6e76"/></marker>
</defs>
<rect x="0" y="0" width="880" height="430" fill="#ffffff"/>
<text x="440" y="32" text-anchor="middle" font-size="15" font-weight="700" fill="#25262b">从 0 到生产：先控制，再恢复，再扩展自治</text>

<line x1="136" y1="145" x2="164" y2="145" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#roadmap-arrow)"/>
<line x1="276" y1="145" x2="304" y2="145" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#roadmap-arrow)"/>
<line x1="416" y1="145" x2="444" y2="145" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#roadmap-arrow)"/>
<line x1="556" y1="145" x2="584" y2="145" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#roadmap-arrow)"/>
<line x1="696" y1="145" x2="724" y2="145" stroke="#6b6e76" stroke-width="1.5" marker-end="url(#roadmap-arrow)"/>

<rect x="20" y="72" width="116" height="146" rx="10" fill="#f1f2f4" stroke="#c4c6cd"/>
<text x="78" y="98" text-anchor="middle" font-size="11" fill="#6b6e76">阶段 0</text>
<text x="78" y="120" text-anchor="middle" font-size="13" font-weight="700" fill="#25262b">定义</text>
<text x="78" y="146" text-anchor="middle" font-size="10.5" fill="#555861">业务闭环</text>
<text x="78" y="163" text-anchor="middle" font-size="10.5" fill="#555861">风险 / SLO</text>
<text x="78" y="180" text-anchor="middle" font-size="10.5" fill="#555861">真实评测集</text>
<text x="78" y="204" text-anchor="middle" font-size="9.5" fill="#6b6e76">成功可判断</text>

<rect x="160" y="72" width="116" height="146" rx="10" fill="#e3e4e8" stroke="#9a9da6"/>
<text x="218" y="98" text-anchor="middle" font-size="11" fill="#6b6e76">阶段 1</text>
<text x="218" y="120" text-anchor="middle" font-size="13" font-weight="700" fill="#25262b">闭环</text>
<text x="218" y="146" text-anchor="middle" font-size="10.5" fill="#555861">身份 / 租户</text>
<text x="218" y="163" text-anchor="middle" font-size="10.5" fill="#555861">固定工作流</text>
<text x="218" y="180" text-anchor="middle" font-size="10.5" fill="#555861">只读工具 / RAG</text>
<text x="218" y="204" text-anchor="middle" font-size="9.5" fill="#6b6e76">失败可定位</text>

<rect x="300" y="72" width="116" height="146" rx="10" fill="#d4d5d9" stroke="#9a9da6"/>
<text x="358" y="98" text-anchor="middle" font-size="11" fill="#555861">阶段 2</text>
<text x="358" y="120" text-anchor="middle" font-size="13" font-weight="700" fill="#25262b">可靠</text>
<text x="358" y="146" text-anchor="middle" font-size="10.5" fill="#555861">状态 / 队列</text>
<text x="358" y="163" text-anchor="middle" font-size="10.5" fill="#555861">幂等 / 检查点</text>
<text x="358" y="180" text-anchor="middle" font-size="10.5" fill="#555861">超时 / 熔断</text>
<text x="358" y="204" text-anchor="middle" font-size="9.5" fill="#555861">故障可恢复</text>

<rect x="440" y="72" width="116" height="146" rx="10" fill="#c4c6cd" stroke="#6b6e76"/>
<text x="498" y="98" text-anchor="middle" font-size="11" fill="#555861">阶段 3</text>
<text x="498" y="120" text-anchor="middle" font-size="13" font-weight="700" fill="#25262b">治理</text>
<text x="498" y="146" text-anchor="middle" font-size="10.5" fill="#3f4249">策略 / 权限</text>
<text x="498" y="163" text-anchor="middle" font-size="10.5" fill="#3f4249">追踪 / 评测</text>
<text x="498" y="180" text-anchor="middle" font-size="10.5" fill="#3f4249">灰度 / 审计</text>
<text x="498" y="204" text-anchor="middle" font-size="9.5" fill="#3f4249">变更可回滚</text>

<rect x="580" y="72" width="116" height="146" rx="10" fill="#9a9da6" stroke="#6b6e76"/>
<text x="638" y="98" text-anchor="middle" font-size="11" fill="#ffffff">阶段 4</text>
<text x="638" y="120" text-anchor="middle" font-size="13" font-weight="700" fill="#ffffff">规模</text>
<text x="638" y="146" text-anchor="middle" font-size="10.5" fill="#ffffff">缓存 / 路由</text>
<text x="638" y="163" text-anchor="middle" font-size="10.5" fill="#ffffff">P95 / 成本</text>
<text x="638" y="180" text-anchor="middle" font-size="10.5" fill="#ffffff">容量 / 容灾</text>
<text x="638" y="204" text-anchor="middle" font-size="9.5" fill="#ffffff">峰值满足 SLO</text>

<rect x="720" y="72" width="140" height="146" rx="10" fill="#25262b"/>
<text x="790" y="98" text-anchor="middle" font-size="11" fill="#e8e9ec">阶段 5</text>
<text x="790" y="120" text-anchor="middle" font-size="13" font-weight="700" fill="#ffffff">条件升级</text>
<text x="790" y="146" text-anchor="middle" font-size="10.5" fill="#ffffff">GraphRAG</text>
<text x="790" y="163" text-anchor="middle" font-size="10.5" fill="#ffffff">Agentic RAG</text>
<text x="790" y="180" text-anchor="middle" font-size="10.5" fill="#ffffff">多 Agent</text>
<text x="790" y="204" text-anchor="middle" font-size="9.5" fill="#e8e9ec">指标证明净收益</text>

<rect x="20" y="254" width="840" height="60" rx="10" fill="#f1f2f4" stroke="#c4c6cd"/>
<text x="440" y="279" text-anchor="middle" font-size="12" font-weight="700" fill="#25262b">从第一天贯穿所有阶段</text>
<text x="440" y="299" text-anchor="middle" font-size="10.8" fill="#555861">安全 · 租户隔离 · 链路追踪 · 评测 · 成本 · 审计 · 版本治理</text>

<path d="M 790 218 L 790 244 L 710 244" fill="none" stroke="#6b6e76" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="690" y="239" text-anchor="end" font-size="10" fill="#6b6e76">不达标则回退，不继续堆复杂度</text>
<text x="440" y="352" text-anchor="middle" font-size="11" font-weight="600" fill="#25262b">路线图的单位不是“周”，而是可验证的退出条件。</text>
<text x="440" y="376" text-anchor="middle" font-size="10.5" fill="#6b6e76">先证明单链路可靠，再扩大动态决策；先证明高级检索或协作收益，再进入主流量。</text>
</svg>
<figcaption>图 2：从零到生产的工程路线图。GraphRAG、Agentic RAG 和多 Agent 位于条件升级阶段。</figcaption>
</figure>

| 阶段 | 核心工作 | 退出条件 |
| --- | --- | --- |
| 0. 定义 | 场景边界、错误成本、真实样本、质量/成本/安全 SLO | 成功与失败可以客观判断 |
| 1. 闭环 | 企业认证、租户上下文、固定工作流、单模型、少量只读工具、模块化 RAG | 每次失败能定位到具体步骤 |
| 2. 可靠 | 任务/步骤状态、检查点、幂等、取消、队列、超时、熔断、优雅启停 | 宕机、重复消息和依赖超时不会丢任务或重复副作用 |
| 3. 治理 | 策略、RAG 权限、短期凭证、链路追踪、评测门禁、灰度发布、审计 | 越权测试通过，所有变更可量化比较与回滚 |
| 4. 规模 | 缓存、模型级联、近似最近邻索引调优、并行任务图、容量模型、故障注入 | 峰值流量和依赖抖动下仍满足质量、P95 与成本 SLO |
| 5. 升级 | Plan-and-Execute、GraphRAG、Agentic RAG、多 Agent 子工作流 | 离线与线上指标证明新增复杂度带来净收益 |

## 十五、四类企业场景的推荐配方

| 场景 | 默认组合 | 升级条件 |
| --- | --- | --- |
| 企业知识问答 | 路由层 + 模块化 RAG + 引用验证 + 拒答 | 关系型问题才走 GraphRAG；多源多跳才走 Agentic RAG |
| 客服与工单 | 路由层 + 固定工作流 + 工具网关 | 路径无法枚举时升级为有界单 Agent；高风险动作进入人工审批 |
| 研究与编码 | 简短规划 + ReAct + 客观验收 | 子任务可并行或需要独立上下文时使用中心调度—并行执行模式 |
| 合规、资金、外部发布 | 确定性工作流 + 策略校验 + 幂等 + 人工关口 | 模型复核只能辅助语义检查，不能替代授权与业务验收 |

### 如果今天开始选框架，我会这样落地

框架选择要从团队语言、任务持续时间和控制权要求出发，而不是从 Star 排名出发：

| 条件 | 建议选择 | 明确边界 |
| --- | --- | --- |
| Python 团队，需要复杂分支、检查点和人工介入 | LangGraph 作为局部状态图运行时 | 身份、授权、队列、数据库、幂等和发布仍由平台负责 |
| .NET/Azure 团队，准备建设新的 Agent 工作流 | 优先评估 Microsoft Agent Framework | AutoGen 已进入维护模式；自托管组件仍需要应用自己实现安全与持久化 |
| 需要快速搭建内部低代码工作流和知识应用 | 评估 Dify | 上线前审查多租户许可证、插件权限、数据边界和运维容量，不能原样当成公共多租户 SaaS 底座 |
| 需要验证角色协作或多 Agent 任务拆分 | CrewAI 的 Flow 包住 Crew，或 OpenAI Agents SDK 的 Manager/Agents-as-tools | 不让自由群聊承担交易状态；每个子任务都要有输入、产物、预算和停止条件 |
| 以文档摄取、索引和检索组合为主 | LlamaIndex 组件或团队自有模块化 RAG 管道 | 必须独立建设权限同步、数据版本、召回评测和线上索引运维 |
| 需要关系发现或全库主题归纳 | Microsoft GraphRAG 作为专用检索分支 | 先评估索引构建、实体消歧、增量更新和查询成本，不替代普通检索 |
| 需要代码 Agent 或轻量工具循环 | smolagents 或 OpenAI Agents SDK | 强制最大步数、并发、Token 和超时；生成代码放到远程沙箱，不把本地解释器当安全边界 |
| 任务跨服务、跨天、等待外部事件且不能丢 | Temporal 等持久工作流引擎包住 Agent 步骤 | LLM 和外部调用放进活动任务；工作流本身保持确定性，所有副作用设计幂等 |

如果必须给出一套完整的基础设施组合，可以从团队已有能力出发：

- 接入与身份：现有 API 网关 + 企业身份提供方。
- 简单流程：应用代码或现有工作流系统。
- 复杂 Agent 状态：状态图运行时 + 持久化检查点存储。
- 权威状态：关系数据库；缓存与限流：Redis 类系统。
- 异步长任务：有界消息队列 + Worker；跨服务强持久流程使用持久执行引擎。
- 企业检索：支持关键词、向量和元数据预过滤的搜索系统，再接独立重排器。
- 治理：兼容 OpenTelemetry 的链路追踪 + 评测平台 + 策略引擎 + 审计存储。

这不是要求采购同一套厂商产品，而是要求每个职责都有明确所有者和替换边界。平台早期更适合模块化单体；只有出现独立扩缩容、故障域或团队所有权边界后，才拆成更多服务。不要为了追求“Agent Mesh”这个名字，提前承担分布式事务、消息一致性和跨服务排障的成本。

## 十六、十个最常见的架构反模式

1. **用框架名代替架构设计**：先选 CrewAI、LangGraph，再找业务问题。
2. **所有请求都进入 Agent**：简单分类和固定流程也付出多轮推理成本。
3. **多 Agent 角色扮演**：角色很多，输入、状态和验收却没有契约。
4. **Graph 节点越多越先进**：把普通函数包装成几十个节点，只增加维护成本。
5. **Agentic RAG 覆盖所有查询**：普通事实也反复规划、检索和自评。
6. **用提示词实现权限**：让模型自己决定能看什么、能调用什么。
7. **一切都无界**：上下文、缓存、队列、并发、步骤和重试没有容量。
8. **只看平均响应时间和单次 Token**：忽略 P95/P99、重试浪费和失败任务成本。
9. **只评最终答案**：看不到错误工具、越权路径和碰巧正确。
10. **平台先行，业务闭环滞后**：先建设通用多 Agent 平台，却没有一个可客观验收的场景。

## 结语：自主性是按证据和风险授予的权限

企业级 Agent 的成熟度，不取决于拥有多少模型、记忆、Graph 或子 Agent，而取决于系统能否把自治限制在可验证的局部，把身份、状态、预算、副作用和故障恢复牢牢掌握在确定性工程中。

最终推荐仍然只有一句：

> **用受控路由层和持久化工作流掌握主流程，用有边界的单 Agent 处理不可预测的局部，用模块化 RAG 服务大多数知识请求；GraphRAG、Agentic RAG 和多 Agent 必须等评测证明收益后再进入主链路。**

模型负责提出可能正确的理解、计划和动作；工程系统负责判断它是否被允许、是否执行成功、失败后怎样恢复。这条边界清楚以后，框架只是实现选择；这条边界不清楚，再豪华的架构图也只是一个更昂贵的 Demo。

更细的生产问题与排查清单，可以继续阅读[《生产级 AI Agent 工程面试题：22 题完整解析》](/notes/agent-production-engineering-interview-guide)；工具接口设计见[《从零学会企业级 AI Agent 开发（二）：工具层实战》](/posts/enterprise-ai-agent-02)。

## 参考资料

### 开源项目与实现文档

- [Dify：GitHub 仓库](https://github.com/langgenius/dify)
- [Dify：WorkflowRun 数据模型](https://github.com/langgenius/dify/blob/main/api/models/workflow.py)
- [Dify：图引擎与工作流存储配置](https://github.com/langgenius/dify/blob/main/api/.env.example)
- [Dify：许可证与多租户限制](https://github.com/langgenius/dify/blob/main/LICENSE)
- [LangGraph：GitHub 仓库](https://github.com/langchain-ai/langgraph)
- [LangGraph：Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph：Interrupts 与幂等边界](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [CrewAI：Crews 与 Flows](https://github.com/crewAIInc/crewAI)
- [AutoGen：维护状态与后继项目说明](https://github.com/microsoft/autogen)
- [Microsoft Agent Framework：GitHub 仓库](https://github.com/microsoft/agent-framework)
- [Microsoft Agent Framework：工作流执行模型](https://learn.microsoft.com/en-us/agent-framework/concepts/workflows/builder-and-execution)
- [Microsoft Agent Framework：自托管职责与安全会话恢复](https://learn.microsoft.com/en-us/agent-framework/hosting/self-hosting/)
- [OpenAI Agents SDK：运行循环与最大轮次](https://openai.github.io/openai-agents-python/running_agents/)
- [OpenAI Agents SDK：Guardrail 的覆盖边界](https://openai.github.io/openai-agents-python/guardrails/)
- [OpenAI Agents SDK：多 Agent 编排](https://openai.github.io/openai-agents-python/multi_agent/)
- [LlamaIndex：GitHub 仓库与模块化数据框架](https://github.com/run-llama/llama_index)
- [Microsoft GraphRAG：索引管道](https://microsoft.github.io/graphrag/index/overview/)
- [Microsoft GraphRAG：Local、Global、DRIFT 与 Basic Search](https://microsoft.github.io/graphrag/query/overview/)
- [Hugging Face smolagents：安全执行与沙箱边界](https://huggingface.co/docs/smolagents/main/tutorials/secure_code_execution)
- [12-Factor Agents：控制流、上下文与小型 Agent](https://github.com/humanlayer/12-factor-agents)
- [Temporal：服务与持久执行架构](https://github.com/temporalio/temporal/blob/main/docs/architecture/README.md)

### 课程、研究与安全规范

- [DeepLearning.AI：吴恩达 Agentic AI 课程](https://www.deeplearning.ai/courses/agentic-ai)
- [Andrej Karpathy：Software Is Changing (Again)](https://www.youtube.com/watch?v=LCEmiRjPEtQ)
- [Anthropic：Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Anthropic：Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG](https://arxiv.org/abs/2501.09136)
- [Google Research：When and Why Agent Systems Work](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/)
- [OWASP：Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [OWASP：Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)
- [OpenTelemetry：Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
