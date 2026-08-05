---
title: 幻觉、内讧与兜底：Agent 可靠性工程指南
date: 2026-08-04T18:00:00
category: code
tags: [Agent, LLM, 幻觉, 多智能体, 可靠性, 工程实践]
cover: /images/agent-reliability-cover.jpg
coverAlt: 梵高《星月夜》风格的油画：深蓝色的星空布满旋涡状笔触和几团暖黄的星光，一个人影独自站在木船上划桨，湖面倒映着远处城镇的点点灯火
excerpt: 从「错误会复利」这笔账出发，拆解 Agent 开发最难缠的三件事：模型为什么必然胡编、多智能体为什么互相甩锅打架、兜底应该怎么分层设计。综合 OpenAI 的幻觉成因论文、Berkeley 的 MAST 失败分类学、Anthropic 与 Cognition 的一线实践，外加五个容易被低估的坑和一份十二条落地清单。
dek: 模型的不可靠是常数，系统的可靠是变量——Agent 工程的全部要义，是不让前者决定后者。
---

> 一个流传很广的行业笑话：用大模型搭一个惊艳的 demo 要五分钟，把它变成敢上生产的产品要六个月——而且六个月后你才发现，真正的工作刚刚开始。这中间隔着的不是模型能力，而是三个问题：**它会胡编**，**它们会内讧**，以及**它坏掉的时候你没有兜底**。这篇文章把这三个问题挨个拆开，再补上几个检索过程中反复出现、却很少被放在台面上讲的坑。

## 一、先算一笔账：错误是会复利的

聊天机器人答错一个问题，用户皱皱眉重问一遍就过去了。Agent 不一样：它要连续做几十步决策——理解任务、选工具、传参数、读结果、再规划下一步——每一步的输出都是下一步的输入。这让 Agent 的可靠性首先变成一道数学题：

**任务成功率 ≈ 单步正确率 ^ 步数。**

单步正确率 95% 听起来相当不错，但一个 20 步的任务只剩 36% 的成功率；30 步只剩 21%。如果单步掉到 90%，20 步之后成功率就只有 12%——比抛硬币差得多。

<figure class="diagram">
<svg viewBox="0 0 800 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="折线图：横轴是任务步数 0 到 30，纵轴是任务成功率。单步正确率 99%、95%、90% 三条曲线随步数增加而下降，95% 的曲线在 20 步时降到约 36%，90% 的曲线在 20 步时降到约 12%">
<rect x="0" y="0" width="800" height="330" fill="#ffffff"/>
<text x="80" y="26" font-size="12" fill="#25262b" font-weight="600">任务成功率 = 单步正确率 ^ 步数</text>
<g stroke="#e3e4e8" stroke-width="1">
<line x1="80" y1="205" x2="740" y2="205"/>
<line x1="80" y1="150" x2="740" y2="150"/>
<line x1="80" y1="95" x2="740" y2="95"/>
<line x1="80" y1="40" x2="740" y2="40"/>
</g>
<line x1="80" y1="260" x2="740" y2="260" stroke="#9a9da6" stroke-width="1.5"/>
<line x1="80" y1="40" x2="80" y2="260" stroke="#9a9da6" stroke-width="1.5"/>
<g font-size="10" fill="#6b6e76" text-anchor="end">
<text x="72" y="264">0%</text>
<text x="72" y="209">25%</text>
<text x="72" y="154">50%</text>
<text x="72" y="99">75%</text>
<text x="72" y="44">100%</text>
</g>
<g font-size="10" fill="#6b6e76" text-anchor="middle">
<text x="80" y="278">0</text>
<text x="190" y="278">5</text>
<text x="300" y="278">10</text>
<text x="410" y="278">15</text>
<text x="520" y="278">20</text>
<text x="630" y="278">25</text>
<text x="740" y="278">30 步</text>
</g>
<polyline points="80,40 190,51 300,61 410,71 520,80 630,89 740,97" fill="none" stroke="#25262b" stroke-width="2.5"/>
<polyline points="80,40 190,90 300,128 410,158 520,181 630,199 740,213" fill="none" stroke="#6b6e76" stroke-width="2.5"/>
<polyline points="80,40 190,130 300,183 410,215 520,233 630,244 740,251" fill="none" stroke="#9a9da6" stroke-width="2.5" stroke-dasharray="6 4"/>
<circle cx="520" cy="181" r="4" fill="#6b6e76"/>
<text x="508" y="168" font-size="11" fill="#25262b" text-anchor="end" font-weight="600">0.95²⁰ ≈ 36%</text>
<g font-size="11" text-anchor="start">
<text x="748" y="100" fill="#25262b">99%</text>
<text x="748" y="216" fill="#6b6e76">95%</text>
<text x="748" y="254" fill="#9a9da6">90%</text>
</g>
<text x="80" y="312" font-size="10" fill="#6b6e76">右侧标注为单步正确率。步数越长的流程，对单步错误越不宽容。</text>
</svg>
<figcaption>图 1：错误的复利效应。这条曲线解释了为什么「模型已经很强了」和「Agent 还是不可靠」可以同时成立。</figcaption>
</figure>

这条曲线给出两条改进路径：**提高单步正确率**（换更强的模型、优化提示词），以及**截断错误的传播**（校验、验证、兜底，让错误在变成第 N 步的输入之前被拦下来）。前者是模型厂商的战场，天花板不由你决定；后者是应用开发者的战场，也是这篇文章的主线——因为它意味着一个重要的心态转变：

**不要问「怎么让模型不出错」，要问「模型出错的时候，系统如何保证结果仍然可靠」。**

## 二、幻觉为什么无法根除

想拦住幻觉，得先承认一个不舒服的结论：幻觉不是等着被修复的 bug，而是当前训练范式下的统计必然。

OpenAI 在 2025 年的论文[《Why Language Models Hallucinate》](https://arxiv.org/abs/2509.04664)（Kalai、Nachum、Vempala、Zhang，[官方博客解读](https://openai.com/index/why-language-models-hallucinate/)，期刊版本发表于 [Nature](https://www.nature.com/articles/s41586-026-10549-w)）把成因拆成了两层：

**第一层来自预训练的统计结构。** 生成正确文本比判别文本对错更难，模型的生成错误率天然有一个由判别难度决定的下界。论文给出一个直观的推论：训练语料里**只出现过一次**的事实（singleton），模型在这类问题上的幻觉率不会低于它们的占比——比如某人的生日在全网只被提过一次，模型就几乎必然在「猜」。这类知识的长尾永远存在，扩大模型也只是移动分界线，不能消除它。

**第二层来自后训练与评测的激励设计，这层更致命。** 主流评测几乎都用 0-1 打分：答对得分，答错和「不知道」同样得零分。在这套规则下，一个诚实表达不确定性的模型，得分永远不会超过一个**在不确定时总是硬猜**的模型。论文对流行榜单做了元分析，确认绝大多数评测都在奖励猜测。换句话说，我们用「考试技巧」训练了一代模型：不会做也要蒙一个，蒙对了有分，空着一定没分。模型学会自信地编造，是因为我们一直在给编造发奖金。

这个结论对工程师的意义非常具体：**幻觉率可以被压低，但不能被压到零**。所以任何 Agent 系统的设计前提都应该是「任何一步的输出都可能是错的」，而不是「换个更强的模型就好了」。

### Agent 把幻觉放大成了三种新形态

在单轮问答里，幻觉是一句错话；在 Agent 里，幻觉会长出手脚：

1. **状态幻觉**——声称做过没做的事。「我已经把配置文件更新好了」，但工具调用从未发生，或者失败了而它无视了报错。这是生产环境里最阴险的一类，因为下游的一切决策都建立在这个虚构的状态上。
2. **工具幻觉**——编造不存在的工具、参数或返回结果。模型按训练语料里「工具调用长什么样」的印象，捏造一个看起来合理的 API 名字和一份看起来合理的返回值。
3. **传染性幻觉**——第 3 步编造的「事实」进入上下文，到第 10 步时已经和真实检索结果混在一起、无法区分了。上下文没有标注可信度的机制，凡是写进去的都会被后续推理当作前提。这正是第一节那条复利曲线在幻觉问题上的具体表现。

治理时还有一个实用的细分框架（见 [Zylos 的 2026 年综述](https://zylos.ai/research/2026-01-27-llm-hallucination-detection-mitigation)与 [Future AGI 的架构分析](https://futureagi.com/blog/llm-hallucination-deep-dive-2026/)）：把幻觉分成**事实幻觉**（陈述与世界不符）、**接地幻觉**（陈述与给定的上下文材料不符）、**引用幻觉**（来源是编的）和**推理幻觉**（前提都对，推导过程错）。四类的检测手段和修复手段各不相同，成熟团队的做法不是套一个万能方案，而是按类施治——这也是下一节清单的组织逻辑。

## 三、防止胡编乱造：让说谎变得困难且无用

压幻觉没有银弹，有的是一叠互相补位的工程手段。按投入产出比排序：

### 1. 能查证的，不许背诵

幻觉最集中的场景是让模型凭参数化记忆回答事实问题。第一原则就是把「回忆」改成「查找」：检索增强（RAG）、工具优先——模型的职责从「知道答案」收缩为「会找答案、会转述答案」。实践中这意味着在提示词里明确立法：*凡是可以通过检索或工具调用获得的信息，禁止凭记忆作答*。能查到的事实，幻觉率会断崖式下降；查不到的，进入第 4 条的「不知道」通道。

### 2. 让每句话都可对账

要求关键结论必须携带引用，而且引用要**机器可验证**：URL 真的能解析、DOI 真的存在、引用的知识库片段 ID 真的能关联回原文。再对「结论—所引原文」做抽样的蕴含检查（原文是否真的支持这句话），防止模型引一篇真实存在的文献、却让它说了没说过的话。引用的价值不在装点门面，而在把「验证一句话」的成本从人工审读降为一次自动化查询。

### 3. 收窄输出空间

自由文本是幻觉的温床，结构是幻觉的枷锁。所有进入下游程序的输出一律走结构化通道：JSON Schema 约束、字段枚举、类型校验。动作空间同理——Agent 能执行的操作应该被显式建模成带类型契约的动作集合，而不是「模型说什么就执行什么」。模型编造一个不存在的动作或参数时，schema 校验会在执行前把它挡下来，把一次潜在事故降级成一次可重试的格式错误。

### 4. 给「不知道」留一个合法出口

第二节说过，模型胡编是因为「不知道」从来不得分。工程上要反过来设计：在输出结构里显式提供弃权选项（`"confidence": "low"`、`"answer": "unknown"`），提示词里明确「说不知道优于编造」，低置信度的输出自动改道——转检索、转更强的模型、或者转人工。你的内部评测也要同步改规则：**答错扣的分要比弃权多**，否则你在自己的评测集上复刻了整个行业犯过的错误。

### 5. 独立的验证层

生成者不能自己给自己批卷子。验证要交给一个**拿全新上下文**的独立环节：

- **事实核查型**：Chain-of-Verification 的思路——从产出中抽取原子声明，逐条独立验证，再汇总修订。
- **一致性型**：同一问题采样多次，答案不一致本身就是幻觉的强信号（self-consistency）。
- **专职裁判型**：用一个只做判定、不做创作的验证模型，把每条陈述分类为「已证实 / 部分证实 / 无法证实」，无法证实的不许进入最终输出。
- **前沿信号型**：2026 年的研究开始直接从模型内部找信号——如 CLAP（在模型自身激活值上训练轻量分类器，实时标记疑似幻觉）和 PCC（联合建模概率确定性与推理一致性来估计事实置信度）。这类方法还在从论文走向工程，但方向清晰：幻觉在模型内部是有迹可循的。

### 6. 幻觉与副作用之间必须有防火墙

这是最容易被忽略、也最重要的一条：**幻觉本身不可怕，幻觉直接驱动副作用才可怕**。模型在草稿里编一个 API 无伤大雅；这个编造的调用不经校验直接打到生产数据库才是事故。所以在「模型输出」和「真实世界」之间必须有一道不信任模型的硬边界：schema 校验、参数白名单、权限检查、高危操作 dry-run 预览。这道边界的存在，让前五条手段的任何漏网之鱼都不至于直接变成损失——它也是第六节整个兜底体系的地基。

## 四、多智能体：内讧与甩锅的解剖学

把幻觉压住之后，很多团队的下一步是上多智能体：规划者、执行者、评审者各司其职，像一个高效团队。直觉很美好，数据很残酷。

Berkeley 的研究者在[《Why Do Multi-Agent LLM Systems Fail?》](https://arxiv.org/abs/2503.13657)中，对包括 ChatDev、MetaGPT 在内的 7 个主流开源多智能体框架做了系统分析：**整体任务失败率在 41% 到 86.7% 之间**。他们让专家标注了 150 多条完整执行轨迹（标注者间一致性 κ=0.88，后续扩展到 1600+ 条），归纳出一套失败分类学 **MAST**（Multi-Agent System Failure Taxonomy）：3 大类、14 种失败模式。

<figure class="diagram">
<svg viewBox="0 0 800 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MAST 失败分类图：三栏分别是规范与系统设计问题占 41.8%、智能体间失调占 36.9%、验证与终止问题占 21.3%，每栏下方列出具体失败模式及其占比，条形长度与占比成正比">
<rect x="0" y="0" width="800" height="420" fill="#ffffff"/>
<text x="24" y="30" font-size="12" fill="#25262b" font-weight="600">MAST：多智能体系统的 14 种失败模式（占全部失败案例的比例）</text>
<g>
<rect x="24" y="48" width="240" height="34" rx="8" fill="#25262b"/>
<text x="36" y="70" font-size="11.5" fill="#ffffff" font-weight="600">① 规范与系统设计 · 41.8%</text>
<rect x="280" y="48" width="240" height="34" rx="8" fill="#6b6e76"/>
<text x="292" y="70" font-size="11.5" fill="#ffffff" font-weight="600">② 智能体间失调 · 36.9%</text>
<rect x="536" y="48" width="240" height="34" rx="8" fill="#9a9da6"/>
<text x="548" y="70" font-size="11.5" fill="#ffffff" font-weight="600">③ 验证与终止 · 21.3%</text>
</g>
<g font-size="11" fill="#25262b">
<text x="24" y="112">1.1 违反任务规范 · 11.8%</text>
<rect x="24" y="120" width="94" height="9" rx="4.5" fill="#6b6e76"/>
<text x="24" y="156">1.2 违反角色规范 · 1.5%</text>
<rect x="24" y="164" width="12" height="9" rx="4.5" fill="#c4c6cd"/>
<text x="24" y="200">1.3 步骤重复 · 15.7%</text>
<rect x="24" y="208" width="126" height="9" rx="4.5" fill="#25262b"/>
<text x="24" y="244">1.4 对话历史丢失 · 2.8%</text>
<rect x="24" y="252" width="22" height="9" rx="4.5" fill="#c4c6cd"/>
<text x="24" y="288">1.5 不感知终止条件 · 12.4%</text>
<rect x="24" y="296" width="99" height="9" rx="4.5" fill="#6b6e76"/>
</g>
<g font-size="11" fill="#25262b">
<text x="280" y="112">2.1 对话被莫名重置 · 2.2%</text>
<rect x="280" y="120" width="18" height="9" rx="4.5" fill="#c4c6cd"/>
<text x="280" y="156">2.2 不澄清、靠假设推进 · 6.8%</text>
<rect x="280" y="164" width="54" height="9" rx="4.5" fill="#9a9da6"/>
<text x="280" y="200">2.3 任务偏航 · 7.4%</text>
<rect x="280" y="208" width="59" height="9" rx="4.5" fill="#9a9da6"/>
<text x="280" y="244">2.4 信息隐瞒 · 0.9%</text>
<rect x="280" y="252" width="7" height="9" rx="3.5" fill="#c4c6cd"/>
<text x="280" y="288">2.5 无视同伴的输入 · 1.9%</text>
<rect x="280" y="296" width="15" height="9" rx="4.5" fill="#c4c6cd"/>
<text x="280" y="332">2.6 言行不一 · 13.2%</text>
<rect x="280" y="340" width="106" height="9" rx="4.5" fill="#25262b"/>
</g>
<g font-size="11" fill="#25262b">
<text x="536" y="112">3.1 过早终止 · 6.2%</text>
<rect x="536" y="120" width="50" height="9" rx="4.5" fill="#9a9da6"/>
<text x="536" y="156">3.2 验证缺失或不完整 · 8.2%</text>
<rect x="536" y="164" width="66" height="9" rx="4.5" fill="#9a9da6"/>
<text x="536" y="200">3.3 验证做了但做错 · 9.1%</text>
<rect x="536" y="208" width="73" height="9" rx="4.5" fill="#6b6e76"/>
</g>
<text x="24" y="392" font-size="10" fill="#6b6e76">数据：MAST（arXiv 2503.13657），基于对 7 个开源多智能体框架 150+ 条执行轨迹的专家标注；这些框架的整体任务失败率为 41%–86.7%。</text>
</svg>
<figcaption>图 2：MAST 失败分类学。三大类失败没有一类的主因是「模型不够聪明」——它们更像组织设计的失败。</figcaption>
</figure>

### 「打架」和「甩锅」在数据里长什么样

用户直觉里的「互相打架」「互相甩锅」，在 MAST 里都能找到精确的对应：

**打架：智能体间失调（36.9%）。** 最典型的是 **2.6 言行不一**（13.2%，全部 14 种模式中排第二）——一个 agent 在推理里说要做 A，实际执行的却是 B，队友按它「说的」继续协作，结果建立在从未发生的动作上。其次是 **2.2 不澄清、靠假设推进**（6.8%）——遇到模糊指令不去问，而是各自脑补一个解释往下走，两个 agent 对同一句话的脑补不同，产出自然互相冲突。论文里有个经典案例：一个负责查电话号码的 agent 明明已经拿到了正确号码，却没有传给写代码的队友，队友只好自己编了一个假号码写进去——**信息隐瞒（2.4）和幻觉在协作中是互相喂养的**。

**甩锅：验证与终止问题（21.3%）。** 这一类的本质是**责任的结构性稀释**。每个 agent 都以为验证是别人的事：执行者以为评审者会把关，评审者只做表面检查——论文里 ChatDev 生成的国际象棋程序，评审 agent 只确认了「代码能编译」，从没确认过「棋规是对的」，于是一个能跑但完全不会下棋的程序通过了验收（3.2 验证不完整）。更糟的是 3.3：验证做了，但验证本身是错的（9.1%）。这三种模式加起来，意味着**超过五分之一的失败发生在「本该有人兜底、但没人真正兜底」的环节**——这就是甩锅的工程学定义。

**越权：违反角色规范（1.2）。** 占比不高但极具代表性：ChatDev 里的 CPO agent 会绕过 CEO agent 直接单方面终止对话——你给 agent 设计的组织章程，模型并不天然遵守。

MAST 团队还有一个发人深省的观察：这些失败模式和研究人类组织的**高可靠性组织理论**（HRO）高度对应——言行不一、信息隐瞒、验收走过场，都是人类团队塌方的经典剧本。**多智能体系统的失败，本质上是组织设计的失败，只是这一次组织成员是模型。** 好消息是结构性干预有真实收益：论文中仅靠改进提示词和角色规范就让 ChatDev 的任务成功率提升 9.4%，把验证器从「检查能不能编译」升级为「检查符不符合需求」又带来 15.6% 的提升。坏消息是：即便如此，失败率依然高得不适合生产——结构问题需要结构解法，这正是下一节。

## 五、防内讧的架构处方

关于多智能体该怎么建，2025 年出现过一场著名的隔空对话：Cognition（Devin 的开发商）发表[《Don't Build Multi-Agents》](https://cognition.com/blog/dont-build-multi-agents)，Anthropic 几乎同期发表[《How we built our multi-agent research system》](https://www.anthropic.com/engineering/multi-agent-research-system)。标题针锋相对，结论却出奇一致。

### Cognition：冲突的根源是「各拿半份剧本」

Cognition 的论证从一个具体失败开始：让两个并行子 agent 分别做 Flappy Bird 的背景和小鸟，一个做出了超级马里奥风格的背景，另一个做的小鸟和游戏美术完全不搭——**谁都没错，但拼不到一起**。由此提炼出两条原则：

1. **共享上下文，而且要共享完整的执行轨迹**，不是各发一段任务简介。
2. **每个动作都携带隐含决策**。两个 agent 看不见彼此的动作，就会基于冲突的隐含假设各自为政，冲突的决策必然导致糟糕的结果。

他们的处方是：大多数场景下，**单线程的线性 agent** 是更好的架构——所有决策都发生在同一条上下文里，天然不会自相矛盾。上下文长度不够时，不是拆成多个 agent，而是引入一个专门的**压缩模型**把历史轨迹蒸馏成关键决策与事件。在后续的实践复盘[《Multi-Agents: What's Actually Working》](https://cognition.com/blog/multi-agents-working)里，他们把可行的边界划得更精确：**子 agent 可以并行地贡献「智能」（调研、分析、建议），但「写」必须保持单线程**。

### Anthropic：并行有真实收益，但要付对价钱

Anthropic 的多智能体研究系统（支撑 Claude 的 Research 功能）用的是**编排者—工作者**模式：主 agent 分解问题，并行派发子 agent 检索，最后汇总。在内部研究评测上，这套系统比单 agent 的 Claude Opus 4 **高出 90.2%**——对「广度可分解」的检索任务，并行是真金白银的提升。

但他们同样交了学费。早期版本会**为一个简单问题一口气生成 50 个子 agent**、为不存在的信息无休止地检索、多个子 agent 重复做同一件事。修复手段全是「组织管理」味道的：

- **任务书要完整**：派发子任务必须包含目标、输出格式、可用工具、明确边界，缺一样 agent 就会自由发挥。
- **投入要有章程**：在提示词里显式写明力度规则——简单事实查询 1 个 agent、3–10 次工具调用；复杂研究才允许多 agent 并行——否则模型对「该花多少力气」的判断极不稳定。
- **代价要算清**：agent 消耗的 token 约是普通对话的 4 倍，多智能体系统约是 **15 倍**。只有任务价值撑得起这个倍数，多智能体才成立。
- **边界要认清**：需要所有 agent 共享同一上下文、或步骤间强依赖的任务（典型如大部分编码工作），多智能体反而更差。

### 两家的共识，合成一张处方

两篇文章加上 LangChain 的[综合分析](https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems)，共识非常清楚：多智能体的核心难题不是「怎么调度」，而是**上下文工程**——让每个决策者在决策时看到它需要的全部事实。落到架构上是五条：

1. **读可以并行，写必须单线程。** 检索、分析、评审这类只读工作可以扇出；一切产生副作用或产出物的工作收敛到唯一的写者。
2. **交接用任务书，不用聊天记录接力。** 结构化的目标、输出格式、工具、边界、预算；接收方不应该需要「猜」上游的意图。
3. **每个产物有唯一 owner。** 不设两个权限对等的 agent 负责同一件事——对称双头是冲突的温床，也是甩锅的前提。
4. **评审者拿全新上下文，并以证伪为目标。** 和生成者共享上下文的评审者会继承它的全部偏见；提示词要求「找出问题」而不是「确认没问题」，否则你得到的是礼貌的橡皮图章——这直接对应 MAST 里 21.3% 的验证类失败。
5. **终止条件显式化。** 每个 agent、每个循环都有明确的完成判据和预算上限，「不知道何时该停」（MAST 1.5，12.4%）是完全可以用结构消灭的失败。

<figure class="diagram">
<svg viewBox="0 0 800 370" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="推荐的多智能体架构图：顶部是编排者，向下派发带任务书的只读检索者 A、B、C 并行工作，它们的完整轨迹写入共享上下文；共享上下文流向唯一写者，写者的产出交给持有全新上下文、以证伪为目标的评审者，评审意见回流给写者">
<rect x="0" y="0" width="800" height="370" fill="#ffffff"/>
<rect x="250" y="24" width="300" height="56" rx="10" fill="#25262b"/>
<text x="400" y="48" font-size="12" fill="#ffffff" text-anchor="middle" font-weight="600">编排者 Orchestrator</text>
<text x="400" y="66" font-size="10" fill="#c4c6cd" text-anchor="middle">任务书：目标 / 输出格式 / 工具 / 边界 / 预算</text>
<g stroke="#9a9da6" stroke-width="1.5" fill="none">
<path d="M330 80 L140 128" marker-end="url(#arel-a)"/>
<path d="M400 80 L400 128" marker-end="url(#arel-a)"/>
<path d="M470 80 L660 128" marker-end="url(#arel-a)"/>
</g>
<defs>
<marker id="arel-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
<marker id="arel-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<g>
<rect x="60" y="132" width="160" height="46" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="140" y="152" font-size="11.5" fill="#25262b" text-anchor="middle" font-weight="600">检索者 A</text>
<text x="140" y="168" font-size="10" fill="#6b6e76" text-anchor="middle">只读 · 并行</text>
<rect x="320" y="132" width="160" height="46" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="400" y="152" font-size="11.5" fill="#25262b" text-anchor="middle" font-weight="600">检索者 B</text>
<text x="400" y="168" font-size="10" fill="#6b6e76" text-anchor="middle">只读 · 并行</text>
<rect x="580" y="132" width="160" height="46" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="660" y="152" font-size="11.5" fill="#25262b" text-anchor="middle" font-weight="600">检索者 C</text>
<text x="660" y="168" font-size="10" fill="#6b6e76" text-anchor="middle">只读 · 并行</text>
</g>
<g stroke="#9a9da6" stroke-width="1.5" fill="none">
<path d="M140 178 L140 208" marker-end="url(#arel-a)"/>
<path d="M400 178 L400 208" marker-end="url(#arel-a)"/>
<path d="M660 178 L660 208" marker-end="url(#arel-a)"/>
</g>
<rect x="60" y="212" width="680" height="34" rx="10" fill="#f2f3f5" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="6 4"/>
<text x="400" y="234" font-size="11" fill="#25262b" text-anchor="middle">共享上下文：完整执行轨迹与全部发现（不是摘要接力）</text>
<path d="M270 246 L270 282" stroke="#25262b" stroke-width="1.8" fill="none" marker-end="url(#arel-b)"/>
<g>
<rect x="140" y="286" width="260" height="56" rx="10" fill="#25262b"/>
<text x="270" y="310" font-size="12" fill="#ffffff" text-anchor="middle" font-weight="600">唯一写者</text>
<text x="270" y="328" font-size="10" fill="#c4c6cd" text-anchor="middle">一切写操作与最终产出，单线程执行</text>
<rect x="450" y="286" width="290" height="56" rx="10" fill="#ffffff" stroke="#25262b" stroke-width="1.8"/>
<text x="595" y="310" font-size="12" fill="#25262b" text-anchor="middle" font-weight="600">评审者</text>
<text x="595" y="328" font-size="10" fill="#6b6e76" text-anchor="middle">全新上下文 · 以证伪为目标 · 有权打回</text>
</g>
<path d="M400 306 L446 306" stroke="#25262b" stroke-width="1.8" fill="none" marker-end="url(#arel-b)"/>
<path d="M450 326 L404 326" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#arel-a)" stroke-dasharray="5 4"/>
</svg>
<figcaption>图 3：一种把两家共识拼起来的架构。并行只发生在只读侧；写者只有一个；评审者不与任何人共享上下文。</figcaption>
</figure>

## 六、兜底工程学：为失败设计，而不是祈祷成功

前面所有手段都在降低失败概率，但概率永远不为零。兜底（fallback）回答的是另一个问题：**失败发生的那一刻，系统怎么办？** 成熟的兜底不是一个 try-catch，而是一套分层体系（业界的系统化整理可参考 [Galileo 的护栏框架](https://galileo.ai/blog/ai-agent-guardrails-framework)与[生产环境故障模式分析](https://odsc.medium.com/the-3-loops-that-break-ai-agents-in-production-fcfda14a7662)）。

<figure class="diagram">
<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="兜底体系图：左侧自上而下是输入护栏、过程护栏、输出护栏、副作用护栏四层，请求逐层通过；右侧是失败时的降级阶梯，从有限重试、熔断、换策略换模型、模板或缓存回复，到最终转人工，逐级下降">
<rect x="0" y="0" width="800" height="400" fill="#ffffff"/>
<text x="48" y="34" font-size="12" fill="#25262b" font-weight="600">四层护栏（每个请求都要过）</text>
<text x="470" y="34" font-size="12" fill="#25262b" font-weight="600">降级阶梯（任何一层失败时走）</text>
<defs>
<marker id="afb-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
<marker id="afb-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<g>
<rect x="48" y="52" width="380" height="58" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="76" font-size="11.5" fill="#25262b" font-weight="600">① 输入护栏</text>
<text x="64" y="94" font-size="10.5" fill="#6b6e76">注入检测 · 越权请求过滤 · 输入格式校验</text>
<path d="M238 110 L238 126" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#afb-a)"/>
<rect x="48" y="130" width="380" height="58" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="154" font-size="11.5" fill="#25262b" font-weight="600">② 过程护栏</text>
<text x="64" y="172" font-size="10.5" fill="#6b6e76">轮次 / token / 工具调用预算 · 循环检测 · 工具白名单</text>
<path d="M238 188 L238 204" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#afb-a)"/>
<rect x="48" y="208" width="380" height="58" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="64" y="232" font-size="11.5" fill="#25262b" font-weight="600">③ 输出护栏</text>
<text x="64" y="250" font-size="10.5" fill="#6b6e76">Schema 校验 · 引用对账 · 置信度阈值 · 策略审查</text>
<path d="M238 266 L238 282" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#afb-a)"/>
<rect x="48" y="286" width="380" height="58" rx="10" fill="#25262b"/>
<text x="64" y="310" font-size="11.5" fill="#ffffff" font-weight="600">④ 副作用护栏</text>
<text x="64" y="328" font-size="10.5" fill="#c4c6cd">最小权限 · 幂等设计 · 分风险审批 · 可回滚</text>
</g>
<path d="M432 220 L462 220" stroke="#25262b" stroke-width="1.8" fill="none" marker-end="url(#afb-b)"/>
<text x="447" y="208" font-size="10" fill="#6b6e76" text-anchor="middle">失败</text>
<g>
<rect x="470" y="52" width="282" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="611" y="70" font-size="11" fill="#25262b" text-anchor="middle" font-weight="600">有限重试</text>
<text x="611" y="86" font-size="10" fill="#6b6e76" text-anchor="middle">指数退避 + 抖动 · 有次数上限</text>
<path d="M611 96 L611 110" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#afb-a)"/>
<rect x="470" y="114" width="282" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="611" y="132" font-size="11" fill="#25262b" text-anchor="middle" font-weight="600">熔断</text>
<text x="611" y="148" font-size="10" fill="#6b6e76" text-anchor="middle">闭合 → 打开 → 半开 · 快速失败防雪崩</text>
<path d="M611 158 L611 172" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#afb-a)"/>
<rect x="470" y="176" width="282" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="611" y="194" font-size="11" fill="#25262b" text-anchor="middle" font-weight="600">换策略 / 换模型</text>
<text x="611" y="210" font-size="10" fill="#6b6e76" text-anchor="middle">改道简化流程，而不是原路死磕</text>
<path d="M611 220 L611 234" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#afb-a)"/>
<rect x="470" y="238" width="282" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="611" y="256" font-size="11" fill="#25262b" text-anchor="middle" font-weight="600">模板 / 缓存回复</text>
<text x="611" y="272" font-size="10" fill="#6b6e76" text-anchor="middle">宁可保守，不可编造</text>
<path d="M611 282 L611 296" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#afb-a)"/>
<rect x="470" y="300" width="282" height="44" rx="10" fill="#25262b"/>
<text x="611" y="318" font-size="11" fill="#ffffff" text-anchor="middle" font-weight="600">转人工</text>
<text x="611" y="334" font-size="10" fill="#c4c6cd" text-anchor="middle">带着完整上下文交接，不是甩一句「失败了」</text>
</g>
<text x="48" y="382" font-size="10" fill="#6b6e76">判断兜底是否真的存在的唯一标准：它被触发过，而且触发时系统的表现被观测过。</text>
</svg>
<figcaption>图 4：护栏管「拦」，阶梯管「退」。两边共同保证：模型可以失败，系统不能失控。</figcaption>
</figure>

几个最值得展开的点：

### 1. 预算先行，循环必有出口

生产环境里最常见的 Agent 事故不是答错，而是**停不下来**：无限重试、无限检索、两个 agent 互相客气地把任务踢来踢去。每个循环都必须有硬性预算（最大轮次、最大 token、最大工具调用数），并配循环检测——连续几步的状态签名重复，就强制打断。MAST 里「步骤重复」占 15.7%、高居所有失败模式第一，这类失败用纯结构手段就能消灭大半。

### 2. 熔断与退避：别让重试变成攻击

重试要指数退避加随机抖动；对外部依赖配三态熔断器（闭合—打开—半开），失败率超阈值就快速失败，别再把请求打向一个明显已经挂掉的服务。多 agent 场景还需要**全局熔断**：十个 agent 各自「合理地」重试三次,叠加起来就是一场对下游的重试风暴——共享失败计数、全局跳闸，才能拦住这种系统性共振。

### 3. 降级要有阶梯，第三次失败必须改道

好的降级是逐级换挡：重试 → 换策略或换模型 → 降级到确定性的模板或缓存回复 → 转人工。一条来自一线的经验法则：**同一环节连续失败三次，就不该再重试，而应该改道**——模型在同一个坑里第四次爬出来的概率，不值得再花一倍延迟去赌。转人工不是耻辱出口，而是设计的一部分：交接时要携带完整上下文（做了什么、卡在哪、已确认的事实），否则只是把问题从机器的队列挪进人的队列。

### 4. 人在环上，按风险分级

不是所有动作都值得人工审批——全审等于没有 Agent；全不审等于裸奔。实践中的分法：**只读与低风险动作**自动执行、事后抽查；**中风险**（改数据、发通知）自动执行但可一键回滚；**高风险与不可逆**（删生产数据、动资金、对外发布）强制人工确认。给每类动作显式标注风险等级，这份标注本身就是团队对「什么最不能出错」的一次盘点。

### 5. 可观测性：兜底的兜底

没有观测的兜底只是心理安慰。每一步都要留痕：输入、选了哪个工具、参数、返回、每层护栏的判定结果。上线前跑评测回归，上线后持续跑——Anthropic 的做法值得抄：用一个带明确评分细则的 LLM 裁判（事实准确性、引用准确性、完整性、来源质量、工具效率五个维度）做规模化评估，再用人工抽查捕捉自动化漏掉的边角案例。裁判模型自己也有偏差（偏爱靠前的选项、偏爱更长的回答、偏爱自家模型的文风），所以裁判的结论同样需要抽样校准——验证者也要被验证，这个套娃在工程上是有限的：终点是人。

## 七、检索补充：五个容易被低估的坑

除了用户点名的三大问题，检索过程中有五个话题在 2025–2026 年的工程实践中反复出现，值得单独记录。

### 1. Context rot：上下文不是免费的内存

直觉上，把所有信息塞进上下文窗口总没坏处——模型自己会挑重要的看。Chroma 的[技术报告](https://research.trychroma.com/context-rot)用 18 个主流模型证明了相反的结论：**随着输入变长，模型性能会显著且不均匀地退化**，即使任务本身很简单。上下文是一种会「腐烂」的资源：塞得越满,模型对其中任何一条信息的利用率越低。这解释了为什么 Anthropic 和 Cognition 都把「上下文工程」列为核心学科——决定**什么进上下文、什么被压缩、什么被丢弃**,和决定数据库 schema 一样,是需要显式设计的。长任务的正确姿势不是无限堆上下文,而是分层:工作记忆（当前步骤所需）+ 压缩摘要（历史决策）+ 外部存储（随取随查）。

### 2. 提示词注入与「致命三要素」

Agent 安全领域最有用的一个思维工具,是 Simon Willison 提出的[致命三要素](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)（lethal trifecta）:当一个 Agent 同时具备**访问私有数据**、**接触不可信内容**、**对外通信的通道**这三种能力时,数据外泄的条件就凑齐了——攻击者只需在 Agent 会读到的任何地方（网页、邮件、工单、甚至工具返回值）埋一段指令,就可能诱导它把私有数据发出去。

<figure class="diagram">
<svg viewBox="0 0 800 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="致命三要素示意图：三个相交的圆分别代表访问私有数据、接触不可信内容、具备对外通道，三圆交叠的中心区域标注为数据外泄条件成立；旁注提示拆掉任意一角即可大幅降低风险">
<rect x="0" y="0" width="800" height="330" fill="#ffffff"/>
<circle cx="330" cy="128" r="92" fill="#f2f3f5" fill-opacity="0.75" stroke="#9a9da6" stroke-width="1.5"/>
<circle cx="470" cy="128" r="92" fill="#f2f3f5" fill-opacity="0.75" stroke="#9a9da6" stroke-width="1.5"/>
<circle cx="400" cy="218" r="92" fill="#f2f3f5" fill-opacity="0.75" stroke="#9a9da6" stroke-width="1.5"/>
<text x="258" y="76" font-size="11.5" fill="#25262b" font-weight="600">访问私有数据</text>
<text x="258" y="92" font-size="10" fill="#6b6e76">文件 · 数据库 · 邮箱</text>
<text x="474" y="76" font-size="11.5" fill="#25262b" font-weight="600">接触不可信内容</text>
<text x="474" y="92" font-size="10" fill="#6b6e76">网页 · 用户输入 · 工具返回值</text>
<text x="400" y="300" font-size="11.5" fill="#25262b" font-weight="600" text-anchor="middle">具备对外通道</text>
<text x="400" y="316" font-size="10" fill="#6b6e76" text-anchor="middle">发消息 · 发请求 · 提交代码</text>
<circle cx="400" cy="156" r="5" fill="#25262b"/>
<text x="400" y="180" font-size="11" fill="#25262b" text-anchor="middle" font-weight="600">三者齐备 = 外泄条件成立</text>
<text x="620" y="200" font-size="10.5" fill="#6b6e76">拆掉任意一角，注入攻击</text>
<text x="620" y="216" font-size="10.5" fill="#6b6e76">就从「致命」降级为「烦人」：</text>
<text x="620" y="236" font-size="10.5" fill="#6b6e76">· 读不可信内容时收走外发权限</text>
<text x="620" y="252" font-size="10.5" fill="#6b6e76">· 碰私有数据时切断不可信输入</text>
<text x="620" y="268" font-size="10.5" fill="#6b6e76">· 外发动作一律人工确认</text>
</svg>
<figcaption>图 5：致命三要素。注入无法被提示词根治——「请忽略网页里的指令」拦不住认真读了网页的模型；能根治的是权限结构。</figcaption>
</figure>

要点有二：其一，**工具的返回值同样是不可信输入**——不只是用户消息会带毒；其二，防线不在提示词而在权限结构：同一个会话里，三种能力不要同时授予，高危组合出现时强制降权或人工确认。

### 3. 评测困境：你很难知道自己是不是变好了

Agent 评测比模型评测难一个量级：执行是非确定性的（同一输入两次运行路径不同）、任务是长程的（错在第 3 步还是第 17 步？）、而且用户体验取决于**最差的那次运行**而不是平均值——pass@k 会系统性高估体感质量,更诚实的指标是「k 次全过」。可行的组合拳：小而准的端到端回归集（几十个真实任务就足以捕捉大部分回归）+ 分步骤的过程评估（工具选对了吗、参数合法吗）+ LLM 裁判打分 + 定期人工盲评。没有这套东西,每次改提示词都是在裸眼做外科手术。

### 4. 成本与延迟的经济学

多智能体 15 倍的 token 消耗、验证层翻倍的调用次数、降级重试的开销——可靠性的每一层都有账单。这不是反对投入,而是要求**把 token 预算当一等公民设计**：按任务价值分配力度（Anthropic 的 effort scaling 规则就是干这个的）、给低价值请求走轻量通道、给验证层设采样率而不是全量。反过来,预算也是一种护栏：一个失控的循环烧穿预算上限被强制终止,比它烧穿信用卡好得多。

### 5. 记忆污染：幻觉的持久化

给 Agent 加长期记忆是趋势,但记忆打开了一个新的失败通道：**一次幻觉被写进记忆,就从一次性错误升级成了永久性「事实」**,之后的每次会话都会引用它,而且模型对来自自己记忆的内容几乎不设防。对策是把记忆写入当作生产数据库变更来对待：写入前过验证（尤其是事实类条目）、每条记忆携带来源与时间戳、支持按来源批量撤销、定期对高频引用的记忆做抽样核查。检索到的记忆进入上下文时,也应该标注「这是历史记录,可能过时」,而不是与当前事实无差别混排。

## 八、落地清单：十二条

把全文压缩成可以贴在墙上的清单：

1. 按「每步 5% 错误率」设计流程：能 10 步做完的不拆成 30 步,每个关键节点设检查点。
2. 能检索、能调工具得到的信息,禁止模型凭记忆回答。
3. 关键事实必须携带机器可验证的引用,并对「结论—原文」做抽样蕴含检查。
4. 输出一律结构化,动作空间显式建模;schema 校验挡在一切副作用之前。
5. 给「不知道」一个合法出口,并在内部评测中让弃权的得分高于答错。
6. 验证者与生成者分离:全新上下文,以证伪为目标,有权打回。
7. 读可以并行,写必须单线程;每个产物有唯一 owner,不设对称双头。
8. 交接用结构化任务书（目标、输出格式、工具、边界、预算）,不用聊天记录接力。
9. 一切循环有预算,一切外呼有熔断,一切重试有上限——第三次失败必须改道。
10. 副作用动作按风险分级:最小权限、幂等、可回滚;不可逆操作强制人工确认;致命三要素不同时授予。
11. 全链路留痕,上线前后持续跑评测回归;LLM 裁判要有评分细则,并定期用人工校准裁判本身。
12. 记忆与知识库的写入,当作生产数据库变更对待:验证、溯源、可撤销。

## 结语：可靠性是系统的属性，不是模型的属性

回看这三个问题,会发现它们有同一个底色。幻觉,是因为训练激励让模型学会了「不会也要蒙」;内讧和甩锅,是因为我们把一群概率性的个体放进了没有章程的组织;兜底缺失,是因为 demo 文化默认了「成功路径」就是全部路径。三者的解法也有同一个方向:**不改变个体的不可靠,而用结构保证整体的可靠。**

这件事人类自己干了几百年。单个会计会算错账,复式记账让错误无处藏身;单个飞行员会遗忘步骤,检查单让遗忘不再致命;单个程序员会写出 bug,代码评审和 CI 让 bug 大概率活不到生产。Agent 工程正在快速重新发明这些制度——任务书、唯一写者、独立评审、分级审批、熔断降级——只不过这一次,流程约束的对象从人换成了模型。

所以,面对「模型又胡编了」的沮丧时刻,值得记住的是:幻觉治不好,但系统能兜住;甩锅避不开,但结构能问责;失败一定会发生,而兜底的意义,是让失败变得便宜。模型的不可靠是常数,系统的可靠是变量——把变量做好,才是 Agent 工程师真正的护城河。

## 参考资料

1. [Why Do Multi-Agent LLM Systems Fail?（MAST，arXiv 2503.13657）](https://arxiv.org/abs/2503.13657)
2. [Why Language Models Hallucinate（OpenAI，arXiv 2509.04664）](https://arxiv.org/abs/2509.04664)
3. [Why language models hallucinate — OpenAI 官方博客](https://openai.com/index/why-language-models-hallucinate/)
4. [Evaluating large language models for accuracy incentivizes hallucinations — Nature](https://www.nature.com/articles/s41586-026-10549-w)
5. [How we built our multi-agent research system — Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)
6. [Building Effective Agents — Anthropic](https://www.anthropic.com/engineering/building-effective-agents)
7. [Don't Build Multi-Agents — Cognition](https://cognition.com/blog/dont-build-multi-agents)
8. [Multi-Agents: What's Actually Working — Cognition](https://cognition.com/blog/multi-agents-working)
9. [How and when to build multi-agent systems — LangChain](https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems)
10. [Context Rot: How Increasing Input Tokens Impacts LLM Performance — Chroma Research](https://research.trychroma.com/context-rot)
11. [The Lethal Trifecta for AI agents — Simon Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
12. [LLM Hallucination Detection and Mitigation: State of the Art in 2026 — Zylos Research](https://zylos.ai/research/2026-01-27-llm-hallucination-detection-mitigation)
13. [LLM Hallucination: A 2026 Architectural Deep Dive — Future AGI](https://futureagi.com/blog/llm-hallucination-deep-dive-2026/)
14. [Essential Framework for AI Agent Guardrails — Galileo](https://galileo.ai/blog/ai-agent-guardrails-framework)
15. [The 3 Loops That Break AI Agents in Production — ODSC](https://odsc.medium.com/the-3-loops-that-break-ai-agents-in-production-fcfda14a7662)
