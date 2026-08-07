---
title: 从零搭建个人智能体（一）
date: 2026-08-06T10:00:00
category: code
tags: [Agent, RAG, 混合检索, SQLite, FTS5, Rerank, Electron, TypeScript]
cover: /images/personal-agent-01-cover.jpg
coverAlt: 一个金属质感的带翼人形悬停在巨大的螺旋建筑漩涡中心，四壁是层层收束的白金巴洛克廊柱，尽头是旋成同心圆的云层与天空
excerpt: 系列第一篇只讲一件事：把一个本地 Markdown 目录变成 Agent 能可靠引用的知识源。从切块与行号的地基、中文全文检索为什么必须自己造，到把检索做成可替换的管道、先立评估基准再谈收益，最后是四步升级的实测阶梯与十个真正踩到的坑——包括一个让 utility 进程静默崩溃到重启死循环的推理层事故。
dek: 检索层的成败不在用了哪个向量库，而在于每一次「我把它改好了」都能被一把尺子证伪。
---

> 这是「从零搭建个人智能体」的第一篇。整个项目是一个 macOS 桌面应用：选一个本地 Markdown 目录当知识库，用自然语言提问，Agent 调用只读工具检索并阅读原文，流式输出**带精确行号、可点击**的引用，全部数据留在本机。
>
> 但这一篇不讲桌面壳、不讲会话、不讲密钥链路，**只讲检索层**——从一堆 `.md` 文件到一条可信答案之间的那段路。因为整个项目里，这一段是唯一一段"做对做错都能跑，但差别决定产品死活"的代码。

## 一、目标不是「做一个 RAG」，而是给 Agent 一件趁手的工具

动手之前必须先把形态定死，否则会不自觉地照着教程里那条经典链路去做：文档 → 切块 → embedding → 向量库 → top-k → 塞进 prompt → 生成。这条链路的问题不是它不 work，而是它把**检索**变成了模型无法参与的**前置步骤**：模型看到的永远是第一次检索的结果，即使那次检索完全跑偏，它也没有第二次机会。

我选的是另一种形态：**检索是 Agent 手里的一件工具，不是它前面的一道工序。**

| 判定要件 | 本项目的实现 |
|---|---|
| 检索是可被模型主动选择调用的**工具** | `search_knowledge` / `read_markdown` / `get_note_outline` / `list_markdown_files` 四件只读工具 |
| 模型**自主决定**查什么、何时查、查几轮 | Agent 循环内自由调用，上限 24 次工具调用 / 12 轮 |
| 能根据结果**迭代改写**查询 | 系统提示里的检索策略 + 循环天然支持 |

这个形态在业界叫 agentic RAG，Anthropic 描述 Claude Code 处理本地语料时用的也是同一套东西（grep + 读文件 + 迭代精化）而不是向量 RAG。定位清楚之后，一个重要结论随之成立：

> **需要升级的从来不是编排层，而是 Agent 手里那件检索工具的内部实现。**

这句话是后面所有架构决策的出发点。它意味着：工具的名字、参数契约、输出格式、引用语义**一个字都不能改**——因为系统提示的行为规则、引用验证的证据集、评估基准的判分逻辑，三者全都依赖这份契约的稳定。可以随便换的东西全都在契约背后。

<figure class="diagram">
<svg viewBox="0 0 840 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="整体架构：本地 Markdown 目录经索引层进入 SQLite 索引库，Agent 通过四件只读工具访问检索管道，管道内部包含词法与向量两路召回、融合、精排四个阶段，输出带行号的命中给模型，模型的引用再经证据集验证">
<defs>
<marker id="pa1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
<marker id="pa1-arrow-dark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<rect x="0" y="0" width="840" height="430" fill="#ffffff"/>
<text x="420" y="28" text-anchor="middle" font-size="14" font-weight="700" fill="#25262b">一次提问穿过的四层：工具契约稳定，契约背后全部可换</text>
<rect x="30" y="60" width="130" height="72" rx="10" fill="#25262b"/>
<text x="95" y="88" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700">本地目录</text>
<text x="95" y="108" text-anchor="middle" font-size="11" fill="#d6d8de">*.md 原文</text>
<text x="95" y="124" text-anchor="middle" font-size="11" fill="#d6d8de">不出本机</text>
<rect x="200" y="60" width="150" height="72" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="275" y="84" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">索引层</text>
<text x="275" y="103" text-anchor="middle" font-size="11" fill="#6b6e76">扫描 · 标题感知切块</text>
<text x="275" y="120" text-anchor="middle" font-size="11" fill="#6b6e76">hash 增量 · watcher</text>
<rect x="390" y="60" width="150" height="72" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="465" y="84" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">SQLite 索引库</text>
<text x="465" y="103" text-anchor="middle" font-size="11" fill="#6b6e76">FTS5 倒排 + 向量表</text>
<text x="465" y="120" text-anchor="middle" font-size="11" fill="#6b6e76">一个目录一份库</text>
<line x1="160" y1="96" x2="196" y2="96" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa1-arrow)"/>
<line x1="350" y1="96" x2="386" y2="96" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa1-arrow)"/>
<rect x="30" y="180" width="200" height="200" rx="10" fill="#f6f6f8" stroke="#e3e4e8" stroke-width="1"/>
<text x="130" y="205" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">Agent 循环</text>
<rect x="48" y="220" width="164" height="30" rx="7" fill="#ffffff" stroke="#9a9da6" stroke-width="1.2"/>
<text x="130" y="240" text-anchor="middle" font-size="11" fill="#25262b">search_knowledge</text>
<rect x="48" y="258" width="164" height="30" rx="7" fill="#ffffff" stroke="#9a9da6" stroke-width="1.2"/>
<text x="130" y="278" text-anchor="middle" font-size="11" fill="#25262b">read_markdown</text>
<rect x="48" y="296" width="164" height="30" rx="7" fill="#ffffff" stroke="#e3e4e8" stroke-width="1.2"/>
<text x="130" y="316" text-anchor="middle" font-size="11" fill="#6b6e76">get_note_outline</text>
<rect x="48" y="334" width="164" height="30" rx="7" fill="#ffffff" stroke="#e3e4e8" stroke-width="1.2"/>
<text x="130" y="354" text-anchor="middle" font-size="11" fill="#6b6e76">list_markdown_files</text>
<rect x="280" y="180" width="380" height="200" rx="10" fill="#ffffff" stroke="#25262b" stroke-width="1.6"/>
<text x="470" y="205" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">检索管道（工具看不见它换了什么）</text>
<rect x="300" y="222" width="120" height="42" rx="8" fill="#25262b"/>
<text x="360" y="240" text-anchor="middle" font-size="11" fill="#ffffff" font-weight="700">词法召回</text>
<text x="360" y="256" text-anchor="middle" font-size="10" fill="#d6d8de">FTS5 · BM25</text>
<rect x="300" y="276" width="120" height="42" rx="8" fill="#6b6e76"/>
<text x="360" y="294" text-anchor="middle" font-size="11" fill="#ffffff" font-weight="700">向量召回</text>
<text x="360" y="310" text-anchor="middle" font-size="10" fill="#e3e4e8">e5-small · 余弦</text>
<rect x="446" y="248" width="88" height="44" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="490" y="270" text-anchor="middle" font-size="11" fill="#25262b" font-weight="700">RRF 融合</text>
<text x="490" y="286" text-anchor="middle" font-size="10" fill="#6b6e76">k = 60</text>
<rect x="556" y="248" width="88" height="44" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="600" y="270" text-anchor="middle" font-size="11" fill="#25262b" font-weight="700">精排</text>
<text x="600" y="286" text-anchor="middle" font-size="10" fill="#6b6e76">cross-encoder</text>
<text x="470" y="345" text-anchor="middle" font-size="11" fill="#6b6e76">每个阶段发一个 trace 事件 → JSONL 落盘</text>
<text x="470" y="364" text-anchor="middle" font-size="11" fill="#6b6e76">按文件限额 · 截断 → 最终 top-N</text>
<line x1="420" y1="243" x2="442" y2="262" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa1-arrow)"/>
<line x1="420" y1="297" x2="442" y2="278" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa1-arrow)"/>
<line x1="534" y1="270" x2="552" y2="270" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa1-arrow)"/>
<line x1="230" y1="235" x2="276" y2="243" stroke="#25262b" stroke-width="1.6" marker-end="url(#pa1-arrow-dark)"/>
<line x1="465" y1="136" x2="465" y2="176" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa1-arrow)"/>
<rect x="690" y="222" width="120" height="98" rx="10" fill="#25262b"/>
<text x="750" y="248" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="700">回答</text>
<text x="750" y="268" text-anchor="middle" font-size="10" fill="#d6d8de">带行号引用</text>
<text x="750" y="285" text-anchor="middle" font-size="10" fill="#d6d8de">证据集验证</text>
<text x="750" y="302" text-anchor="middle" font-size="10" fill="#d6d8de">无据即降级</text>
<line x1="660" y1="270" x2="686" y2="270" stroke="#25262b" stroke-width="1.6" marker-end="url(#pa1-arrow-dark)"/>
<text x="470" y="410" text-anchor="middle" font-size="11" fill="#6b6e76">左边这四个名字一旦公开，就再也不能改；右边整条管道随时可以推倒重来。</text>
</svg>
</figure>

## 二、地基：切块决定了引用能不能落到行

整个检索层里最不起眼、却最不能返工的一层是**切块**。因为它决定了「引用」这件事的分辨率。

我给自己定的验收标准是：回答里的每一条引用都必须是 `相对路径#L起-L迄` 的形式，点击能跳到原文那几行，而且**行号必须真的对**。这个标准往回倒推，切块器就只剩一条铁律：

> **绝不切进行内。行号精确优先于长度上限。**

### 2.1 切块规则

切块器完全确定性，不依赖任何第三方库，规则只有五条：

- 每个标题开启一个 section：从标题行起，到下一个标题的前一行止，**标题行属于自己的 section**；
- 首个标题之前的非空前言单独成块（`headingPath` 为空数组），纯空白前言不产块；
- 相邻标题之间即使没有正文也照样产块——保证标题树完整，不会出现"目录里有、索引里没有"的洞；
- section 超过 2000 字符时二次切分：**只在代码围栏之外的空行边界切**，空行归前块；
- 没有可用空行时退化为行边界硬切；单行仍然超限就保留为超限块。

最后那半句是整段代码里唯一"违反上限"的地方，而它是刻意的：一个 3000 字符的单行（比如一张压缩过的 base64 图或一行超长表格）宁可让这个块超限，也不能把它拦腰截断——一旦切进行内，`startLine..endLine` 与 `content` 就对不上了，引用验证的地基就塌了。

<figure class="diagram">
<svg viewBox="0 0 840 350" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="切块示意：一篇 Markdown 按标题划分为若干 section，超长 section 在空行边界二次切分，每个 chunk 携带标题路径与精确的起止行号，行区间首尾相接无缝隙">
<rect x="0" y="0" width="840" height="350" fill="#ffffff"/>
<text x="420" y="26" text-anchor="middle" font-size="14" font-weight="700" fill="#25262b">标题感知切块：行区间首尾相接，无缝隙、无重叠、不切进行内</text>
<rect x="40" y="52" width="180" height="256" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="130" y="74" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">notes/redis.md</text>
<text x="56" y="100" font-size="11" fill="#25262b" font-family="monospace">L1  # 缓存失效</text>
<text x="56" y="120" font-size="11" fill="#6b6e76" font-family="monospace">L2  前言段落…</text>
<text x="56" y="146" font-size="11" fill="#25262b" font-family="monospace">L8  ## 双删策略</text>
<text x="56" y="166" font-size="11" fill="#6b6e76" font-family="monospace">L9  正文…</text>
<text x="56" y="186" font-size="11" fill="#6b6e76" font-family="monospace">L20 （空行）</text>
<text x="56" y="206" font-size="11" fill="#6b6e76" font-family="monospace">L21 ```bash</text>
<text x="56" y="226" font-size="11" fill="#6b6e76" font-family="monospace">L22 （围栏内空行）</text>
<text x="56" y="246" font-size="11" fill="#6b6e76" font-family="monospace">L26 ```</text>
<text x="56" y="272" font-size="11" fill="#25262b" font-family="monospace">L27 ## 兜底</text>
<text x="56" y="292" font-size="11" fill="#6b6e76" font-family="monospace">L28 正文…</text>
<rect x="290" y="60" width="230" height="66" rx="8" fill="#25262b"/>
<text x="405" y="84" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="700">chunk 1 · L1–L7</text>
<text x="405" y="104" text-anchor="middle" font-size="10.5" fill="#d6d8de">headingPath: [缓存失效]</text>
<text x="405" y="119" text-anchor="middle" font-size="10.5" fill="#d6d8de">标题行属于自己的块</text>
<rect x="290" y="140" width="230" height="66" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="405" y="164" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">chunk 2 · L8–L20</text>
<text x="405" y="184" text-anchor="middle" font-size="10.5" fill="#6b6e76">[缓存失效 &gt; 双删策略]</text>
<text x="405" y="199" text-anchor="middle" font-size="10.5" fill="#6b6e76">在 L20 空行处断开</text>
<rect x="290" y="220" width="230" height="66" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="405" y="244" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">chunk 3 · L21–L26</text>
<text x="405" y="264" text-anchor="middle" font-size="10.5" fill="#6b6e76">同一 headingPath</text>
<text x="405" y="279" text-anchor="middle" font-size="10.5" fill="#6b6e76">围栏内空行不作为切点</text>
<rect x="290" y="300" width="230" height="34" rx="8" fill="#f6f6f8" stroke="#e3e4e8" stroke-width="1"/>
<text x="405" y="322" text-anchor="middle" font-size="11.5" fill="#6b6e76">chunk 4 · L27–L…（兜底）</text>
<rect x="570" y="120" width="230" height="120" rx="10" fill="#ffffff" stroke="#25262b" stroke-width="1.6"/>
<text x="685" y="146" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">这两件事必须成立</text>
<text x="685" y="172" text-anchor="middle" font-size="11" fill="#6b6e76">content ≡ 原文 L起..L迄 切片</text>
<text x="685" y="194" text-anchor="middle" font-size="11" fill="#6b6e76">相邻块首尾相接，不重不漏</text>
<text x="685" y="220" text-anchor="middle" font-size="11" fill="#25262b" font-weight="600">否则引用验证整层作废</text>
</svg>
</figure>

### 2.2 两个刻意的分工

**`content` 存原文切片，`search_text` 存检索副本。** 后面要做的一切索引侧增强（CJK 预处理、文件名词元、标题路径、LLM 生成的定位前缀）全部只写进 `search_text` 这一列，`content` 一字不动。于是"往索引里塞东西提升召回"和"引用展示的原文必须精确"这两个互相打架的诉求被彻底解耦——它们根本不在同一列上。

**切块器不认识文件路径。** 它只接收一段文本，产出 `ChunkDraft`（标题路径 + 行区间 + 原文切片），不含 `relPath`、不算 `contentHash`、不去 `stat` 文件。哈希由入库方对 `content` 补算，mtime 取自同一轮扫描已经拿到的文件元数据。这样切块器是纯函数，可以对着字符串写几十个用例，而不需要造临时目录。

### 2.3 为什么不做语义切块

调研时认真评估过语义切块（用 embedding 相似度找语义边界），结论是**不做**。NAACL 2025 的系统评测（arXiv:2410.13070）给出的是负面证据：计算成本换不来稳定收益。而结构感知切块是当前有证据支持的方向——何况 Markdown 的标题本来就是作者亲手写下的语义边界，不用白不用。

## 三、中文全文检索：FTS5 + CJK unigram 是算出来的，不是选出来的

桌面应用要求零外部依赖：不能起 Elasticsearch，不能连云端向量库。可用的只有 SQLite——而 Electron 的 Node 是定制编译的，既不保证内置 `node:sqlite`，更不保证它静态链接的 SQLite 打开了 `SQLITE_ENABLE_FTS5`（这是个编译期开关，默认关闭）。

这是整个项目开工时**最大的未验证假设**，所以先写了一个探针脚本，在真正的 `utilityProcess` 里逐项验证 15 个能力点（刻意不在主进程里测，因为索引层将来就住在 utility 里，只有同进程类型的结论才对得上号）：

| 项 | 实测 |
|---|---|
| `process.type` | `utility` |
| Electron / 内置 Node | 43.2.0 / 24.18.0 |
| `sqlite_version()` | 3.53.1 |
| `execArgv` | `[]`——Node 24 不再需要 `--experimental-sqlite` |
| `sqlite_compileoption_used('ENABLE_FTS5')` | **1** |
| external content + 三个同步 trigger + `integrity-check` | 通过 |
| `bm25()` 排序 / `snippet()` / `highlight()` | 通过 |
| WAL（并实际写入一笔验证 `-wal` 落盘） | 通过 |

15 项全过。顺带修正了一处差点被记错的结论：`-wal` 文件只在切到 WAL 之后**第一次写入**时才落盘，探针初版只设 PRAGMA 不写数据，看到 `walFileExists: false`，险些被记成"WAL 未生效"。

### 3.1 为什么是 unigram，不是 trigram

SQLite FTS5 自带两个能处理中文的路子：`trigram` tokenizer，或者 `unicode61` + 自己做预处理。选择的分水岭只有一个具体场景：

> **用户查一个两字中文词，比如"引用"。**

trigram 需要至少 3 个字符才能建立 token，两字查询直接失效。而这恰恰是中文检索里最高频的形态。所以方案定为：

- **入库侧**：把 CJK 字符逐字用空格隔开，让 `unicode61` 把每个汉字当成独立 token。这份预处理副本写进 `search_text`，原文不动。
- **查询侧**：把查询词做同样的处理，然后**加双引号包成 phrase**。FTS5 的 phrase 语义要求 token 相邻，恰好还原了"连续多字词"的匹配——两字词因此可以精确命中。

<figure class="diagram">
<svg viewBox="0 0 860 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CJK unigram 的两侧对称处理：入库时把中文逐字加空格写入 search_text 影子列，查询时同样逐字切开并加引号构成 phrase，phrase 的相邻性语义还原了连续多字词的匹配">
<defs>
<marker id="pa2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<rect x="0" y="0" width="860" height="320" fill="#ffffff"/>
<text x="430" y="26" text-anchor="middle" font-size="14" font-weight="700" fill="#25262b">两侧对称：入库怎么切，查询就怎么切</text>
<text x="215" y="58" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">入库侧 · toSearchText</text>
<rect x="60" y="72" width="310" height="40" rx="7" fill="#ffffff" stroke="#e3e4e8" stroke-width="1.4"/>
<text x="215" y="97" text-anchor="middle" font-size="12" fill="#6b6e76" font-family="monospace">SQLite 索引与引用行号</text>
<line x1="215" y1="114" x2="215" y2="140" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2-arrow)"/>
<rect x="60" y="146" width="310" height="40" rx="7" fill="#25262b"/>
<text x="215" y="171" text-anchor="middle" font-size="12" fill="#ffffff" font-family="monospace">SQLite 索 引 与 引 用 行 号</text>
<text x="215" y="208" text-anchor="middle" font-size="11" fill="#6b6e76">英文词保持整词，汉字逐字成 token</text>
<text x="215" y="226" text-anchor="middle" font-size="11" fill="#6b6e76">只进 search_text 影子列，content 不动</text>
<line x1="430" y1="70" x2="430" y2="290" stroke="#e3e4e8" stroke-width="1" stroke-dasharray="4 4"/>
<text x="645" y="58" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">查询侧 · toFtsQuery</text>
<rect x="490" y="72" width="310" height="40" rx="7" fill="#ffffff" stroke="#e3e4e8" stroke-width="1.4"/>
<text x="645" y="97" text-anchor="middle" font-size="12" fill="#6b6e76" font-family="monospace">引用</text>
<line x1="645" y1="114" x2="645" y2="140" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2-arrow)"/>
<rect x="490" y="146" width="310" height="40" rx="7" fill="#25262b"/>
<text x="645" y="171" text-anchor="middle" font-size="12" fill="#ffffff" font-family="monospace">"引 用"</text>
<text x="645" y="208" text-anchor="middle" font-size="11" fill="#6b6e76">phrase 要求 token 相邻 → 两字词精确命中</text>
<text x="645" y="226" text-anchor="middle" font-size="11" fill="#6b6e76">trigram 方案在这里直接失效（需 ≥3 字符）</text>
<rect x="150" y="250" width="560" height="46" rx="8" fill="#f6f6f8" stroke="#e3e4e8" stroke-width="1"/>
<text x="430" y="270" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="600">附带收益：双引号 phrase 内 FTS5 的全部元语法失效</text>
<text x="430" y="288" text-anchor="middle" font-size="11" fill="#6b6e76">* ( ) : ^ - {} AND OR NOT NEAR 一律变成字面量，查询侧注入防护是结构性的</text>
</svg>
</figure>

### 3.2 CJK 判定范围：一个正则改了两次

原计划里的 CJK 判定正则是 `/[぀-ヿ㐀-鿿豈-﫿]/`。逐字符探针跑下来发现两类问题：

1. **第三段范围写错了。** 源文件里那个"豈"是普通表意文字 U+8C48，不是形似的兼容表意文字 U+F900。实际范围因此是 U+8C48–FAFF，把谚文音节、UTF-16 代理区、私用区全部误收；而补充平面汉字（比如 𠮷）能被命中，靠的是"高位代理恰好落在该区间"这种未定义行为。
2. **漏了四类真会出现的字符**：片假名音标扩展、半角片假名、全角英数（Ａ１），以及 `unicode61` 视为词字符的 CJK 记号 `々〆〇`。

最终改成显式列出十几个区段并加 `u` 标志（代理对按码点匹配）。同时**刻意排除谚文**——韩文按词以空格分隔，`unicode61` 原生分词就是对的，做 unigram 反而会破坏韩文检索。

### 3.3 查询构造里两个分流阈值

CJK 没有词间空格，所以"一个查询词"既可能是词（`向量`）也可能是整句（`向量检索原型用的嵌入维度是多少`）。整串做一个 phrase 会要求那几十个字**连续原样出现**——用户按自己的话提问几乎必然落空。所以按长度分流：

```ts
/** CJK 串超过这个 token 数就按「句子」处理（切二字组），否则按「词」处理（整串一个 phrase）。 */
const MAX_PHRASE_TOKENS = 6;

/** phrase 数不超过这个值时用 AND（全都要命中），超过则用 OR（靠 bm25 排序）。 */
const AND_TERM_LIMIT = 3;
```

- **`MAX_PHRASE_TOKENS = 6`**：常见中文术语（"上下文压缩""外部内容模式"）多在 6 字以内。取更小会把术语打散、让精确查询退化成模糊查询；取更大则整句 phrase 的落空区间变宽。超过 6 个 token 就切成相邻**二字组**——二字组保留了"字的先后关系"这层信息（比拆成单字强），又不要求整句连续，命中越多的文档 bm25 分越高。
- **`AND_TERM_LIMIT = 3`**：一律 AND 会让自然语言提问必然归零；一律 OR 又会让"向量 检索"这种明确的两词查询退化。按词数分流：词少 = 用户在敲关键词，AND 保精度；词多 = 用户在用自己的话提问，OR 保召回，排序交给 bm25。

这两个阈值不是拍脑袋定的——它们是被下面第七节那个"评估基准第一次跑就 3/10"的事故逼出来的。

## 四、把检索做成可替换的管道，而不是再包一层工具

做到这里，检索层只有 BM25 词法一路：没有语义召回、没有精排、没有可观测面。要往上加东西了，第一个决策点是：**可插拔点放在哪。**

一个很自然的提议是"把 KnowledgeSearch 封成一个 Tool，解耦、可插拔"。对照代码之后我否掉了它，理由是：解耦这件事已经做了一半，而做了的那一半恰恰是**该保持不动**的那一半。

- `search_knowledge` 本来就是独立工具，带参数契约、片段化输出、证据集语义——这是**模型看到的接口**；
- 工具与索引之间已经有一个窄端口，只声明三个读方法（`search` / `listFilePaths` / `getFileMeta`），FTS5 的存储实现只是它的一个实现者。

业界的做法也一致：LlamaIndex 的可插拔发生在 Retriever 抽象层，Haystack 发生在组件层，没有一家是靠"给模型换一件新工具"来升级检索的。**模型接口稳定、实现分层可换**是共识。

于是裁决是：**插拔点放在端口背后，新增一个检索管道抽象，`IndexStore` 降级为其中一个召回器实现。**

```ts
/** 单路召回器：词法（FTS5/BM25）现在，向量将来 */
interface Retriever {
  readonly id: string;                 // "lexical" | "vector"
  retrieve(query: string, options: RetrieveOptions): Promise<RetrieverHit[]>;
}

/** 精排器：cross-encoder 将来，直通现在 */
interface Reranker {
  readonly id: string;
  rerank(query: string, candidates: FusedCandidate[], topN: number): Promise<FusedCandidate[]>;
}
```

管道的执行顺序是：**多路召回 → 融合 → 精排 → 按文件限额 → 截断**。

### 4.1 一条让每一步都能被证伪的等价保证

这一层重构最容易出的事故是：把管道搭好、跑分变了，但分不清是"新架构带来的"还是"顺手改坏了什么"。所以管道有一条写进文件头注释的完成定义：

> **单召回器 + 直通精排 + 不限额时，输出与直接调 `store.search` 逐字一致。**

为此单路**不走 RRF**（用名次改写分数会破坏等价），融合阶段直通原分与原序；直通精排保序保分，但**事件照发**——`changedOrder: false` 本身就是信息。有了这条保证，"先落接缝、后换实现"的每一步都能用评估基准单独证伪。

### 4.2 融合用 RRF，且不给调

两路召回的分数天然不可比：BM25 没有上界，余弦在 0–1 之间。硬做归一化是给自己挖坑，因为分布随查询漂移。RRF（Reciprocal Rank Fusion，SIGIR 2009）绕开了这个问题——它只用名次，不用原始分：

```
score(d) = Σ_每路  1 / (k + rank_d)
```

`k = 60` 是 Elastic / Azure / Qdrant 的共同默认，原论文证明 `k ∈ [20, 100]` 区间内结果几乎不变。所以它在代码里是个**常量，不是配置项**——能不调的参数就不给调，多一个旋钮就多一份"跑分变了不知道是谁动的"的风险。

| | 词法路名次 | 向量路名次 | RRF 分（k=60） | 融合后 |
|---|---|---|---|---|
| chunk A | 1 | 8 | 1/61 + 1/68 = 0.0311 | **1** |
| chunk B | 3 | 2 | 1/63 + 1/62 = 0.0320 | — |
| chunk C | — | 1 | 1/61 = 0.0164 | 3 |

（表里 B 其实分更高——这正是 RRF 的价值：**两路都排得不错的文档，胜过只有一路排第一的文档**。）

同分时按 `(relPath, startLine)` 兜底排序，因为评估要求重跑逐字一致，排序必须是**全序**。

### 4.3 精排喂什么给模型，比用哪个模型更重要

精排器（cross-encoder）逐条给 `(query, text)` 打分。这里有个容易踩的坑：`text` 该用什么？

最省事的做法是用检索返回的 snippet。但 snippet 是**词法命中选出来的 160 字窗口**——拿它去喂 cross-encoder，等于让精排对着词法检索自己的偏见打分，精排就完全失去意义了。所以精排的配对文本是「标题路径 + chunk 原文」，原文从库里按行区间重新取（取不到才退回 snippet），并且和索引侧送进嵌入模型的 passage 文本**共用同一个组装函数**——索引怎么嵌，查询就怎么比，两边共用一份代码才不会各自漂移。

### 4.4 trace 和接缝是同一套东西

管道的每个阶段都发一个结构化事件：每路召回（查询词、返回条数、耗时、命中列表与分数）、融合（策略、各路输入条数）、精排（候选数、耗时、是否改变了顺序）、最终结果（返回条数、限额、命中列表）。

关键在于**插拔性与可观测性共用同一套接缝**：将来换一个召回器实现，它的 trace 事件自动就有了，不需要另行埋点。运行时这些事件按次写成一行 JSONL 到 `userData/logs/retrieval-trace.jsonl`，超 5MB 轮转，**写失败一律吞掉**——可观测性绝不能反过来弄坏检索本身。

## 五、先有尺子，再谈收益

调研完一圈业界方案后，我把原计划里排在最后的"可观测与评估"提到了**第 0 步**。理由只有一句：

> 没有测试集和 trace，后面每一步的收益声明都**无法证实，也无法证伪**。

这不是洁癖。RAG 这个领域最大的陷阱就是每一项技术单独看都"有道理"，堆上去感觉变好了，但你说不出好了多少、也不知道有没有把别的东西弄坏。

### 5.1 基准怎么造

语料是一个仓库自带的固定知识库，最终 42 个文件 / 170 个 chunk，中英混排，含长文档、深层嵌套、代码块和一份注入样本。题目 55 道，判定口径是「预期来源文件是否进入 top-5」，按考点分类：

| 类别 | 考什么 |
|---|---|
| `exact` | 词面明确命中，检索的下限 |
| `paraphrase` | 同义改述，词面几乎不重合 |
| `multihop` | 答案分散在两篇笔记里，top-5 必须同时召回 |
| `scoped` | 限定目录范围检索 |
| `crosslang` | 中文提问指向英文文档 |
| `negation` | 含否定语义的问法 |
| `refuse` | 知识库里根本没有的话题 |
| `injection` | 正文里藏着"忽略之前的指令" |

### 5.2 闸门题与观察题：一把带棘轮的尺子

55 题分成两档，这是整个评估设计里最关键的一个决定：

- **闸门题 33 道**：纯词法基线就应该全过的题（`exact`、`scoped`、`negation`、`refuse`、`injection`）。**任何一道挂掉就判红。**
- **观察题 22 道**：基线预期就是过不了的题（`paraphrase`、`multihop`、`crosslang`）。只跟踪不判红——它们是后续每一步升级的量尺。

这样一把尺子同时干了两件事：观察题告诉你**涨了多少**，闸门题告诉你**有没有把别的东西弄坏**。RAG 的改动几乎全是"加东西进索引"或"改排序"，这类改动最典型的失败模式不是没效果，而是**换来了新收益，同时悄悄弄丢了老能力**。闸门题就是防这个的棘轮。

## 六、四步升级，逐级验证

有了尺子之后，升级顺序按证据排——**收益大、成本低的先做**，工程面最大的放最后：

| 步骤 | 内容 | 观察题 | 闸门题 |
|---|---|---|---|
| 第 0 步 | 评估基准 + 逐阶段 trace | 12/22 | 33/33 |
| 第 2a 步 | 结构性上下文入索引（文件名词元 + 标题路径） | 14/22 | 33/33 |
| 第 3 步 | 本地精排（bge-reranker-base int8） | **17/22** | 33/33 |
| 第 4 步 | 向量路 + RRF（multilingual-e5-small） | 17/22 | 33/33 |

<figure class="diagram">
<svg viewBox="0 0 820 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="评估阶梯柱状图：观察题通过数从基线 12 提升到结构性上下文 14、本地精排 17、向量混合 17，共 22 题；闸门题在四个配置下始终保持 33 比 33">
<rect x="0" y="0" width="820" height="340" fill="#ffffff"/>
<text x="410" y="26" text-anchor="middle" font-size="14" font-weight="700" fill="#25262b">55 题基准的实测阶梯（top-5 文件级召回）</text>
<g stroke="#e3e4e8" stroke-width="1">
<line x1="90" y1="250" x2="740" y2="250"/>
<line x1="90" y1="205" x2="740" y2="205"/>
<line x1="90" y1="160" x2="740" y2="160"/>
<line x1="90" y1="115" x2="740" y2="115"/>
<line x1="90" y1="70" x2="740" y2="70"/>
</g>
<line x1="90" y1="250" x2="740" y2="250" stroke="#9a9da6" stroke-width="1.5"/>
<line x1="90" y1="60" x2="90" y2="250" stroke="#9a9da6" stroke-width="1.5"/>
<g font-size="10" fill="#6b6e76" text-anchor="end">
<text x="82" y="254">0</text>
<text x="82" y="209">5</text>
<text x="82" y="164">10</text>
<text x="82" y="119">15</text>
<text x="82" y="74">20</text>
</g>
<text x="46" y="150" font-size="11" fill="#6b6e76" text-anchor="middle" transform="rotate(-90 46 150)">观察题通过数（共 22）</text>
<rect x="130" y="142" width="88" height="108" rx="4" fill="#9a9da6"/>
<text x="174" y="134" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">12</text>
<rect x="290" y="124" width="88" height="126" rx="4" fill="#6b6e76"/>
<text x="334" y="116" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">14</text>
<rect x="450" y="97" width="88" height="153" rx="4" fill="#25262b"/>
<text x="494" y="89" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">17</text>
<rect x="610" y="97" width="88" height="153" rx="4" fill="#25262b"/>
<text x="654" y="89" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">17</text>
<g font-size="11" fill="#25262b" text-anchor="middle" font-weight="600">
<text x="174" y="270">BM25 基线</text>
<text x="334" y="270">+ 结构性上下文</text>
<text x="494" y="270">+ 本地精排</text>
<text x="654" y="270">+ 向量 RRF</text>
</g>
<g font-size="10" fill="#6b6e76" text-anchor="middle">
<text x="174" y="288">第 0 步</text>
<text x="334" y="288">第 2a 步</text>
<text x="494" y="288">第 3 步</text>
<text x="654" y="288">第 4 步</text>
</g>
<rect x="130" y="302" width="568" height="26" rx="6" fill="#f6f6f8" stroke="#e3e4e8" stroke-width="1"/>
<text x="414" y="319" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="600">闸门题在每一级都保持 33 / 33 —— 涨的是新能力，没有弄丢老能力</text>
</svg>
</figure>

### 6.1 第 2a 步：零成本的结构性上下文

文件名和标题是作者亲手写下的"这篇讲什么"。把路径拆成词元（`notes/team/incident-postmortem-2026-06-23.md` → `notes team incident postmortem 2026 06 23`）连同标题路径一起拼进 `search_text`，"复盘""0623"这类查询在正文没提及时也能命中。

这是 RAGFlow 的 auto-keyword 与 LlamaIndex TitleExtractor 的**零成本子集**——不花一次 LLM 调用。代价是命中上下文段时 snippet 会露出这些"索引词"，可以接受：它们本来就是真实的路径与标题。

两道同义改述题被这一步救活。

### 6.2 第 2b 步：LLM 上下文增强

这一步综合两条已验证技术：Anthropic 的 **contextual retrieval**（给每个 chunk 一句"它在讲什么、属于什么上下文"的定位说明，官方消融数据显示 contextual BM25 把 top-20 检索失败率降低 49%），以及 RAGFlow / LlamaIndex 的 **auto-question**（为每块生成"它能回答什么问题"，用户问法与生成问法词汇天然接近，是纯词法索引上的"语义桥"）。

工程上的三个决定：

- **一个文件一次 LLM 调用，不是一块一次。** 块共享全文语境，调用数与成本都少一个量级。
- **增强器带签名版本，写进 `files.context_version`。** 改 prompt、改解析逻辑、改 token 预算都必须递增版本号，否则老库不会重增强，新旧上下文混存。签名刻意**不含模型名**——换模型不值得全库重跑（收益边际，成本线性）。
- **按 contentHash 增量。** 文件内容一变，`upsertFile` 就把 `context_version` 清空，后台增强按"签名不匹配"续作，天然增量。

这一步的收益需要真实 key 才能实测，而实测过程炸了三次——见下一节。

### 6.3 第 3 步：本地精排，第二收益位

粗排召回 20 条 → cross-encoder 精排 → 收窄到 top-5。这是四步里**单步收益最大**的一步：观察题 14 → 17。

模型选型上，本地可商用的选择实际只有一个：**`bge-reranker-base`（BAAI，MIT 协议）**。对照组里 Jina reranker 的权重是 CC-BY-NC-4.0（商用需付费），Cohere / Voyage 只有 API。转成 ONNX + int8 量化后，单次查询 20 个候选在 M1 CPU 上约 450ms。

### 6.4 第 4 步：向量路与 RRF

嵌入模型选 `multilingual-e5-small`（384 维，int8 约 120MB，中英同栈）。E5 系列有一个**硬要求**：查询侧必须加 `query: ` 前缀、语料侧必须加 `passage: ` 前缀，漏掉前缀检索质量会显著劣化。

向量存储上做了一个反直觉的决定：**不引 sqlite-vec 之类的原生扩展**，向量以 `Float32Array` 原始字节存进 BLOB 列，查询时在 JS 里暴力算点积（向量已归一化，点积即余弦）。理由是桌面单库万级 chunk × 384 维是毫秒级纯计算，而一个原生扩展要付出的是打包约束 + 平台矩阵 + 签名公证的成本。**这笔账在桌面端是明确划不来的。**

有意思的是这一步的跑分：观察题**仍然是 17/22**，但**构成变了**——向量路救活了最难的一道业务改述题，而两道多跳题让位了。多跳题的正确解法本来就不在召回层，而在第 5 步：把"拆成子问题分别检索"写进系统提示，由 Agent 循环自己完成。

### 6.5 第 5 步：检索策略写进提示词，不新增组件

query rewriting 在 LangGraph 官方 agentic RAG 里就是"检索不满意 → 改写重查"的**循环分支**，不是前置步骤。所以 multi-query / step-back / 子问题分解全部写进系统提示的「检索策略」小节，由 Agent 自发执行：

- 首次检索不理想时换同义词、口语说法或上位概念改写后再搜 1–2 次（如"灰度"也试"分阶段发布"）；
- 答案可能分散在多篇笔记的问题，拆成子问题分别检索，每个子结论各自给出来源；
- 已命中目标文件但片段不完整时，改用大纲 + 读原文，而不是反复检索同一个词。

还有一条是条件渲染的：知识库 chunk 数低于 250 时，额外告诉模型"小库下遍历阅读是合法且常常更可靠的策略"。这是 Anthropic「小于 20 万 token 不要走检索」那条官方建议在 agentic 形态下的落地——**不改管线，只告诉模型遍历也是一条合法路径。**

## 七、工程上真正踩到的坑

前面六节是"应该怎么做"。这一节是"实际发生了什么"。按印象深浅排。

### 坑一：自然语言提问必然归零，而基准第一次跑就把它抓了出来

评估基准建起来第一次跑，10 题过了 3 题。查下去发现是查询构造的问题：整句中文提问时，CJK 整串做一个 phrase 要求那几十个字**全部连续原样出现**；英文每个词之间用 AND 连接，要求**全部命中同一个 chunk**。两条加起来的结果是——只要用户不是在敲关键词而是在提问，检索必然归零。

这个 bug 的可怕之处在于：**它在功能测试里是隐形的。** 单元测试里查"向量维度"当然能命中，端到端冒烟里查一个精心挑的关键词也能命中。只有当你建立一个**用真人问法写出来的**题库时，它才会在第一分钟暴露出来。

这件事之后我对评估基准的态度彻底变了：它不是"上线前的验收环节"，它是**开发期的显微镜**。

### 坑二：LLM 上下文增强，连炸三次

用 deepseek 跑第一轮全量增强：42 个文件，**32 个解析失败**。连修三版：

1. **每块 120 token 的回复预算被中文 JSON 撑爆。** 单项 JSON 的最坏情况（60 字中文定位句 + 两个中文问题 + 语法）约 110 token，而模型并不严格遵守字数上限。预算翻倍到 240，并加 600 的下限兜住单块小文件——**预算给少了模型不会写短，只会被截断成打不开的 JSON。**
2. **deepseek 服务端已默认开启 thinking（effort high）。** token 烧进 `reasoning_content` 且计入 `max_tokens`，导致 20 个文件的 `content` 直接为空。修法是在应用侧对 deepseek 端点标记 `reasoning`，兼容层随之显式发 `thinking: { type: "disabled" }`；评估器按域名加同一参数。
3. **模型会数错块数。** 一份 12 块的文件，它返回 11 项或 13 项。而第一版解析器要求"数组长度必须与块数相等"，于是把一份内容完好的响应**整份拒掉**。修法是让响应项自带块号 `i`，按块号对齐、容忍部分缺失，**一项有效的都没有**才判失败。

第三条的教训最普适：**不要用"整体形状对不对"来校验模型输出，要用"每一项能不能自证身份"。** 前者是全有全无，后者是优雅降级。

修完之后，即使只有部分增强（42 个文件里 9 个），也把最难的那道双文件多跳题救活了——机制方向是对的。

### 坑三：onnxruntime 静默崩溃，引擎陷入重启死循环

这是最难查的一个。现象是：在一台 2014 款 Intel iMac 上，选中真实笔记库之后，utility 进程**没有任何输出地退出**，退出码 5，然后被主进程拉起来，再崩，无限循环。

查下来的原因是：`transformers.js` 的 `pipeline("feature-extraction")` **不在 tokenizer 层做截断**——超过模型 512 token 上限的输入会原样送进 ONNX。连续两批 16 × 约 2000 字符的长 chunk，就让 onnxruntime 的原生层直接崩了。JS 侧收不到任何异常，因为崩的是原生代码。

修法是**不用 pipeline**，手写三步：tokenizer（开 `truncation`）→ 模型 → 掩码均值池化 + L2 归一化。这样序列长度有**硬上界**——这是保证，不是猜测。同时批大小从 16 收到 8 留余量，并在送 tokenizer 之前加一层 4000 字符的预截断（防病态超长字符串白白烧 CPU）。

改完之后验证数值等价：与原 pipeline 的输出**余弦相似度 1.000000**。

这个坑的普适教训是：**只要链路里有原生二进制，"输入没有上界"就不是性能问题，是崩溃问题。** 而崩溃点离触发点隔了一个进程边界，日志里什么都没有。

### 坑四：FTS5 的 `snippet()` 会把 unigram phrase 拦腰截断

高亮片段一开始用 FTS5 内建的 `snippet()`。实测发现它的窗口启发式会从文首起算，"知 识 库"三个 token 常常只剩 `«知 识»` 就被切掉，高亮残缺——对引用预览是硬伤。

改成 `highlight()`（作用于全文，phrase 永远完整）+ 自建窗口：锚定第一个高亮标记，向前留 40 个码点，总长 160，**若截断点落在高亮区间内就向后扩到配对的收尾标记**，保证输出里的高亮标记永远成对。

还有一个附带问题：`search_text` 里的空格是预处理插进去的，直接展示会变成"知 识 库 的 检 索"。所以要做空格折叠——当一个空格两侧（穿透高亮标记看）都是 CJK 字符或 CJK 标点时，判定它是预处理插入的，删掉；CJK 与 ASCII 之间的空格无法区分来源，一律保留。

### 坑五：external content 模式的幽灵命中

FTS5 的 external content 模式（倒排索引指回原表，磁盘上不存第二份正文）省了一半空间，但它的删除有个陷阱：`'delete'` 命令**必须携带与建索引时相同的列值**，否则倒排条目删不干净，留下永远查得到但取不出内容的"幽灵命中"。

因此两件事是刻意的：`search_text` 必须在 `chunks` 表里**真实落地**（供删除触发器读 `old.search_text`）；删除文件时**显式先删 chunks 再删 files**，而不是依赖外键级联——把正确性押在 `foreign_keys` PRAGMA 的连接态上，是一种迟早会还的技术债。

### 坑六：索引库是派生数据，该清就清

第 2a 步改变了 `search_text` 的组成（文件名词元和标题路径进了索引），意味着老库里的 `search_text` **全部过时**。迁移脚本的写法有两条路：写一段"逐行重算"的迁移代码，或者直接 `DELETE FROM files`。

选了后者。理由是：**索引库是派生数据，不是用户数据。** 清空之后下一轮重建会以新组成重新算一遍，而重建有 hash 短路和进度条，用户感知是几秒钟的重新索引。相比之下"逐行重算"的迁移代码是一段只会跑一次、几乎没法测试、出错了还很难发现的代码。

### 坑七：top-5 被同一个文件的多个 chunk 挤占

看基线报告的失败详情时发现一个反复出现的形态：top-5 里有两三条来自同一个文件。这在词法检索里很自然——一篇文章反复提到某个词，它的多个 chunk 分数都高。但对"文件级召回"这个判定口径来说，这是纯粹的浪费。

加了一个按文件限额：**每个文件最多占 2 条**，保序过滤，文件本身绝不整体消失。有意思的是这个改动**对跑分是中性的**（闸门 33/33、观察 12/22 与无限额逐题一致），但仍然保留了——因为它换来了文件视野的多样性，也是给精排"超采 → 收窄"做的预热。

**跑分中性的改动值不值得留，取决于它是不是在为下一步铺路。**

### 坑八：本地模型带来的分发成本

引入 ONNX 推理运行时之后，mac 包从 **125MB 涨到 188MB**。这个代价是必须提前算清楚的账。相关的几个决定：

- 模型**首次使用时才下载**，不打进安装包；缓存目录由调用方注入（应用给 `userData/models`，评估器给 `evals/.model-cache`），**绝不落到用户看不见的地方**；
- 支持 `PIAGENT_HF_ENDPOINT` 指定下载镜像——国内网络对 huggingface.co 常不可达；
- `@huggingface/transformers` 用**动态 import**：它带原生二进制，顶层 import 会让"没装 / 装坏"直接炸掉整个模块图。动态化之后失败被捕获，上层拿到 `null`，检索退回纯词法路径。

最后这条是整个推理层的设计原则：**检索永远不因为推理层而挂。** 模型没就绪时，精排直通、向量路缺席；模型下载完成后自动升级为 hybrid + rerank，**不需要重启应用**。

### 坑九：评估器和应用必须走同一条管道

评估器里那些"默认参数"（每路召回 20 条、每文件最多 2 条）必须与应用运行时的值**逐个对齐**。两边一漂移，55 题跑分就失去意义——你测的不再是应用真实的检索路径。

这件事在代码里的落实是一句写在两个文件头部的**同步义务注释**："改这里必改那里"。这不优雅，但它是唯一有效的手段——因为这两个值天然属于不同的层，硬要共享一份配置反而会制造更奇怪的耦合。

### 坑十：一条不那么技术的边界

LLM 上下文增强会把**笔记全文**送到用户配置的 provider。这与问答时"检索命中的片段被送出"是同一条信任边界，但**覆盖面从命中扩大到了全部**。

这不是一个可以默默做掉的决定。当前的处理是：默认在已配置 provider 时开启，环境变量一票关闭，并把这个决定明确写进文档的隐私边界一节。后续应该升级成设置项里的显式开关。

**凡是改变"什么数据在什么时候离开这台机器"的功能，都不该由实现者顺手决定。**

## 八、现在还没解决的

诚实地列一下这一版留下的洞：

- **两道多跳题仍然不过。** 设计意图是"答案分属两篇文档，top-5 需同时召回"。向量路救回了业务改述，但多跳的召回本质上要求一次检索同时命中两个语义中心，这在单次检索里是矛盾的。正确解法在 Agent 层（拆子问题分别检索），但目前只有提示词，**没有针对它的端到端评估档**。
- **LLM 上下文增强的收益没有全量实测。** 机制完备、增量正确，但一轮完整的 42 文件增强需要真实 key 和时间。目前只有 9/42 部分增强的观察结果。
- **评估只有检索档，没有端到端档。** 现在验的是"预期来源能不能进 top-5"，验不了"回答质量好不好""该拒答的有没有拒答"。拒答题在检索档里根本不做判定——倒排检索总会返回点什么，真正的拒答发生在 Agent 层。判分逻辑已经在题库里定义好了，缺执行器。
- **父子分段还没做。** 子块（段落）精确匹配、命中后返回父块（标题节）保上下文，对 Markdown 天然契合，与行号引用也完全兼容。这是下一个性价比明显的点。

## 九、小结

回头看，这一层里真正起决定作用的不是任何一个具体技术，而是三个**顺序**上的选择：

1. **先定形态，再选技术。** 认清"检索是 Agent 的工具而不是它的前置工序"之后，"工具契约不能动、契约背后随便换"这条准则就自动成立了，后面所有架构决策都不用再讨论。
2. **先有尺子，再谈收益。** 把评估从最后一步提到第 0 步，代价是多花两天造题库，收益是后面每一次"我觉得这样更好"都变成了一个可证伪的命题。那个自然语言检索归零的 bug，就是尺子在第一分钟抓出来的。
3. **先做低垂果实，再啃工程量。** 结构性上下文（零 LLM 调用）和本地精排（不依赖向量路存在）加起来把观察题从 12 抬到 17；工程面最大的向量路放在最后，跑分只换来了构成的改善。**如果一开始就上向量库，我会得到一个更复杂的系统和一个几乎相同的分数。**

至于那些坑——从中文正则的码点区段，到 onnxruntime 的静默崩溃，再到模型数错块数——它们的共同点是：**没有一个是在设计阶段能想到的，但每一个都是在有 trace、有基准的前提下能被定位的。**

这大概就是这一篇最想说的话。
</content>
</invoke>
