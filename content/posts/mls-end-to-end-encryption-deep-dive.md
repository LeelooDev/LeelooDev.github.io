---
title: MLS 深度解析：为十万人群聊设计的端到端加密协议
date: 2026-06-11
category: code
tags: [安全, 端到端加密, MLS, 密码学, 协议设计]
cover: /images/cover-telephone.jpg
coverAlt: 黑白照片，戴帽子的人坐在沙发上握着一部有线电话
excerpt: 双棘轮解决了两个人的保密通话，但群聊一直是端到端加密的软肋。IETF 用五年时间制定的 MLS（RFC 9420），用一棵「棘轮树」把群密钥协商的成本从 O(n) 压到 O(log n)，同时保住前向保密和入侵后恢复。本文从问题出发，把 TreeKEM、纪元状态机、密钥调度和信任架构完整讲一遍。
dek: 从双棘轮的局限讲起，把 MLS 的棘轮树、Proposal-Commit 状态机、密钥调度和 DS/AS 信任模型一次讲透。
draft: false
---

打开任何一篇介绍端到端加密的文章，主角几乎都是 Signal 协议：X3DH 握手、双棘轮、前向保密。这套机制确实优雅，但它有一个常被忽略的前提：**它是为两个人设计的**。

一旦把场景换成群聊，事情立刻变得不优雅。一个 50 人的工作群、一个 5000 人的社区、一个十万人的频道，如何让每条消息只有群成员能解密？如何在有人退群之后，保证 TA 再也读不到新消息？如何在某个成员手机被植入木马之后，让整个群的密钥能「自愈」？

这些问题，Signal 式的两两加密回答得很吃力。IETF 花了五年时间（2018 至 2023）给出了一个系统性的答案：**MLS，Messaging Layer Security**，2023 年 7 月发布为 [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html)。这个名字是有意致敬 TLS 的：TLS 保护「传输层」，MLS 保护「消息层」。它现在已经进入了 Cisco Webex、Wire、AWS Wickr、Discord 的语音加密（DAVE 协议），并且被 GSMA 选为 RCS 短信端到端加密的标准方案，Google 和 Apple 都已宣布跟进。

这篇文章不打算停留在「MLS 很安全」的层面，而是把它的核心机制完整过一遍：为什么需要它、棘轮树怎么工作、一次成员变更内部发生了什么、密钥如何一层层派生到每一条消息，以及它把哪些信任问题留给了基础设施。

## 一、先把问题说清楚：群聊为什么难

### 1.1 端到端加密要保证什么

端到端加密（E2EE）的承诺是：**只有通信的端点能读到明文，服务器只是搬运密文的管道**。在这个承诺之上，现代协议还追求两个更强的性质：

- **前向保密（Forward Secrecy, FS）**：攻击者今天拿到了你的密钥，也解不开你昨天的消息。实现手段是密钥不断向前演化，旧密钥用完即焚。
- **入侵后恢复（Post-Compromise Security, PCS）**：攻击者今天拿到了你的密钥，只要你之后完成一次正常的密钥更新，TA 就会被重新挡在门外。这也叫「自愈」（healing）。

Signal 的双棘轮在两人会话里同时做到了这两点：每条消息都让对称链向前走一步（FS），每次往返都注入新的 DH 临时密钥（PCS）。

### 1.2 朴素方案一：两两会话叠出一个群

最直接的群聊做法，是给群里每一对成员都建立一条双棘轮会话。发一条群消息，等于把同一句话分别加密 n-1 次、发送 n-1 份。

安全性无可挑剔，性质和单聊完全一致。但代价是：

- 发送方每条消息要做 **O(n) 次加密和 O(n) 次发送**，一个万人群每条消息要产生一万份密文；
- 全群需要维护 **O(n²) 条会话状态**；
- 多设备场景进一步放大系数（每个成员的每台设备都是一个「端」）。

iMessage 的群聊长期采用的就是这类思路，所以它的群规模上限一直很小。

### 1.3 朴素方案二：Sender Key，把发送降到 O(1)

WhatsApp 和 Signal 的群聊用了一个折中方案：**Sender Key**。每个成员生成一把自己的「发送密钥」（一条对称链密钥加一把签名密钥），通过已有的两两加密通道分发给所有群友。之后发消息只需用自己的发送链加密一次，所有人都能解。

发送成本降到了 O(1)，但两个代价立刻显现：

1. **踢人变得极贵**。成员退群或被移除后，TA 手里还握着所有人的 sender key，所以全群每个人都必须重新生成并重新分发自己的发送密钥，总通信量是 O(n²) 级别。大群里这是一场小型风暴。
2. **几乎没有 PCS**。某个成员的发送链一旦泄露，攻击者可以持续解密 TA 之后的所有消息，链条本身不会自愈，除非触发一次全群重建。

也就是说，Sender Key 把「日常发消息」做便宜了，把「安全性维护」做贵了。群越大，越没有人愿意支付维护安全性的成本，于是 PCS 在实践里形同虚设。

### 1.4 MLS 的目标

MLS 的设计目标可以概括成一句话：**让一个动态变化的大群，以 O(log n) 的代价，持续协商出一把全群共享、且不断向前演化的密钥**。具体拆开：

- 支持万人级别的群（RFC 的设计目标是 5 万成员量级）；
- 成员增删、密钥更新的代价是 **O(log n)** 而不是 O(n)；
- 完整的 **FS 和 PCS**；
- **异步**：操作发起时不要求其他成员在线（依赖预发布的密钥包）；
- 群成员对「群里有谁」这件事达成密码学意义上的一致（成员一致性）。

学术界把这类机制叫 **CGKA（Continuous Group Key Agreement，持续群密钥协商）**。MLS 是 CGKA 第一次被工程化成 IETF 标准。

## 二、核心数据结构：棘轮树（TreeKEM）

MLS 的全部魔法都建立在一棵二叉树上，规范里叫 **ratchet tree（棘轮树）**，其密码学内核叫 **TreeKEM**。

规则很简单：

- **每个群成员占据一个叶子节点**，叶子上有这个成员的 HPKE 公私钥对（HPKE 是 RFC 9180 定义的混合公钥加密）和身份凭证；
- **每个内部节点也有一对 HPKE 密钥**，它的私钥被「这个节点子树下的所有成员」共同知晓，子树之外没有任何人知道；
- 一个成员实际掌握的，是**从自己的叶子一路走到根的那条路径（direct path）上所有节点的私钥**；
- 于是**根节点的秘密天然被全体成员共享**，它就是每个时代的群密钥来源。

<figure class="diagram">
<svg viewBox="0 0 800 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="八个成员的 MLS 棘轮树示意图">
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="400" y1="46" x2="200" y2="118"/><line x1="400" y1="46" x2="600" y2="118"/>
<line x1="200" y1="118" x2="100" y2="190"/><line x1="200" y1="118" x2="300" y2="190"/>
<line x1="600" y1="118" x2="500" y2="190"/><line x1="600" y1="118" x2="700" y2="190"/>
<line x1="100" y1="190" x2="50" y2="258"/><line x1="100" y1="190" x2="150" y2="258"/>
<line x1="300" y1="190" x2="250" y2="258"/><line x1="300" y1="190" x2="350" y2="258"/>
<line x1="500" y1="190" x2="450" y2="258"/><line x1="500" y1="190" x2="550" y2="258"/>
<line x1="700" y1="190" x2="650" y2="258"/><line x1="700" y1="190" x2="750" y2="258"/>
</g>
<circle cx="400" cy="46" r="20" fill="#25262b"/>
<text x="400" y="51" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">根</text>
<text x="446" y="40" font-size="12" fill="#6b6e76">全群共享秘密</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<circle cx="200" cy="118" r="16"/><circle cx="600" cy="118" r="16"/>
<circle cx="100" cy="190" r="16"/><circle cx="300" cy="190" r="16"/>
<circle cx="500" cy="190" r="16"/><circle cx="700" cy="190" r="16"/>
</g>
<text x="232" y="106" font-size="12" fill="#6b6e76">A–D 共知</text>
<text x="632" y="106" font-size="12" fill="#6b6e76">E–H 共知</text>
<g>
<rect x="20" y="258" width="60" height="34" rx="8" fill="#25262b"/><text x="50" y="280" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">A</text>
<rect x="120" y="258" width="60" height="34" rx="8" fill="#25262b"/><text x="150" y="280" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">B</text>
<rect x="220" y="258" width="60" height="34" rx="8" fill="#25262b"/><text x="250" y="280" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">C</text>
<rect x="320" y="258" width="60" height="34" rx="8" fill="#25262b"/><text x="350" y="280" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">D</text>
<rect x="420" y="258" width="60" height="34" rx="8" fill="#25262b"/><text x="450" y="280" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">E</text>
<rect x="520" y="258" width="60" height="34" rx="8" fill="#25262b"/><text x="550" y="280" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">F</text>
<rect x="620" y="258" width="60" height="34" rx="8" fill="#25262b"/><text x="650" y="280" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">G</text>
<rect x="720" y="258" width="60" height="34" rx="8" fill="#25262b"/><text x="750" y="280" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">H</text>
</g>
<text x="400" y="318" text-anchor="middle" font-size="12" fill="#6b6e76">叶子 = 成员（HPKE 密钥 + 身份凭证）　内部节点私钥 = 其子树成员共同掌握</text>
</svg>
<figcaption>图 1：八人群的棘轮树。每个节点上是一对 HPKE 密钥；越靠近根，知晓其私钥的人越多；根的秘密全员共享，作为群密钥的来源。</figcaption>
</figure>

这个「子树共知」的结构（规范称为 *tree invariant*，树不变式）是全部效率的来源。想给「E 到 H 这四个人」捎一个秘密，不需要分别加密四次，只需要**用他们共同祖先节点的公钥加密一次**。一棵平衡二叉树上，任何成员的路径长度是 log₂(n)，这就是 O(log n) 的由来。

## 三、一次密钥更新内部发生了什么：UpdatePath

PCS 的来源是「更新」。MLS 里任何成员都可以随时刷新自己持有的全部密钥，这个动作叫发起一条 **UpdatePath**。以四人群里的成员 C 为例：

1. C 生成一个全新的叶子密钥对（旧的彻底作废）；
2. 从新叶子秘密出发，**沿着自己到根的路径逐层派生**出一串「路径秘密」：`path_secret[1] → path_secret[2] → …`，每一层都通过 KDF 单向推导，每个路径秘密决定那一层节点的新 HPKE 密钥对；
3. 对路径上的每一层，把对应的路径秘密 **用 HPKE 加密给「副路径」（copath）上的兄弟子树**。兄弟子树的成员解开后，就能沿着同一条链自己推导出更上层的新密钥；
4. 走到根之后再多推一步，得到 `commit_secret`，作为新纪元密钥调度的输入。

<figure class="diagram">
<svg viewBox="0 0 800 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="成员 C 发起 UpdatePath 的过程示意">
<defs>
<marker id="up-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
<marker id="up-arrow-d" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<g stroke="#c4c6cd" stroke-width="1.5">
<line x1="400" y1="64" x2="220" y2="150"/><line x1="220" y1="150" x2="120" y2="236"/><line x1="220" y1="150" x2="320" y2="236"/>
</g>
<g stroke="#25262b" stroke-width="2.5">
<line x1="580" y1="150" x2="480" y2="236"/><line x1="400" y1="64" x2="580" y2="150"/>
</g>
<line x1="580" y1="150" x2="680" y2="236" stroke="#c4c6cd" stroke-width="1.5"/>
<circle cx="400" cy="64" r="20" fill="#25262b"/><text x="400" y="69" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">根</text>
<circle cx="220" cy="150" r="16" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/><text x="220" y="132" text-anchor="middle" font-size="12" fill="#6b6e76">AB</text>
<circle cx="580" cy="150" r="16" fill="#25262b"/><text x="580" y="132" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">CD（新）</text>
<g>
<rect x="90" y="236" width="60" height="34" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/><text x="120" y="258" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">A</text>
<rect x="290" y="236" width="60" height="34" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/><text x="320" y="258" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">B</text>
<rect x="450" y="236" width="60" height="34" rx="8" fill="#25262b"/><text x="480" y="258" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">C ✦</text>
<rect x="650" y="236" width="60" height="34" rx="8" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/><text x="680" y="258" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">D</text>
</g>
<path d="M 510 244 C 540 215 552 190 567 168" fill="none" stroke="#25262b" stroke-width="1.8" marker-end="url(#up-arrow)"/>
<text x="568" y="208" font-size="12" fill="#25262b" font-weight="600">ps₁</text>
<path d="M 572 132 C 540 105 500 86 428 70" fill="none" stroke="#25262b" stroke-width="1.8" marker-end="url(#up-arrow)"/>
<text x="500" y="86" font-size="12" fill="#25262b" font-weight="600">ps₂</text>
<path d="M 596 162 C 640 188 660 210 672 230" fill="none" stroke="#9a9da6" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#up-arrow-d)"/>
<text x="676" y="196" font-size="12" fill="#6b6e76">HPKE(ps₁) → D</text>
<path d="M 384 76 C 330 104 280 124 238 140" fill="none" stroke="#9a9da6" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#up-arrow-d)"/>
<text x="252" y="96" font-size="12" fill="#6b6e76">HPKE(ps₂) → AB 子树</text>
<text x="400" y="306" text-anchor="middle" font-size="12" fill="#6b6e76">实线箭头：C 本地的单向派生链　虚线箭头：把路径秘密加密给副路径子树　✦ = 新生成的叶子密钥</text>
</svg>
<figcaption>图 2：四人群中成员 C 的一次 UpdatePath。C 重建自己整条路径的密钥，只需发出 log₂(n) 份 HPKE 密文；D 解开 ps₁、A 和 B 解开 ps₂ 后，各自就能推导出与 C 一致的新树。</figcaption>
</figure>

注意两件事：

**第一，攻击者被甩在了后面。** 假设攻击者曾经偷走 C 的全部状态。C 完成这次更新后，新叶子密钥是用新随机数生成的，攻击者没有任何材料能推出新的路径秘密。这就是 PCS 的实现：**一次 O(log n) 的更新，就把整条路径「治愈」了**。每个成员定期做一次 Update，整棵树就在持续自愈。

**第二，单向派生保证了 FS 方向的安全。** 路径秘密链是单向 KDF，知道 `path_secret[2]` 推不回 `path_secret[1]`；纪元向前演化后，旧的树状态被删除，拿到今天的树也解不开昨天的消息。

树上还有一个工程细节值得一提：**空白节点（blank node）**。增删成员时，受影响路径上的节点会被「置空」，因为这一刻没人能安全地代表整个子树持有这个密钥。给空白节点加密时，退化为给它的「解析集」（resolution，即下方最近的非空节点们）分别加密。极端情况下树会退化接近 O(n)，所以成员的日常 Update 同时承担着「把树修干净」的职责。

## 四、群是一台状态机：纪元、Proposal 与 Commit

棘轮树解决了「密钥怎么算」，但群聊还需要解决「大家怎么对群的状态达成一致」。MLS 把群设计成一台**严格线性演化的状态机**，每个状态叫一个**纪元（epoch）**。

改变群状态的方式只有一种：先广播**提案（Proposal）**，再由某个成员把一批提案打包成一次**提交（Commit）**。Commit 被全员接受后，群整体跨入下一个纪元。

| Proposal 类型 | 作用 |
|---|---|
| `Add` | 拉人：附带新成员预发布的 KeyPackage |
| `Remove` | 踢人：指定要移除的叶子 |
| `Update` | 刷新自己的叶子密钥（PCS 的日常来源） |
| `PreSharedKey` | 注入带外预共享密钥，叠加额外安全性 |
| `ReInit` | 整群重启（换密码套件、换协议版本） |
| `GroupContextExtensions` | 修改群级别的扩展配置 |

<figure class="diagram">
<svg viewBox="0 0 800 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MLS 纪元随 Commit 演进的时间线">
<defs>
<marker id="ep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<rect x="30" y="78" width="170" height="70" rx="12" fill="#25262b"/>
<text x="115" y="106" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="650">纪元 n</text>
<text x="115" y="128" text-anchor="middle" font-size="12" fill="#c4c6cd">成员：A B C D</text>
<rect x="320" y="60" width="180" height="106" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="410" y="84" text-anchor="middle" font-size="13" fill="#25262b" font-weight="650">Commit（由 B 发起）</text>
<text x="410" y="108" text-anchor="middle" font-size="12" fill="#6b6e76">Add E（带 KeyPackage）</text>
<text x="410" y="128" text-anchor="middle" font-size="12" fill="#6b6e76">Remove D</text>
<text x="410" y="148" text-anchor="middle" font-size="12" fill="#6b6e76">Update B + 新 UpdatePath</text>
<rect x="600" y="78" width="170" height="70" rx="12" fill="#25262b"/>
<text x="685" y="106" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="650">纪元 n+1</text>
<text x="685" y="128" text-anchor="middle" font-size="12" fill="#c4c6cd">成员：A B C E</text>
<line x1="200" y1="113" x2="312" y2="113" stroke="#25262b" stroke-width="2" marker-end="url(#ep-arrow)"/>
<line x1="500" y1="113" x2="592" y2="113" stroke="#25262b" stroke-width="2" marker-end="url(#ep-arrow)"/>
<path d="M 460 166 C 510 210 580 214 648 200" fill="none" stroke="#9a9da6" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#ep-arrow)"/>
<text x="556" y="226" text-anchor="middle" font-size="12" fill="#6b6e76">Welcome 消息 → 新成员 E（封装入群所需秘密）</text>
<text x="115" y="186" text-anchor="middle" font-size="12" fill="#6b6e76">init_secret[n] 留给下一纪元</text>
<text x="685" y="60" text-anchor="middle" font-size="12" fill="#6b6e76">D 从此解不开任何新消息</text>
</svg>
<figcaption>图 3：Proposal 累积、Commit 定界。每次 Commit 同时携带一条新的 UpdatePath，所以「换纪元」必然伴随「换密钥」；被移除的成员停留在旧纪元，密码学上无法跟进。</figcaption>
</figure>

几个设计点值得细品：

**拉人不需要对方在线。** 每个用户平时会向服务器预发布一批 **KeyPackage**（内含 HPKE 初始公钥、签名公钥、身份凭证和能力声明，类似 Signal 的 prekey bundle）。拉人时取一份 KeyPackage 即可把对方写进树里，再发一条 **Welcome** 消息，把入群所需的秘密（`joiner_secret`、群信息、树的公开部分）用对方 KeyPackage 里的初始公钥加密送达。对方上线后解开 Welcome，瞬间与全群同步到同一纪元。

**踢人是密码学意义上的踢。** Remove 提案生效的那次 Commit 会携带新的 UpdatePath，新纪元的所有秘密都绕开了被移除者的叶子。被踢的人手里只有旧纪元的死钥匙。「服务器不再给 TA 转发消息」只是礼貌，「TA 解不开新密文」才是保证。

**每个纪元只能有一个 Commit 胜出。** 两个成员并发提交时，必须由 Delivery Service 或既定规则裁决先后，输家丢弃自己的 Commit 重新来。这是 MLS 把「分布式一致性」难题显式交给基础设施的地方，也是工程实现里最容易踩坑的环节。

## 五、密钥调度：从一个秘密到每一条消息

纪元切换时，树根产出的 `commit_secret` 并不直接拿来加密消息，而是进入一条严谨的**密钥调度**（key schedule）流水线，与上一纪元留下的链式秘密混合，再派生出各司其职的一组密钥。

<figure class="diagram">
<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MLS 密钥调度流程图">
<defs>
<marker id="ks-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<rect x="40" y="30" width="190" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="135" y="57" text-anchor="middle" font-size="13" fill="#25262b">init_secret（上一纪元）</text>
<rect x="40" y="100" width="190" height="44" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="135" y="127" text-anchor="middle" font-size="13" fill="#25262b">commit_secret（树根）</text>
<rect x="320" y="64" width="160" height="46" rx="10" fill="#25262b"/>
<text x="400" y="92" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">joiner_secret</text>
<line x1="230" y1="52" x2="312" y2="78" stroke="#25262b" stroke-width="1.8" marker-end="url(#ks-arrow)"/>
<line x1="230" y1="122" x2="312" y2="96" stroke="#25262b" stroke-width="1.8" marker-end="url(#ks-arrow)"/>
<text x="262" y="48" font-size="11" fill="#6b6e76">KDF</text>
<rect x="560" y="64" width="180" height="46" rx="10" fill="#25262b"/>
<text x="650" y="92" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">epoch_secret</text>
<line x1="480" y1="87" x2="552" y2="87" stroke="#25262b" stroke-width="1.8" marker-end="url(#ks-arrow)"/>
<text x="516" y="78" text-anchor="middle" font-size="11" fill="#6b6e76">(+PSK)</text>
<text x="400" y="130" font-size="12" fill="#6b6e76" text-anchor="middle">Welcome 给新成员的就是它</text>
<g stroke="#9a9da6" stroke-width="1.5">
<line x1="650" y1="110" x2="650" y2="146" marker-end="url(#ks-arrow)"/>
</g>
<g>
<rect x="60" y="156" width="200" height="42" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/><text x="160" y="182" text-anchor="middle" font-size="12.5" fill="#25262b">encryption_secret</text>
<rect x="300" y="156" width="200" height="42" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/><text x="400" y="182" text-anchor="middle" font-size="12.5" fill="#25262b">confirmation / membership</text>
<rect x="540" y="156" width="220" height="42" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/><text x="650" y="182" text-anchor="middle" font-size="12.5" fill="#25262b">exporter / resumption / external</text>
<rect x="60" y="222" width="200" height="42" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/><text x="160" y="248" text-anchor="middle" font-size="12.5" fill="#25262b">sender_data_secret</text>
<rect x="300" y="222" width="200" height="42" rx="10" fill="#25262b"/><text x="400" y="248" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">init_secret（传给下一纪元）</text>
</g>
<line x1="650" y1="146" x2="650" y2="152" stroke="#9a9da6" stroke-width="0"/>
<g stroke="#9a9da6" stroke-width="1.3">
<line x1="610" y1="118" x2="170" y2="152" marker-end="url(#ks-arrow)"/>
<line x1="635" y1="120" x2="408" y2="152" marker-end="url(#ks-arrow)"/>
<line x1="655" y1="120" x2="652" y2="152" marker-end="url(#ks-arrow)"/>
<line x1="600" y1="118" x2="172" y2="220" marker-end="url(#ks-arrow)"/>
<line x1="628" y1="120" x2="412" y2="218" marker-end="url(#ks-arrow)"/>
</g>
<rect x="60" y="306" width="700" height="58" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="6 4"/>
<text x="410" y="330" text-anchor="middle" font-size="12.5" fill="#25262b">encryption_secret → 秘密树（secret tree）→ 每个成员独立的消息棘轮 → 每条消息一把 AEAD 密钥</text>
<text x="410" y="350" text-anchor="middle" font-size="12" fill="#6b6e76">用完即删：任何一把消息密钥泄露，都打不开其他任何一条消息</text>
<line x1="160" y1="198" x2="160" y2="302" stroke="#25262b" stroke-width="1.8" marker-end="url(#ks-arrow)"/>
</svg>
<figcaption>图 4：纪元密钥调度。上一纪元的 init_secret 与本次 commit_secret 经 KDF 链合并出 epoch_secret，再扇出为加密、认证、导出、续期等专用秘密；encryption_secret 进一步展开成秘密树，落到每条消息。</figcaption>
</figure>

这条流水线里有几个角色分工明确的产物：

- **`encryption_secret`**：展开成一棵与棘轮树同构的**秘密树（secret tree）**，给每个成员派生独立的消息棘轮（握手消息和应用消息各一条）。每发一条消息棘轮走一步，**每条消息都有自己独享的 AEAD 密钥和随机数，用完即删**。这是消息粒度的前向保密。
- **`confirmation_key` 与 `membership_key`**：用来计算确认标签和成员标签，保证大家不仅密钥一致，对「群里有谁、历史发生过什么」也达成一致（通过 transcript hash 链）。
- **`exporter_secret`**：标准的「外接口」，上层应用可以从这里安全地导出密钥做别的事。Discord 的语音端到端加密（DAVE）就是从 MLS exporter 派生媒体帧密钥的。
- **`init_secret`**：传给下一纪元，保证纪元之间链式咬合。攻击者即使完全掌握某一纪元，只要错过一次 Commit，链条就断了。
- **`external_secret`**：支持「外部提交（External Commit）」，让持有 GroupInfo 的人不经任何在群成员之手、自己把自己加进群（典型场景：用户换新设备后自助重新入群）。

另外，整个体系的密码学原语是套件化的（与 TLS 一样按 ciphersuite 协商），例如默认套件 `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`：HPKE 用 X25519，消息加密用 AES-128-GCM，哈希用 SHA-256，签名用 Ed25519。后量子迁移只需要定义新套件（HPKE 换成 ML-KEM 类 KEM），树结构与状态机完全不用动，这是把 MLS 做成「框架」而非「算法」的远见。

## 六、信任架构：MLS 没有解决（也不打算解决）的部分

RFC 9420 刻意只定义了「密码学协议」本身，把两类基础设施抽象成接口，由配套的架构文档（RFC 9750）描述：

<figure class="diagram">
<svg viewBox="0 0 800 270" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MLS 的 DS 与 AS 信任架构">
<defs>
<marker id="ar-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<rect x="40" y="60" width="220" height="150" rx="14" fill="#25262b"/>
<text x="150" y="92" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="650">群成员（客户端）</text>
<text x="150" y="118" text-anchor="middle" font-size="12" fill="#c4c6cd">持有棘轮树私钥</text>
<text x="150" y="138" text-anchor="middle" font-size="12" fill="#c4c6cd">本地执行全部加解密</text>
<text x="150" y="158" text-anchor="middle" font-size="12" fill="#c4c6cd">验证彼此的签名与成员标签</text>
<text x="150" y="186" text-anchor="middle" font-size="12" fill="#8a8d96">唯一能看到明文的地方</text>
<rect x="380" y="40" width="380" height="88" rx="14" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="570" y="68" text-anchor="middle" font-size="13.5" fill="#25262b" font-weight="650">Delivery Service（DS）投递服务</text>
<text x="570" y="92" text-anchor="middle" font-size="12" fill="#6b6e76">扇出消息、裁决并发 Commit 的顺序、暂存 KeyPackage 与 Welcome</text>
<text x="570" y="112" text-anchor="middle" font-size="12" fill="#6b6e76">看得到：谁在何时发了多大的密文（元数据）　看不到：内容</text>
<rect x="380" y="152" width="380" height="88" rx="14" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="570" y="180" text-anchor="middle" font-size="13.5" fill="#25262b" font-weight="650">Authentication Service（AS）认证服务</text>
<text x="570" y="204" text-anchor="middle" font-size="12" fill="#6b6e76">把签名公钥绑定到真实身份（X.509 凭证、可验证凭证等）</text>
<text x="570" y="224" text-anchor="middle" font-size="12" fill="#6b6e76">作恶即可冒充成员 → 需要密钥透明度（Key Transparency）制衡</text>
<line x1="260" y1="100" x2="372" y2="84" stroke="#25262b" stroke-width="1.8" marker-end="url(#ar-arrow)"/>
<line x1="372" y1="104" x2="260" y2="120" stroke="#25262b" stroke-width="1.8" marker-end="url(#ar-arrow)"/>
<line x1="260" y1="180" x2="372" y2="196" stroke="#9a9da6" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#ar-arrow)"/>
<text x="316" y="76" font-size="11.5" fill="#6b6e76">密文</text>
<text x="316" y="136" font-size="11.5" fill="#6b6e76">密文</text>
<text x="296" y="200" font-size="11.5" fill="#6b6e76">凭证校验</text>
</svg>
<figcaption>图 5：MLS 的信任边界。DS 被假定为「诚实但好奇」，拿不到内容但掌握元数据与排序权；AS 是身份信任的根，是整个系统里最值得用透明度机制盯防的组件。</figcaption>
</figure>

- **DS（Delivery Service）** 负责消息扇出、存储转发，以及最关键的：给 Commit 排序。它无法解密任何内容，但它能看到完整的通联元数据（谁、何时、和谁的群、多大的密文），也有能力搞延迟投递或选择性丢弃。MLS 的成员标签和 transcript hash 能让「DS 篡改或分叉群状态」被成员发现，但「元数据隐私」明确不在 MLS 的保护范围内。
- **AS（Authentication Service）** 决定「这把签名公钥属于谁」。如果 AS 作恶，可以给攻击者签发一张冒名凭证，从入口处骗过所有密码学。所以严肃的部署都会给 AS 套上**密钥透明度（Key Transparency）**：把凭证写进可公开审计的只追加日志，让冒名行为留下不可抵赖的证据。WhatsApp 和 Apple 近年上线的可审计密钥目录，就是在补这块短板。

还有一个常被问到的性质：**否认性（deniability）**。Signal 的双棘轮刻意做到了「事后无法向第三方证明某句话是你说的」。MLS 因为大量使用普通数字签名，否认性比 Signal 弱，这是它为了大群的可扩展性和成员一致性付出的代价之一，规范在安全考量一节中明确承认了这个权衡。

## 七、MLS 正在落地到哪里

- **Cisco Webex**：会议端到端加密的底层已经换成 MLS（Cisco 也是规范的主要作者之一，开源了 C++ 实现 mlspp）。
- **Wire**：MLS 的发起者之一，企业版已把群聊从 Proteus（Signal 式）迁移到 MLS。
- **Discord**：语音/视频的端到端加密协议 DAVE 用 MLS 做群密钥协商，媒体密钥从 exporter_secret 派生。
- **RCS 短信**：GSMA 在 Universal Profile 3.0 中选定 MLS 作为跨厂商端到端加密方案，Google Messages 和 Apple 都已宣布支持，这意味着 Android 与 iPhone 之间的「绿泡泡」消息将第一次获得跨平台 E2EE。
- **IETF MIMI 工作组**：在 MLS 之上制定跨应用互通的消息标准，目标是让不同 IM 产品在欧盟《数字市场法》要求的互联互通下仍能保持端到端加密。
- **开源实现**：Rust 的 OpenMLS、AWS 的 mls-rs（用于 Wickr）、Cisco 的 mlspp 都已比较成熟，想动手把玩协议的话，OpenMLS 的文档对照 RFC 阅读体验很好。

## 八、工程师视角的几个清醒认识

把 MLS 写进产品之前，有几件事最好提前想清楚：

1. **排序是地狱的入口。** 每纪元一个 Commit 的规则，意味着 DS 必须提供全序广播或等价的仲裁机制。网络分区、消息乱序、客户端重试，都会制造「树分叉」，恢复逻辑（重新同步、外部提交兜底）要在第一天就设计好。
2. **状态是有毒资产。** 客户端必须持久化树、纪元秘密和消息棘轮位置，崩溃恢复时少删一把旧密钥就是在伤害前向保密，多删一步就再也解不开还在路上的消息。secret tree 的「跳跃删除窗口」需要细致实现。
3. **多设备 = 多叶子。** MLS 的「成员」是设备级的。一个用户三台设备就是树上三个叶子，身份层要自己把「叶子集合」聚合成「用户」，下线设备要及时 Remove，否则它就是一把永远不更新的钝密钥，拖累全群的 PCS。
4. **Update 频率是安全旋钮。** PCS 的恢复速度取决于成员多久发一次 Update/Commit。安静的大群可能几周没人触发纪元演进，自愈也就停摆几周。生产部署通常会让客户端按时间或消息数自动发起 Update。
5. **树会变脏。** 频繁增删会留下大量空白节点，加密成本向 O(n) 退化。监控树的「解析集大小」，必要时引导整树重建（ReInit），是大群长期运营绕不开的维护项。

## 结语

回头看，MLS 做的事情可以用一句话概括：**把双棘轮「两个人互相追赶」的安全游戏，搬到了一棵树上让一万个人一起玩，并且让每一步的成本都只有 log n**。

它不是 Signal 协议的替代品，而是补上了端到端加密版图上长期缺失的一块：可扩展、可标准化、可互通的群组密钥协商。随着 RCS、MIMI 这些跨厂商场景铺开，未来几年你手机里「不知不觉就用上了 MLS」的应用只会越来越多。

对协议设计感兴趣的读者，建议按这个顺序深入：先读 [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html) 的第 2 节术语和第 7 节树操作，再读 [RFC 9750](https://www.rfc-editor.org/rfc/rfc9750.html) 架构文档理解 DS/AS 的边界，最后翻 OpenMLS 的源码把每个概念落到数据结构上。密码学协议读起来从来不轻松，但 MLS 的规范写作质量在 IETF 文档里属于第一梯队，值得精读一次。
