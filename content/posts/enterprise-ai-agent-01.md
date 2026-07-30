---
title: 从零学会企业级 AI Agent 开发（一）：祛魅——Agent 的本质是一个带护栏的 while 循环
date: 2026-06-11
category: code
tags: [AI, Agent, LLM, 工程实践]
cover: /images/cover-volcano-hiker.jpg
coverAlt: 云海之上的火山群峰与独行的登山者剪影
excerpt: 企业级 AI Agent 开发系列开篇：用一手资料拆解「95% 试点失败」的真相，认清 Agent 的本质——一个带护栏的 while 循环，写出第一个可运行的最小实现，并给出整个系列的工程路线图。
dek: 这个系列只讲能落地的东西：每一个结论都来自一手工程复盘，每一个坑都有真实事故背书。第一篇先把概念钉死、把循环跑通、把地图铺开。
---

> 这是「从零学会企业级 AI Agent 开发」系列的第一篇。这个系列的写作原则只有三条：**工程化**（每个方案都能直接落地）、**讲真话**（失败数据和成功案例同等重要）、**坑点必须真实**（来自公开事故复盘和一手工程博客，全部注明出处）。

## 一、先泼冷水：行业的真实成绩单

2025 年 8 月，一份报告引爆了科技媒体——「MIT 报告：95% 的企业生成式 AI 试点正在失败」。这条新闻甚至引发了一轮 AI 股抛售。

但如果你去考证原文（MIT Media Lab 旗下 NANDA 项目的《The GenAI Divide: State of AI in Business 2025》，v0.1 版、26 页、未经同行评审，后来事实上被下架），会发现真相克制得多：

- 样本是 **52 家组织的访谈 + 153 份高管问卷**，不是大规模统计；
- 「失败」的定义极窄：**试点后 6 个月内没有产生可计量的损益表（P&L）影响**就算失败——效率提升、降本这些软收益都不算；
- 报告同时发现：**超过 90% 的员工在用个人 ChatGPT 账号干活**。「95% 失败」和「90% 在偷偷用」是同时成立的。

也就是说，问题从来不是「AI 没用」，而是**企业没能把模型能力变成可靠的生产系统**。这一点有更严谨的数据交叉印证：

| 数据点 | 来源 |
| --- | --- |
| 到 2027 年底，超过 40% 的 agentic AI 项目将因「成本失控、商业价值不清、风险控制不足」被取消 | Gartner，2025-06 新闻稿 |
| 数千家自称 agentic AI 的厂商中，真正算得上 agent 的只有约 130 家（其余是 chatbot/RPA 换皮，即 "agent washing"） | 同上 |
| 62% 的企业在实验 agent，但只有 23% 在任何环节实现规模化 | McKinsey《State of AI 2025》 |
| 仅 2% 的组织规模化部署了 agent | Capgemini，2025-07 |
| Agent 完成多步办公任务的基准成功率只有约 30–35% | CMU/Salesforce benchmark，2025-06 |

注意一个关键事实：这些失败里，**模型能力几乎从来不是第一死因**。NANDA 报告把病因总结为 "learning gap"——系统不学习、无记忆、嵌不进工作流；Gartner 列的三大死因是成本、价值和风控。**鸿沟在工程，不在模型。** 这正是这个系列存在的理由：AI Agent 开发的难点是一个系统工程问题，而系统工程是可以学会的。

## 二、把名词钉死：Workflow、Agent 与 Agentic System

企业里关于 Agent 的讨论之所以混乱，一半原因是大家说的不是同一个东西。我们采用 Anthropic 在《Building Effective Agents》里的定义——这是目前业界引用最广、也最经得起推敲的版本。两者统称 **agentic systems**，区别只在**控制流归谁**：

- **Workflow**：LLM 和工具被**预定义的代码路径**编排起来。先做什么、后做什么，是你写死的。
- **Agent**：LLM 在运行时**自主决定**流程和工具使用。下一步做什么，是模型说了算。

<figure class="diagram">
<svg viewBox="0 0 800 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Workflow 与 Agent 的控制流对比图">
<defs>
<marker id="aw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<line x1="400" y1="24" x2="400" y2="296" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 5"/>
<text x="200" y="34" text-anchor="middle" font-size="14" font-weight="600" fill="#25262b">Workflow：路径由代码预先定义</text>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#aw-arrow)">
<line x1="200" y1="78" x2="200" y2="94"/>
<line x1="200" y1="126" x2="200" y2="142"/>
<line x1="200" y1="174" x2="200" y2="190"/>
<line x1="200" y1="222" x2="200" y2="238"/>
</g>
<rect x="125" y="48" width="150" height="30" rx="8" fill="#25262b"/>
<text x="200" y="68" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">输入</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="125" y="96" width="150" height="30" rx="8"/>
<rect x="125" y="144" width="150" height="30" rx="8"/>
<rect x="125" y="192" width="150" height="30" rx="8"/>
</g>
<text x="200" y="116" text-anchor="middle" font-size="13" fill="#25262b">LLM 调用 A</text>
<text x="200" y="164" text-anchor="middle" font-size="13" fill="#25262b">程序化门控（校验）</text>
<text x="200" y="212" text-anchor="middle" font-size="13" fill="#25262b">LLM 调用 B</text>
<rect x="125" y="240" width="150" height="30" rx="8" fill="#25262b"/>
<text x="200" y="260" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">输出</text>
<text x="200" y="296" text-anchor="middle" font-size="12" fill="#6b6e76">可预测、好调试、好评测——优先选它</text>
<text x="600" y="34" text-anchor="middle" font-size="14" font-weight="600" fill="#25262b">Agent：LLM 在循环里自主决定</text>
<rect x="525" y="48" width="150" height="30" rx="8" fill="#25262b"/>
<text x="600" y="68" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">任务</text>
<line x1="600" y1="78" x2="600" y2="106" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#aw-arrow)"/>
<rect x="525" y="108" width="150" height="34" rx="8" fill="#ffffff" stroke="#25262b" stroke-width="2"/>
<text x="600" y="130" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">LLM 决策</text>
<rect x="525" y="216" width="150" height="34" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="600" y="238" text-anchor="middle" font-size="13" fill="#25262b">工具 / 环境</text>
<g stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#aw-arrow)">
<path d="M 560 142 L 560 214"/>
<path d="M 640 250 C 640 264 700 264 700 250 L 700 160 C 700 148 660 142 646 142"/>
</g>
<text x="552" y="184" text-anchor="end" font-size="12" fill="#6b6e76">发起工具调用</text>
<text x="708" y="208" font-size="12" fill="#6b6e76">结果反馈</text>
<line x1="525" y1="125" x2="478" y2="125" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#aw-arrow)"/>
<rect x="420" y="110" width="58" height="30" rx="8" fill="#25262b"/>
<text x="449" y="130" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">输出</text>
<text x="466" y="98" text-anchor="middle" font-size="11" fill="#6b6e76">满足终止条件</text>
<text x="600" y="296" text-anchor="middle" font-size="12" fill="#6b6e76">灵活但不可预测——复杂度需要被工程化约束</text>
</svg>
<figcaption>图 1：agentic system 的两种形态。区别不在「智能程度」，而在控制流归代码还是归模型。</figcaption>
</figure>

Workflow 这一侧，Anthropic 总结了五种被生产环境反复验证的模式，后面第四篇会逐个落地，这里先给一张速查表：

| 模式 | 一句话 | 用它的判据 |
| --- | --- | --- |
| Prompt chaining | 任务拆成固定步骤串行，中间加程序化校验 | 任务能干净地拆成固定子任务，用延迟换精度 |
| Routing | 先分类，再分发给专门的下游 prompt | 输入有明显类别，且分类本身够准 |
| Parallelization | 子任务并行，或同一任务跑多次投票 | 要么求速度，要么用多视角换置信度 |
| Orchestrator-workers | 中心 LLM 动态拆任务、派发、汇总 | **无法预知**需要哪些子任务时 |
| Evaluator-optimizer | 一个生成、一个评估，循环打磨 | 有清晰的评估标准，且迭代有可测收益 |

这里有本系列的第一条工程铁律，来自 Anthropic 原文：

> "We suggest finding the simplest solution possible, and only increasing complexity when needed."
> ——**能用单次 LLM 调用解决的不要用 workflow，能用 workflow 解决的不要用 agent。** 复杂度是成本，只在被证明必要时支付。

很多企业项目第一步就死在这里：业务本来是个「分类 + 模板」的 routing 问题，却被立项成「全自主智能体平台」。Gartner 所谓 "agent washing" 的另一面，就是**需求侧的 agent 滥用**。

## 三、Agent 的本质：九行伪代码

把神秘感去掉。Anthropic 对 agent 的描述只有一句话：

> "They are typically just **LLMs using tools based on environmental feedback in a loop**."
> （Agent 通常只是：LLM 在一个循环里，基于环境反馈使用工具。）

写成伪代码，核心逻辑不到十行：

```python
messages = [system_prompt, user_task]
while True:
    reply = llm(messages, tools)          # 模型决策
    messages.append(reply)
    if not reply.tool_calls:              # 不再调工具 = 任务完成
        return reply.content
    for call in reply.tool_calls:
        result = execute(call)            # 确定性代码执行
        messages.append(tool_result(result))   # 环境反馈写回上下文
```

这不是简化示意——sketch.dev 的工程师写过一篇《The unreasonable effectiveness of an LLM agent loop with tool use》，生产可用的核心循环就是 9 行；Hacker News 上的高赞评论说得更直白："no secret sauce and 95% of the magic is in the LLM itself"。甚至 Claude Code 本身，架构分析显示也是一个单线程主循环加扁平消息历史。

但请注意那篇分析的另一半数字：Claude Code 的代码库里，**只有约 1.6% 是 AI 决策逻辑，98.4% 是确定性基础设施**——权限门控、上下文压缩、工具路由、错误恢复。这就是本篇标题的完整含义：

**Agent 的本质是一个 while 循环；企业级 Agent 的本质是这个循环外面那 98% 的护栏。**

<figure class="diagram">
<svg viewBox="0 0 800 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Agent 循环解剖图：上下文、LLM、工具执行与工程护栏">
<defs>
<marker id="lp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
<marker id="lp-arrow-d" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<rect x="340" y="40" width="120" height="32" rx="8" fill="#25262b"/>
<text x="400" y="61" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">最终回答</text>
<line x1="400" y1="124" x2="400" y2="76" stroke="#25262b" stroke-width="1.5" marker-end="url(#lp-arrow-d)"/>
<text x="412" y="100" font-size="11" fill="#6b6e76">无工具调用 = 完成</text>
<rect x="60" y="120" width="170" height="84" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="145" y="142" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">上下文窗口</text>
<text x="145" y="162" text-anchor="middle" font-size="11" fill="#6b6e76">系统提示词 + 任务</text>
<text x="145" y="178" text-anchor="middle" font-size="11" fill="#6b6e76">历史决策与工具结果</text>
<text x="145" y="194" text-anchor="middle" font-size="11" fill="#6b6e76">（每一步全量送入）</text>
<rect x="340" y="128" width="120" height="60" rx="10" fill="#25262b"/>
<text x="400" y="153" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">LLM</text>
<text x="400" y="172" text-anchor="middle" font-size="11" fill="#c4c6cd">无状态函数</text>
<rect x="570" y="128" width="170" height="60" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="655" y="153" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">工具执行</text>
<text x="655" y="172" text-anchor="middle" font-size="11" fill="#6b6e76">确定性代码</text>
<g stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#lp-arrow)">
<line x1="230" y1="150" x2="336" y2="150"/>
<line x1="460" y1="158" x2="566" y2="158"/>
<path d="M 655 188 L 655 252 L 145 252 L 145 208"/>
</g>
<text x="283" y="140" text-anchor="middle" font-size="11" fill="#6b6e76">推理</text>
<text x="513" y="148" text-anchor="middle" font-size="11" fill="#6b6e76">tool call（JSON）</text>
<text x="400" y="244" text-anchor="middle" font-size="11" fill="#6b6e76">结果（含报错）追加回上下文，作为下一步的 ground truth</text>
<text x="68" y="296" font-size="12" fill="#25262b" font-weight="600">缺一个都可能出事故的护栏：</text>
<g>
<rect x="68" y="308" width="142" height="26" rx="13" fill="#25262b"/>
<text x="139" y="325" text-anchor="middle" font-size="11" fill="#ffffff">最大步数 / 预算上限</text>
<rect x="220" y="308" width="96" height="26" rx="13" fill="#25262b"/>
<text x="268" y="325" text-anchor="middle" font-size="11" fill="#ffffff">死循环检测</text>
<rect x="326" y="308" width="110" height="26" rx="13" fill="#25262b"/>
<text x="381" y="325" text-anchor="middle" font-size="11" fill="#ffffff">工具结果截断</text>
<rect x="446" y="308" width="142" height="26" rx="13" fill="#25262b"/>
<text x="517" y="325" text-anchor="middle" font-size="11" fill="#ffffff">错误压回上下文</text>
<rect x="598" y="308" width="142" height="26" rx="13" fill="#25262b"/>
<text x="669" y="325" text-anchor="middle" font-size="11" fill="#ffffff">高危操作人工审批</text>
</g>
</svg>
<figcaption>图 2：agent 循环的解剖。循环本身极简，企业级的差距全在底部那排护栏——它们正是本系列后续各篇的主题。</figcaption>
</figure>

### 一个可运行的最小实现

空谈无益，下面是一个完整可跑的最小 agent：Python + OpenAI 兼容 API（示例用 DeepSeek，换 `base_url` 和模型名即可切换任何兼容服务），实现一个能读文件、列目录的本地助手。注意代码里的注释——每一条都对应一个真实事故。

```python
import json
from openai import OpenAI

client = OpenAI(api_key="sk-...", base_url="https://api.deepseek.com")

SYSTEM_PROMPT = (
    "你是一个本地文件助手。用提供的工具完成任务，"
    "信息足够后直接给出最终回答，不要重复调用同一工具。"
)

def read_file(path: str) -> str:
    """读取文本文件内容"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()[:8000]  # 截断：单个工具结果就能撑爆上下文
    except OSError as e:
        return f"ERROR: {e}"        # 错误不抛出，作为观测结果还给模型

def list_dir(path: str) -> str:
    """列出目录内容"""
    import os
    try:
        return "\n".join(sorted(os.listdir(path))[:200])
    except OSError as e:
        return f"ERROR: {e}"

TOOLS = {"read_file": read_file, "list_dir": list_dir}

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": name,
            "description": fn.__doc__,
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string", "description": "绝对路径"}},
                "required": ["path"],
            },
        },
    }
    for name, fn in TOOLS.items()
]

def run_agent(task: str, max_steps: int = 15) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": task},
    ]
    for _ in range(max_steps):  # 护栏 1：硬性步数上限
        resp = client.chat.completions.create(
            model="deepseek-chat", messages=messages, tools=TOOL_SCHEMAS
        )
        msg = resp.choices[0].message
        messages.append(msg)

        if not msg.tool_calls:  # 终止条件：模型不再调工具
            return msg.content

        for call in msg.tool_calls:
            fn = TOOLS.get(call.function.name)
            try:
                args = json.loads(call.function.arguments)
                result = fn(**args) if fn else f"ERROR: 未知工具 {call.function.name}"
            except (json.JSONDecodeError, TypeError) as e:
                result = f"ERROR: 参数无效 {e}"  # 护栏 2：畸形参数不崩溃，压回上下文
            messages.append(
                {"role": "tool", "tool_call_id": call.id, "content": result}
            )

    return "已达最大步数，任务中止"  # 护栏 3：永远不要假设模型会自己停下来

if __name__ == "__main__":
    print(run_agent("看看 /tmp 目录下有什么，挑一个文本文件总结内容"))
```

不到一百行，但三个护栏一个都不能少。它们分别对应三类真实事故：

> **真实坑点 ①：没有步数上限 = 开盲盒。** 一位工程师复盘过凌晨三点的告警：他的客服分诊 agent **连续调用同一个 `search_knowledge_base` 工具 73 次**，单次会话烧掉 4.7 万 token——模型对结果不满意，就一直「再试一次」。LangGraph 也有真实 issue：Text-to-SQL agent 无限重复同一个 tool call 直到撞上框架默认的递归上限（25 层）才停。

> **真实坑点 ②：重试逻辑写进 prompt = 灾难。** 一份广为流传的事故复盘：CRM 订单同步 agent 撞上 API 限流（429）后进入「规划 → 调用 → 429 → 重新规划」的循环，**每小时约 4,800 次请求、持续 63 小时、烧掉 $4,200**。根因是 prompt 里写了一句 "keep trying until it works"，而系统层没有 token 预算、美元上限、墙钟时间限制中的任何一个，也没有告警。重试属于代码，不属于 prompt。

> **真实坑点 ③：工具报错直接抛异常 = 丢掉自愈能力。** Manus 团队（agent 框架重写了四次）的复盘里有个反直觉的结论：**把错误留在上下文里**。模型看到上一步的报错，才能换路子；你把异常吞掉或让进程崩溃，它就只能在黑暗里重复同一个错误。他们认为「错误恢复能力是真正 agentic 行为最清晰的指标之一」。

## 四、Demo 一周，上线一年：复合错误率的数学

跑通上面的代码大概只要十分钟，于是每个团队都会经历同一个幻觉：「这就成了？下周上线。」接下来发生的事，可以用一道初中数学题解释。

曾在银行做过 12+ 个生产 agent 系统的工程师 Utkarsh Kanwat，在《Why I'm Betting Against AI Agents in 2025》里给出了被引用最多的一组数字：假设 agent 每一步的可靠性是 95%（对当前模型已经很乐观）：

- 5 步任务：端到端成功率 77%
- 10 步任务：59%
- **20 步任务：36%**

而生产系统的要求通常是 99.9%。

<figure class="diagram">
<svg viewBox="0 0 800 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="复合错误率曲线：端到端成功率随任务步数指数下降">
<g stroke="#e3e4e8" stroke-width="1">
<line x1="60" y1="100" x2="760" y2="100"/>
<line x1="60" y1="160" x2="760" y2="160"/>
<line x1="60" y1="220" x2="760" y2="220"/>
</g>
<line x1="60" y1="40" x2="60" y2="280" stroke="#9a9da6" stroke-width="1.5"/>
<line x1="60" y1="280" x2="760" y2="280" stroke="#9a9da6" stroke-width="1.5"/>
<g font-size="11" fill="#6b6e76">
<text x="52" y="44" text-anchor="end">100%</text>
<text x="52" y="104" text-anchor="end">75%</text>
<text x="52" y="164" text-anchor="end">50%</text>
<text x="52" y="224" text-anchor="end">25%</text>
<text x="52" y="284" text-anchor="end">0%</text>
<text x="60" y="300" text-anchor="middle">0</text>
<text x="200" y="300" text-anchor="middle">10</text>
<text x="340" y="300" text-anchor="middle">20</text>
<text x="480" y="300" text-anchor="middle">30</text>
<text x="620" y="300" text-anchor="middle">40</text>
<text x="760" y="300" text-anchor="middle">50</text>
<text x="410" y="322" text-anchor="middle">任务步数</text>
</g>
<text x="20" y="160" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600" transform="rotate(-90 20 160)">端到端成功率</text>
<polyline points="60,40 200,42.4 340,44.7 480,47.1 620,49.4 760,51.8" fill="none" stroke="#c4c6cd" stroke-width="2"/>
<polyline points="60,40 130,51.8 200,63 270,73.6 340,83.7 410,93.3 480,102.5 550,111.2 620,119.5 690,127.4 760,134.8" fill="none" stroke="#6b6e76" stroke-width="2"/>
<polyline points="60,40 130,94.3 200,136.3 270,168.8 340,194 410,213.5 480,228.5 550,240.1 620,249.1 690,256.1 760,261.5" fill="none" stroke="#25262b" stroke-width="2.5"/>
<g font-size="12" font-weight="600">
<text x="700" y="46" fill="#9a9da6">99.9% / 步</text>
<text x="700" y="128" fill="#6b6e76">99% / 步</text>
<text x="700" y="255" fill="#25262b">95% / 步</text>
</g>
<line x1="340" y1="194" x2="340" y2="280" stroke="#25262b" stroke-width="1" stroke-dasharray="4 4"/>
<circle cx="340" cy="194" r="4.5" fill="#25262b"/>
<text x="352" y="190" font-size="12" fill="#25262b" font-weight="600">20 步 → 36%</text>
</svg>
<figcaption>图 3：端到端成功率 = 单步可靠性 ^ 步数。即便单步做到 99%，20 步任务也只有 82%。这条曲线决定了企业级 agent 的所有架构选择。</figcaption>
</figure>

这条曲线不是悲观主义，而是设计约束。它直接推导出企业级 agent 的几条军规，每一条都有公开实践背书：

1. **缩短链路。** 12-Factor Agents（GitHub 2.3 万 star 的生产 agent 方法论）第 10 条：每个 agent 控制在 **3–10 步，最多 20 步**。链路一长，靠的就不再是模型，而是 checkpoint 和回滚。
2. **每一步都要有 ground truth。** 工具执行结果、代码运行输出、测试通过与否——环境反馈是循环纠错的唯一依据。这也是为什么 coding 和客服是 agent 最先跑通的两个场景：结果可验证。
3. **可靠性靠工程而不是靠祈祷。** Kanwat 自己的 DevOps agent 能上生产，是因为它被限制在 3–5 个带回滚点的离散操作里。他的原话："The AI is doing maybe 30% of the work. The other 70% is tool engineering."
4. **人是系统的一部分，不是补丁。** OpenAI 的官方指南把 human-in-the-loop 列为两类硬触发：重试超限、高危操作（不可逆、涉钱、敏感）。Anthropic 的 multi-agent 系统也强调 checkpoint 处人工介入。

> **真实坑点 ④：自主性的代价要先算账。** 独立团队 Answer.AI 用 Devin（最著名的全自主编码 agent）真实工作了一个月、20 个任务：**3 成、14 败、3 个无定论，成功率约 15%**。最致命的不是失败本身，而是「看不出任何规律来预判哪些任务能成」——不可预测性让它无法被纳入工作流。给任务设自主性边界，永远先于给 agent 加能力。

## 五、框架之争：先裸写，还是先上 LangGraph？

这是新团队问得最多的问题，也是争论最凶的问题。两边的论点都值得认真听：

**「先裸写」派**（Anthropic、12-Factor Agents、fly.io 的 Thomas Ptacek、browser-use……）：

- Anthropic 原文直接建议 "**start by using LLM APIs directly**: many patterns can be implemented in a few lines of code"，并警告框架 "obscure the underlying prompts and responses, making them harder to debug"；
- 12-Factor Agents 的作者访谈了 100+ 团队后发现一个固定剧情：用框架快速冲到 **70–80% 的质量线**，然后撞墙，为了突破不得不逆向工程框架内部，最终重写。他的三条核心原则——own your prompts、own your context window、own your control flow——本质都是「从框架黑盒里拿回控制权」；
- Octomind 团队在生产环境用了 12 个月 LangChain 之后将其拆除，理由是「抽象之上的抽象」，拆完后「大部分代码变成了简单的 API 调用和普通的 Python 循环」。

**「上框架」派**（LangChain、Temporal……）：

- LangChain CEO Harrison Chase 的回应有理有据：难的从来不是 loop，而是「确保每一步 LLM 拿到恰当的上下文」以及 loop 之外的基建——durable execution（崩溃恢复）、human-in-the-loop 审批、streaming、可观测性。这些不值得每个团队重写一遍；
- 生产数字也确实在那里：LangGraph 1.0 已 GA，Uber、LinkedIn、Klarna 等都是公开案例。

**本系列的立场（也是 2026 年的行业共识）**：

1. **教学和原型阶段，先裸写。** 这一点两派其实没有分歧——不亲手写一遍循环，你无法理解框架在替你做什么，更无法在它出错时调试它。本系列第 1–5 篇全部基于裸写实现。
2. **生产阶段，薄抽象 + 通用基建。** 把 prompt、上下文组装、控制流握在自己手里（这是业务核心逻辑）；把持久化、队列、重试、tracing 交给通用基础设施。需要图编排、checkpoint 这类重型能力时再引入 LangGraph 这一级的框架，并且清楚知道引入了什么。
3. **保持随时可拆。** 模型每升级一代，就有一批复杂 scaffolding 贬值——Manus 重写四次、browser-use 删掉数千行早期抽象。脚手架越薄，跟上模型进化越快。

## 六、企业级 Agent 的工程全景与系列路线图

把前面所有线索收拢，企业级 agent 开发的知识地图是分层的——这也是本系列的目录。每一层都有对应的真实事故在前面等着，我们一层一层来拆。

<figure class="diagram">
<svg viewBox="0 0 800 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="企业级 Agent 工程全景与系列路线图">
<text x="400" y="28" text-anchor="middle" font-size="14" font-weight="600" fill="#25262b">企业级 Agent 工程全景（自下而上构建）</text>
<g>
<rect x="60" y="382" width="560" height="36" rx="8" fill="#25262b"/>
<text x="76" y="400" font-size="13" fill="#ffffff" font-weight="600">最小内核：agent loop</text>
<text x="76" y="413" font-size="10.5" fill="#c4c6cd">while 循环 · 终止条件 · 基础护栏</text>
<rect x="632" y="387" width="108" height="26" rx="13" fill="#25262b"/>
<text x="686" y="404" text-anchor="middle" font-size="11" fill="#ffffff">第 1 篇（本篇）</text>
</g>
<g>
<rect x="60" y="336" width="560" height="36" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="76" y="354" font-size="13" fill="#25262b" font-weight="600">工具层（ACI）</text>
<text x="76" y="367" font-size="10.5" fill="#6b6e76">工具 schema 设计 · 防呆 · 结果设计 · 错误处理 · MCP</text>
<rect x="632" y="341" width="108" height="26" rx="13" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="686" y="358" text-anchor="middle" font-size="11" fill="#25262b">第 2 篇</text>
</g>
<g>
<rect x="60" y="290" width="560" height="36" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="76" y="308" font-size="13" fill="#25262b" font-weight="600">上下文工程</text>
<text x="76" y="321" font-size="10.5" fill="#6b6e76">attention 预算 · KV-cache · 压缩与记忆 · just-in-time 加载</text>
<rect x="632" y="295" width="108" height="26" rx="13" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="686" y="312" text-anchor="middle" font-size="11" fill="#25262b">第 3 篇</text>
</g>
<g>
<rect x="60" y="244" width="560" height="36" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="76" y="262" font-size="13" fill="#25262b" font-weight="600">编排模式</text>
<text x="76" y="275" font-size="10.5" fill="#6b6e76">五种 workflow 模式落地 · 多 agent 的取舍与陷阱</text>
<rect x="632" y="249" width="108" height="26" rx="13" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="686" y="266" text-anchor="middle" font-size="11" fill="#25262b">第 4 篇</text>
</g>
<g>
<rect x="60" y="198" width="560" height="36" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="76" y="216" font-size="13" fill="#25262b" font-weight="600">可靠性工程</text>
<text x="76" y="229" font-size="10.5" fill="#6b6e76">终止契约 · 循环检测 · checkpoint 与恢复 · human-in-the-loop</text>
<rect x="632" y="203" width="108" height="26" rx="13" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="686" y="220" text-anchor="middle" font-size="11" fill="#25262b">第 5 篇</text>
</g>
<g>
<rect x="60" y="152" width="560" height="36" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="76" y="170" font-size="13" fill="#25262b" font-weight="600">评测与可观测性</text>
<text x="76" y="183" font-size="10.5" fill="#6b6e76">eval 三层法 · LLM-as-judge · tracing · 回归检测</text>
<rect x="632" y="157" width="108" height="26" rx="13" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="686" y="174" text-anchor="middle" font-size="11" fill="#25262b">第 6 篇</text>
</g>
<g>
<rect x="60" y="106" width="560" height="36" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="76" y="124" font-size="13" fill="#25262b" font-weight="600">安全与权限</text>
<text x="76" y="137" font-size="10.5" fill="#6b6e76">prompt injection · lethal trifecta · 最小权限 · 沙箱隔离</text>
<rect x="632" y="111" width="108" height="26" rx="13" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="686" y="128" text-anchor="middle" font-size="11" fill="#25262b">第 7 篇</text>
</g>
<g>
<rect x="60" y="60" width="560" height="36" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="76" y="78" font-size="13" fill="#25262b" font-weight="600">成本与部署运维</text>
<text x="76" y="91" font-size="10.5" fill="#6b6e76">token 经济学 · 缓存与模型路由 · 灰度发布 · 综合实战</text>
<rect x="632" y="65" width="108" height="26" rx="13" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="686" y="82" text-anchor="middle" font-size="11" fill="#25262b">第 8–9 篇</text>
</g>
</svg>
<figcaption>图 4：本系列路线图。自下而上构建：先让循环跑起来，再逐层加上让它配得上「企业级」三个字的工程。</figcaption>
</figure>

预告几个后面会展开的硬核数字，让你对「每一层都有坑」有个体感：

- **工具层**：Anthropic 做 SWE-bench agent 时，「花在优化工具上的时间比优化整体 prompt 还多」；τ-bench 显示 agent 多数失败是**选错工具**而非执行错误。（第 2 篇）
- **上下文层**：Chroma 的技术报告测了 18 个主流模型，输入从 1 万涨到 10 万+ token 时，连简单任务的准确率都会**下降 20–50%**（context rot）；Manus 实测 agentic 循环输入输出 token 比约 **100:1**，KV-cache 命中与否是 **10 倍**单价差。（第 3 篇）
- **编排层**：Anthropic 的多 agent 研究系统比单 agent 强 90.2%，但要烧 **15 倍** token；而 Cognition 的著名檄文《Don't Build Multi-Agents》主张单线程——两家说的其实是同一件事：**读可以并行，写必须单线程**。（第 4 篇）
- **评测层**：Voiceflow 的 eval 体系在一次模型版本升级时抓到了 **10% 的性能回退**——纯靠「感觉不错」的团队会直接把回退发上线。（第 6 篇）
- **安全层**：2025 年已经有成串的真实事故——Microsoft 365 Copilot 的零点击数据外泄（EchoLeak，CVSS 9.3）、GitHub MCP 私有仓库泄漏、Replit agent 在明确被告知 code freeze 后删除生产数据库。（第 7 篇）

## 七、本篇小结

四个带走的结论：

1. **失败率很高，但死因几乎都是工程，不是模型。** 「95% 失败」的真实含义是「6 个月内没产生可计量的损益影响」，同期 90% 的员工在私下用 AI。鸿沟是可以靠工程填平的。
2. **概念上只有一个分叉：控制流归代码（workflow）还是归模型（agent）。** 永远先选简单的那个，复杂度只在被证明必要时支付。
3. **Agent = while 循环 + 护栏。** 循环九行写完；步数上限、预算上限、循环检测、错误压回上下文、人工审批——这些护栏每少一个，就对应一类有名有姓的事故。
4. **复合错误率是第一设计约束。** 95% 单步可靠性 × 20 步 = 36%。链路要短、反馈要真、回滚要有、人要在环上。

下一篇我们进入工具层：为什么说 **agent 的能力上限由工具质量决定**、怎么设计让模型「想用对也容易用对」的工具接口（ACI），以及 MCP 在企业里的正确打开方式。

## 参考资料

- Anthropic, [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)（2024-12）
- Anthropic, [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)（2025-09）
- OpenAI, [A Practical Guide to Building Agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)（2025-04）
- Dex Horthy, [12-Factor Agents](https://github.com/humanlayer/12-factor-agents)
- Utkarsh Kanwat, [Why I'm Betting Against AI Agents in 2025 (Despite Building Them)](https://utkarshkanwat.com/writing/betting-against-agents)
- Yichao "Peak" Ji (Manus), [Context Engineering for AI Agents: Lessons from Building Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- Walden Yan (Cognition), [Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents)
- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/built-multi-agent-research-system)
- Gartner, [Over 40% of Agentic AI Projects Will Be Canceled by End of 2027](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)（2025-06）
- MIT NANDA,《The GenAI Divide: State of AI in Business 2025》（v0.1，未经同行评审；本文采用考证后的克制表述）
- Hamel Husain et al. (Answer.AI), [Thoughts On A Month With Devin](https://www.answer.ai/posts/2025-01-08-devin.html)
- Octomind, [Why we no longer use LangChain for building our AI agents](https://www.octomind.dev/blog/why-we-no-longer-use-langchain-for-building-our-ai-agents)
- Harrison Chase (LangChain), [How to think about agent frameworks](https://www.langchain.com/blog/how-to-think-about-agent-frameworks)
- Chroma Research, [Context Rot: How Increasing Input Tokens Impacts LLM Performance](https://research.trychroma.com/context-rot)（2025-07）
