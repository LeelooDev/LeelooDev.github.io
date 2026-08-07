---
title: 从零搭建个人智能体（二）
date: 2026-08-06T18:00:00
category: code
tags: [Agent, RAG, 多格式, PDF, OCR, Electron, SQLite, TypeScript]
cover: /images/personal-agent-02-cover.jpg
coverAlt: 高空俯瞰的雪山全景，逆光的云海从山脊间漫过，右侧太阳压在云层边缘
excerpt: 系列第二篇：把知识库从「仅 Markdown」扩到八种格式，而不动检索层一行代码。核心是一层派生 Markdown——每个 PDF、Excel、PPT 确定性地转成一份带锚点表的文本，行号照旧、引用照旧可验证，locator 只负责把「派生文本第 338 行」翻译成「原件第 12 页」。以及三次把整个 Utility 进程打死的打包事故：tesseract 的 worker 路径、pdfjs 的身份误判、一个从没被用到的 canvas 可选依赖。
dek: 扩格式最难的不是解析，是让「可验证引用」这件事在六种新格式上继续成立——而它的敌人叫非确定性。
---

> 这是「从零搭建个人智能体」的第二篇。[第一篇](/posts/personal-agent-from-scratch-01)讲检索层：一堆 `.md` 文件怎么变成 Agent 能可靠引用的知识源。这一篇讲**格式层**：当用户的资料根本不是 Markdown 时——是 PDF、是 Excel、是从微信导出的 PPT、是随手截的图——那条「带精确行号、可点击、可验证」的引用链路要怎么活下来。
>
> 改造涉及 157 个文件、8633 行新增，但检索层（切块、FTS5、向量、融合、精排）**一行未改**。这不是巧合，是这一版唯一的设计目标。

## 一、问题不是「支持 PDF」，是「PDF 里没有第 340 行」

第一篇里反复强调的产品命脉是一句话：**每一条引用都要能被验证。** 具体到实现，是这么一条判据（`agent-runtime/src/citations.ts`）：

> 模型给出的引用 `笔记.md#L12-L28` 成立，当且仅当这个行号区间与本轮工具实际读过的证据区间**相交**。

它优雅的地方在于极其笨：它只认行号，不关心语义、不问模型是否真的读懂了，也无法被"听起来很有道理"骗过。整个系统的可信度就压在这一个不等式上。

然后用户说：我的资料在 PDF 里。

这句话炸掉的不是解析能力，是那条判据的**坐标系**。一份 PDF 文件里没有"第 340 行"这回事——它有页、有渲染顺序、有绘制指令，唯独没有行。Excel 有工作表和单元格，PPT 有幻灯片，扫描件连文字都没有。八种格式，八种互不兼容的坐标系。

最直觉的做法是让契约层认识所有坐标系：`Chunk` 上加 `page?`、加 `sheet?`、加 `cell?`、加 `slide?`，引用验证按格式分支。我推演了一遍这条路要动的东西：

| 要改的地方 | 后果 |
|---|---|
| `ChunkSchema` / `SearchHitSchema` / `CitationSchema` | 三个 `strictObject` 过 IPC，主/渲染/utility 三侧同步炸开 |
| 引用验证 | 从一个不等式变成八个分支，每个分支各有边界条件 |
| 切块器 | 行号不再是通用坐标，得为每种格式各写一套"这段属于哪里" |
| 证据集 | `EvidenceEntry` 要能表达八种区间的相交 |
| 来源面板 / 引用预览 | 八种展示分支 |

代价还不止是工作量。真正致命的是：**引用验证从此有了八条判据。** 一条判据可以被反复审视、被测试穷尽、被我在半年后还记得住；八条判据里迟早有一条会写错，而写错的表现是"引用看起来正常但其实没被验证过"——这种 bug 不会崩溃、不会报错，只会安静地把整个产品的信任基础掏空。

所以这一版的第一个决策，是把八种坐标系**压回一种**。

## 二、派生 Markdown 层：一切收敛为「带锚点的文本」

决策写在计划的 D2：

> **多格式架构 = 派生 Markdown + 来源定位符（sourceLocator）。** 不为每种格式泛化坐标系。转换层把一切收敛为「带标题的 Markdown 文本」，下游整条链路（切块 / 大纲 / 检索 / read 工具 / 引用验证）按原样工作；定位符只是 chunk 上的**展示与跳转元数据**，不参与检索与验证逻辑。

一句话：每个非纯文本文件被**确定性地**转换成一份派生 Markdown，外加一张「派生文本第几行 ↔ 原件哪个位置」的锚点表。派生 Markdown 存进索引库，之后被切块、被检索、被引用的都是它。

<figure class="diagram">
<svg viewBox="0 0 880 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="多格式数据流：知识库目录分成原生文本格式与派生格式两路，原生文本直接作为被索引的文本，派生格式经转换器产出派生 Markdown 与锚点表存入 derived_docs 表；两路汇合进入未经改动的标题感知切块器，chunk 的行区间与锚点表求交得到 locator，之后 FTS5 与向量入库、四件只读工具、引用验证全部零改动">
<defs>
<marker id="pa2f1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<rect x="0" y="0" width="880" height="500" fill="#ffffff"/>
<text x="440" y="28" text-anchor="middle" font-size="14" font-weight="700" fill="#25262b">八种格式，一条链路：转换层之后的一切都不知道格式的存在</text>

<rect x="28" y="56" width="180" height="86" rx="10" fill="#25262b"/>
<text x="118" y="80" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="700">本地知识库目录</text>
<text x="118" y="100" text-anchor="middle" font-size="10.5" fill="#d6d8de">扫描 · watcher · sha-256</text>
<text x="118" y="118" text-anchor="middle" font-size="10.5" fill="#d6d8de">判据只有一处：</text>
<text x="118" y="133" text-anchor="middle" font-size="10.5" fill="#d6d8de" font-family="monospace">formatForPath()</text>

<rect x="250" y="48" width="230" height="52" rx="9" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="365" y="68" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="700">原生文本格式</text>
<text x="365" y="87" text-anchor="middle" font-size="10.5" fill="#6b6e76">.md · .markdown · .txt　源文即文本</text>

<rect x="250" y="112" width="230" height="86" rx="9" fill="#f6f6f8" stroke="#25262b" stroke-width="1.6"/>
<text x="365" y="133" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="700">派生格式 → 转换器</text>
<text x="365" y="152" text-anchor="middle" font-size="10.5" fill="#6b6e76">.pdf · .docx · .xlsx · .pptx</text>
<text x="365" y="168" text-anchor="middle" font-size="10.5" fill="#6b6e76">.html · .png/.jpg/.jpeg/.webp</text>
<text x="365" y="188" text-anchor="middle" font-size="10.5" fill="#25262b">产出：派生 Markdown ＋ 锚点表</text>

<line x1="208" y1="88" x2="246" y2="74" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2f1-arrow)"/>
<line x1="208" y1="110" x2="246" y2="140" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2f1-arrow)"/>

<rect x="250" y="212" width="230" height="40" rx="8" fill="#ffffff" stroke="#e3e4e8" stroke-width="1.4"/>
<text x="365" y="237" text-anchor="middle" font-size="10.5" fill="#6b6e76" font-family="monospace">derived_docs 表（文本+锚点+版本）</text>
<line x1="365" y1="198" x2="365" y2="208" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2f1-arrow)"/>

<rect x="530" y="56" width="322" height="196" rx="10" fill="#ffffff" stroke="#25262b" stroke-width="1.6"/>
<text x="691" y="80" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">以下全部零改动（第一篇造的那套）</text>
<rect x="552" y="94" width="278" height="34" rx="7" fill="#25262b"/>
<text x="691" y="116" text-anchor="middle" font-size="11" fill="#ffffff">标题感知切块 · 行号精确到行</text>
<rect x="552" y="136" width="278" height="34" rx="7" fill="#ffffff" stroke="#9a9da6" stroke-width="1.3"/>
<text x="691" y="158" text-anchor="middle" font-size="11" fill="#25262b">FTS5 + 向量 · RRF 融合 · 精排</text>
<rect x="552" y="178" width="278" height="34" rx="7" fill="#ffffff" stroke="#9a9da6" stroke-width="1.3"/>
<text x="691" y="200" text-anchor="middle" font-size="11" fill="#25262b">四件只读工具 · 大纲 · 证据集</text>
<rect x="552" y="220" width="278" height="24" rx="6" fill="#f6f6f8" stroke="#e3e4e8" stroke-width="1"/>
<text x="691" y="236" text-anchor="middle" font-size="10.5" fill="#25262b" font-weight="600">引用验证：行区间 ∩ 证据区间（判据一个字没动）</text>
<line x1="480" y1="130" x2="526" y2="130" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2f1-arrow)"/>
<line x1="480" y1="74" x2="526" y2="90" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2f1-arrow)"/>

<rect x="150" y="292" width="580" height="66" rx="10" fill="#f6f6f8" stroke="#25262b" stroke-width="1.4"/>
<text x="440" y="315" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">唯一的新增计算：chunk 行区间 ∩ 锚点表 → locator</text>
<text x="440" y="336" text-anchor="middle" font-size="10.5" fill="#6b6e76" font-family="monospace">locatorForLineRange(anchors, startLine, endLine) → {kind:"page", page:12}</text>
<text x="440" y="352" text-anchor="middle" font-size="10.5" fill="#6b6e76">没有相交的锚点就返回 none —— 宁可不显示页码，也不显示一个猜的页码</text>
<line x1="365" y1="252" x2="365" y2="288" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2f1-arrow)"/>

<rect x="150" y="382" width="278" height="86" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="289" y="404" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="700">检索与验证看到的</text>
<text x="289" y="426" text-anchor="middle" font-size="10.5" fill="#6b6e76" font-family="monospace">报告.pdf#L338-L352</text>
<text x="289" y="446" text-anchor="middle" font-size="10.5" fill="#6b6e76">派生文本的行号，参与判定</text>
<text x="289" y="462" text-anchor="middle" font-size="10.5" fill="#6b6e76">——它不知道自己来自 PDF</text>

<rect x="452" y="382" width="278" height="86" rx="10" fill="#25262b"/>
<text x="591" y="404" text-anchor="middle" font-size="11.5" fill="#ffffff" font-weight="700">用户看到的</text>
<text x="591" y="426" text-anchor="middle" font-size="10.5" fill="#d6d8de">报告.pdf · 第 12 页</text>
<text x="591" y="446" text-anchor="middle" font-size="10.5" fill="#d6d8de">角标：由 PDF 提取</text>
<text x="591" y="462" text-anchor="middle" font-size="10.5" fill="#d6d8de">纯展示，不参与任何判定</text>
<line x1="330" y1="358" x2="300" y2="378" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2f1-arrow)"/>
<line x1="550" y1="358" x2="580" y2="378" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2f1-arrow)"/>
</svg>
<figcaption>转换层是唯一知道格式存在的地方；它之下的一切按 Markdown 原样工作</figcaption>
</figure>

这个架构的收益是可以逐条点名的：切块器零改动、大纲零改动、FTS5 与向量入库零改动、四件工具的输出契约零改动、**引用验证零改动**。新增的只有转换层本身，和一次「行区间与锚点求交」的计算。

而它的代价只有一条，但这一条必须说清楚。

### 2.1 行号与 locator 是两个量纲

派生文本的第 338 行，在原件里**不存在**。用户拿着这个数字去 PDF 里翻，翻不到。

这正是「可验证引用」的反面——一个看起来精确、实则指向虚空的坐标。所以 locator 不是锦上添花的展示优化，它是**必做项**：界面必须同时给出「第 12 页」与「由 PDF 提取」角标，把"你看到的文字是提取出来的、排版与原件有差异"这件事说明白。

这条纪律在三层各落一次，而且共用同一份文案（`describeSourceLocator` 放在契约层，因为三个进程都要说这句话）：

```ts
// packages/contracts/src/source.ts —— 定位符 → 给人看的短语
export function describeSourceLocator(locator: SourceLocator): string {
  switch (locator.kind) {
    case "none":  return "";
    case "page":  return locator.pageEnd > locator.page
      ? `第 ${locator.page}–${locator.pageEnd} 页` : `第 ${locator.page} 页`;
    case "sheet": { /* 「销售明细 · 第 137 行」 */ }
    case "slide": { /* 「第 3 页幻灯片」 */ }
  }
}
```

放在契约层而不是渲染层，是因为**三个进程都要说这句话**：Utility 的 `read_document` 要把它写进给模型看的头部、Renderer 的引用 chip 与来源面板要显示它。三处各写一份的结果必然是「第 12 页」「P12」「页 12」三种说法——而用户会以为那是三种不同的东西。

给模型看的那份长这样：

```
报告/年度总结.pdf#L338-L352 · 第 12 页 标题=第 12 页
（全文 1204 行，源文件 2841203 字节，修改于 2026-08-06T09:12:44.000Z）（由 PDF 提取）
---
（正文…）
```

头部同时给行号、页码、提取来源，三样都来自结构化字段而不是猜测。不这么写的后果很具体：模型会把 `#L338` 照抄给用户。

### 2.2 唯一的分岔：原生文本格式

架构里只保留了一个 if，写在 D10：

- **原生文本格式**（`.md` / `.markdown` / `.txt`）：源文件本身就是被切块、被引用、被预览的那份文本，**不进** `derived_docs`，行号与源文件逐行对应。
- **派生格式**（html / docx / xlsx / pptx / pdf / image）：经转换器产出派生 Markdown，行号指向派生文本。

留这个分岔是有理由的：`.txt` 的行号就是用户在自己编辑器里看到的行号。跳到第 42 行，看到的就是引用里的那一行——这是最强的可验证性，不该为了架构统一而放弃。

有意思的是 `.txt` **不需要**为它单开一条切块路径。它照走 `chunkMarkdown`：纯文本里恰好以 `#` 开头的行会被当成标题，后果只是多一层标题路径，行号一字不差。而为 txt 单开一条路会立刻产生第二份「哪一行属于哪一块」的判定——那才是真风险。

## 三、三处判定点收口：这次改造真正难的地方

架构图画完只用了半天，改造花掉的时间几乎全在一件事上：**找出所有"偷偷读源文件"的地方。**

改造前，"这个文件的正文是什么"这个问题在代码里有**三个**独立答案：

| 位置 | 干什么 | 对 PDF 会怎样 |
|---|---|---|
| `knowledge-tools` 的 `readKbFile` | Agent 读原文 | 读到二进制字节 |
| `agent-runtime/src/citation-slice.ts` | 引用摘要取数 | 读到二进制字节 |
| `apps/desktop/.../file-service.ts` | 界面引用预览 | 扩展名闸门直接拒绝 |

三处对 Markdown 都是对的，所以它们平安共存了整个第一版。而 chunk 的行号指的是**派生文本**的行号——于是同一条引用的"第 340 行"，在这三处会分别渲染成一堆乱码、一段错位的文字、和一个空预览。

**这三行是执行期勘察时补进计划表的。**原计划表只列了「引用验证」一行，而验证本身只比对行号区间，反而完全不用改。真正会读磁盘的那两处漏掉了。这件事本身值得记一笔：架构图上画得出来的东西通常不难，难的是那些没画在图上、却在运行时真的碰了文件系统的代码。

修法是把正文取数收口成一个端口：

```ts
// packages/knowledge-index/src/document-text.ts
export interface DocumentTextPort {
  read(relPath: string, options?: DocumentReadOptions): DocumentTextResult;
}
```

规则只有一条：原生文本格式读源文件，派生格式读 `derived_docs` 里**索引时刻**的派生文本。后者是关键——那是切块时用的同一份文本，与 chunk 行号恒一致；源文件之后被改动由 watcher 触发重索引，派生文本与 chunk 原子替换，不存在中间态。

这个端口有两个设计细节值得单独说，因为它们都是"看起来可以更优雅、实际上不能"的地方：

**它是同步的。** `agent-runtime` 的引用验证在 `agent_end` 的同步路径上产出结果，而底下两条路本来就都同步（`node:sqlite` 全同步、源文件是 `readFileSync`）。做成异步只会逼调用方在事件回调里 await。

**它返回结果类型而不抛异常。** 三个消费方要把失败翻译成三种完全不同的东西：工具要 `KnowledgeToolError` 加可枚举的 code，界面预览要一句不含绝对路径的中文，引用摘要要"静默返回 null 且不影响引用成立"。抛异常会逼它们去 match 消息文本。

同一条"收口"的思路还落在另外两处：

**扩展名判定**收进契约层的一张表。它其实是一条产品契约——同时决定扫描器扫什么、watcher 认什么、`list_knowledge_files` 列什么、`read_document` 读什么、界面预览允许打开什么。放在契约层还有个实际好处：扫描器不必为了认识 `.pdf` 而去依赖 pdfjs。

```ts
const EXTENSION_FORMATS: Readonly<Record<string, SourceFormat>> = {
  ".md": "markdown", ".markdown": "markdown", ".txt": "text",
  ".html": "html", ".htm": "html",
  ".docx": "docx", ".xlsx": "xlsx", ".pptx": "pptx", ".pdf": "pdf",
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
};
```

表里**没有** `.doc` / `.xls` / `.ppt`。老二进制 Office 格式的解析是无底洞，不在表内 = 扫描时按普通文件忽略，不产生错误记录——这是 D5 的范围裁剪在代码里的样子。

**增量索引的快路径**从「hash 未变即跳过」改成「hash 未变**且** parserVersion 未变」：

```ts
const unchanged =
  existing.mtimeMs === mtimeMs &&
  existing.contentHash === contentHash &&
  existing.parserVersion === parserVersion &&   // ← D6 新增
  (!derived || this.#store.hasDerivedDoc(relPath));
```

少了那一条会怎样：我升级 pdfjs、派生文本的行数变了，但源文件 hash 没变，于是快路径跳过重转换——用户手里的旧引用继续指向旧行号，而库里的文本已经是新的。**引用漂移不会报错，只会静静地指错地方。**

## 四、确定性：这套架构唯一会致命的失效模式

派生 Markdown 层有一个前提条件，整套设计都压在它上面：

> **同一份字节 + 同一个 `parserVersion` ⇒ 逐字节相同的派生 Markdown。**

一旦派生文本会漂移，已经发出去的引用就会指向不存在的行。这是唯一一种能让「可验证引用」这条命脉失效、而且**全程不报任何错**的方式。所以转换器有三条不可协商的纪律，写在 `types.ts` 的文件头，也写进了每个转换器的测试：

1. 输出里不许出现时间戳、随机 id、绝对路径、以及 `Map` 迭代序之外的不确定顺序；
2. 解析库版本在 `package.json` 里**锁死到补丁位**（`pdfjs-dist: "6.2.108"`、`mammoth: "1.12.0"`、`exceljs: "4.4.0"`——没有 `^`），升版本必须同时 bump `parserVersion`；
3. 每个转换器的测试都要有一条「同输入跑两遍，输出全等」的断言。

第 1 条比听起来更容易违反。举一个真实的例子：xlsx 的日期单元格，最自然的写法是 `value.toLocaleString()`——而它的输出**随时区变**。同一份表在北京和在洛杉矶索引出来的派生文本不同，两台机器上的同一条引用指向不同的行。所以这里必须是 `toISOString()`：

```ts
function primitiveToText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();  // 不是 toLocaleString
  // …
}
```

### 4.1 行号记账只允许有一处

锚点表有三条不变量：**覆盖全文、按 `startLine` 升序、区间互不重叠**。

六个转换器如果各自维护 `currentLine` 计数器，等于把同一段易错逻辑抄六遍。而这类 off-by-one 在测试里**极难被发现**：输出看起来完全正常，只是页码差一页。所以行号只在 `DerivedDocBuilder` 里加，转换器只说「接下来这些行属于第 3 页」：

```ts
export class DerivedDocBuilder {
  /** 开一个新的定位段：从下一行起的内容都归 locator。 */
  section(locator: SourceLocator): void {
    this.#closeSection();
    this.#open = { locator, startLine: this.#lines.length + 1 };
  }

  /** 追加一行。触顶后静默丢弃并记账 —— 说明由 finish 统一写出。 */
  appendLine(line = ""): void {
    if (this.#truncatedAt !== null) return;
    const cost = line.length + (this.#lines.length === 0 ? 0 : 1);
    if (this.#chars + cost > this.#maxChars) { this.#truncatedAt = this.#lines.length; return; }
    this.#pushLine(line);
  }

  #closeSection(): void {
    const endLine = this.#lines.length;
    // 没有显式 section() 就直接 append 的转换器（html/docx/image）在这里被兜住：
    // 补一条覆盖 1..N 的 none 锚点，"覆盖全文"这条不变量对所有转换器一致成立
    const open = this.#open ?? (endLine > 0 ? { locator: NO_SOURCE_LOCATOR, startLine: 1 } : null);
    this.#open = null;
    if (open === null || endLine < open.startLine) return;
    this.#anchors.push({ locator: open.locator, startLine: open.startLine, endLine });
  }
}
```

最后那个 `#closeSection` 的兜底是我比较满意的一处：HTML、docx、图片这三种格式的原件**没有比行号更细的坐标**，它们从不调 `section()`。与其要求每个转换器"记得写一条覆盖全文的 none 锚点"，不如让不变量在构造器里自动成立——**依赖纪律的地方越少，纪律被违反的次数越少。**

写这个 builder 时踩到过一个一行之差的坑，值得单独拿出来：

```ts
// pdf.ts 的分页循环
builder.appendBlankLine();                                  // ← 必须在前
builder.section({ kind: "page", page: pageNumber, ... });    // ← 必须在后
builder.appendLine(`## 第 ${pageNumber} 页`);
```

**先补分隔空行、再开新段**，空行因此归前一页。反过来写的话，切块器按 `##` 标题切出的 chunk 会把那一行空行算进上一页的块里，而它属于下一页的锚点——于是本该是「第 2 页」的引用会被合并成「第 2–3 页」。差一行，页码就不精确了；而这种错误在任何 diff 里都看不出来。

### 4.2 锚点求交：`none` 不投票

从 chunk 的行区间得出 locator 的规则有四条，其中第二条是唯一一条不显然的：

```ts
export function locatorForLineRange(anchors, startLine, endLine): SourceLocator {
  const overlapping = /* 与 [startLine, endLine] 有交集的锚点 */;
  if (overlapping.length === 0) return NO_SOURCE_LOCATOR;      // 规则 1：宁可不显示，也不猜

  // 规则 2：none 退出投票 —— 它的意思是"这几行没有比行号更细的坐标"，
  //         而不是"这几行没有坐标"，不该否决同一 chunk 里真实存在的页码
  const typed = overlapping.filter((e) => e.anchor.locator.kind !== "none");
  if (typed.length === 0) return NO_SOURCE_LOCATOR;

  const merged = mergeHomogeneousLocators(...);                // 规则 3：同类合并成区间
  return merged ?? /* 规则 4：重叠行数最多者胜 */;
}
```

规则 2 的场景来自 xlsx：`## 工作表名` 这行标题是 `none`（它是"这张表叫什么"，不是表里的第几行），紧随其后的数据行才带 sheet 坐标。而切块器会把标题与前几行数据切进同一个 chunk。不排除 `none` 的话，这个 chunk 会因为"异质"退化，用户看到的就是一个没有行号的裸引用——**明明有精确坐标，却因为一行标题丢掉了。**

规则 1 反过来也一样重要：锚点表有洞时，后果是"这段引用没有页码"，而**不是**"这段被标了错误的页码"。前者是可接受的降级，后者不是。

## 五、六个转换器，六种硬骨头

架构定完，剩下的是实打实的解析工作。挑几处有代表性的说。

### 5.1 PDF：绘制顺序不是阅读顺序

`getTextContent()` 给的是一堆带变换矩阵的文本片段，顺序是**绘制顺序**。直接拼接，一份双栏论文会变成：

> 左栏第一句 右栏第一句 / 左栏第二句 右栏第二句 …

两栏的句子交替穿插，整页语义被打散。而更糟的是**模型会照着这份文本引述出根本不存在的句子**——它拼出来的每一句都是"原文里有的字"，只是顺序被打乱了。这种输出比乱码危险得多，因为它看起来完全正常。

所以行重建是：**先分栏，再在每一栏内部按 y 聚行、行内按 x 排序**。

<figure class="diagram">
<svg viewBox="0 0 860 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PDF 双栏页面的处理：左侧是直接按绘制顺序拼接导致左右栏句子交错穿插的错误结果，右侧是先在页面中段 30% 到 70% 区间采样 40 个候选切线位置、取横跨片段最少者作为天沟，再按跨栏、左栏、右栏三组分别重建行的正确结果">
<defs>
<marker id="pa2f2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<rect x="0" y="0" width="860" height="330" fill="#ffffff"/>
<text x="430" y="26" text-anchor="middle" font-size="14" font-weight="700" fill="#25262b">分栏检测：找一条横跨片段最少的竖线</text>

<text x="200" y="56" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">不分栏 · 按 y 聚行的结果</text>
<rect x="60" y="70" width="280" height="120" rx="8" fill="#ffffff" stroke="#e3e4e8" stroke-width="1.4"/>
<text x="200" y="92" text-anchor="middle" font-size="10.5" fill="#6b6e76" font-family="monospace">检索层的成败不在于 而在于每一次改动</text>
<text x="200" y="112" text-anchor="middle" font-size="10.5" fill="#6b6e76" font-family="monospace">用了哪个向量库， 都能被一把尺子证伪</text>
<text x="200" y="132" text-anchor="middle" font-size="10.5" fill="#6b6e76" font-family="monospace">同一条基线上的左右两栏被并进同一行</text>
<text x="200" y="160" text-anchor="middle" font-size="11" fill="#25262b" font-weight="600">每个字都是原文里的字</text>
<text x="200" y="178" text-anchor="middle" font-size="11" fill="#25262b" font-weight="600">但没有一句是原文里的句</text>

<text x="640" y="56" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">先分栏 · 逐栏重建</text>
<rect x="500" y="70" width="280" height="120" rx="8" fill="#f6f6f8" stroke="#25262b" stroke-width="1.5"/>
<line x1="640" y1="88" x2="640" y2="182" stroke="#25262b" stroke-width="1.2" stroke-dasharray="4 3"/>
<text x="640" y="84" text-anchor="middle" font-size="9.5" fill="#25262b" font-family="monospace">天沟</text>
<rect x="512" y="92" width="256" height="16" rx="3" fill="#25262b"/>
<text x="640" y="104" text-anchor="middle" font-size="9.5" fill="#ffffff">① 跨栏组（标题 / 摘要）先输出</text>
<rect x="512" y="116" width="118" height="60" rx="4" fill="#ffffff" stroke="#9a9da6" stroke-width="1.2"/>
<text x="571" y="150" text-anchor="middle" font-size="10" fill="#25262b">② 整个左栏</text>
<rect x="650" y="116" width="118" height="60" rx="4" fill="#ffffff" stroke="#9a9da6" stroke-width="1.2"/>
<text x="709" y="150" text-anchor="middle" font-size="10" fill="#25262b">③ 整个右栏</text>

<line x1="345" y1="130" x2="495" y2="130" stroke="#9a9da6" stroke-width="1.5" marker-end="url(#pa2f2-arrow)"/>

<rect x="60" y="212" width="720" height="96" rx="10" fill="#f6f6f8" stroke="#e3e4e8" stroke-width="1"/>
<text x="420" y="234" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="700">三条准入，全过才切；认不出来就当单栏</text>
<text x="420" y="256" text-anchor="middle" font-size="10.5" fill="#6b6e76">① 页面片段 ≥ 8（少于此谈不上分栏）　② 横跨切线的片段 ≤ 20%（否则那是单栏的正常行）</text>
<text x="420" y="274" text-anchor="middle" font-size="10.5" fill="#6b6e76">③ 两侧各占 ≥ 25% 片段（否则只是一个居右的页码或边注）</text>
<text x="420" y="296" text-anchor="middle" font-size="10.5" fill="#25262b" font-weight="600">单栏文档被当双栏拦腰劈开，比双栏文档被当单栏顺序不佳，糟糕得多</text>
</svg>
<figcaption>在页面 30%–70% 区间采 40 个候选位置，取横跨片段最少的那条线</figcaption>
</figure>

算法本身不复杂：双栏页面在天沟处的横跨数接近 0，单栏页面在任何位置都有一大堆横跨，两者差得极远，根本不需要精细调参。真正花时间的是三条准入条件和那句「认不出来就当单栏」——**误判的两个方向代价完全不对称**，所有阈值都往保守一侧调。

PDF 这条路上还有几处，每一处都是被真实文件教出来的：

**中文之间不能补空格。** 行内拼接要靠 x 间距判断词边界，而字宽只能用「字高 × 字数」粗略近似——对方块字系统性偏小。不加 CJK 判断，「知识库」会被拆成「知 识 库」，而那恰好会把 FTS5 的 unigram 预处理（第一篇讲过）喂成一团噪声。

**康熙部首。** macOS 生成的 PDF 里，「一」有相当概率被编码成 `U+2F00 KANGXI RADICAL ONE`——肉眼完全一样，但**检索时是另一个字符**，用户搜「第一节」永远搜不到它。修法是只对康熙部首与 CJK 部首补充这两个区做 NFKC，而不对全文做：全文 NFKC 会把中文全角逗号「，」压成 ASCII 逗号，那是可见的排版劣化。

**页眉页脚只剔"逐字相同"的行。** 判据刻意保守——只剔逐字相同且出现在至少一半页面的行。带页码的页眉（「第 12 页 / 共 30 页」）因此剔不掉，那是有意的：要剔它就得做数字模糊匹配，而那条路上第一个受害者往往是正文里的编号条款。**留几行噪声用户看得见，删掉一句正文用户永远不知道。**

**每页一个 `## 第 N 页` 标题，不去猜文档自己的章节结构。** 从文本层猜标题只能靠字号与粗细的启发式，在中文排版、双栏论文上极不稳定。而猜错的代价不是"少一个标题"——`headingPath` 会进检索文本、会进引用展示，一棵编造的标题树会让模型引述一个原文里根本不存在的章节名。用页码当标题换来三个确定的好处：大纲直接变成页目录（对 PDF 恰恰最有用）、**chunk 永远不跨页**（定位符因此永远精确）、输出完全确定。代价是丢掉原文章节结构——已知且诚实的取舍。

### 5.2 XLSX：locator 最有价值的地方

表格没有标题层级可依，行号就是用户在 Excel 里唯一能定位的坐标。所以这里锚点取**最细粒度**：一个表格行 = 派生文本一行 = 一条锚点。

```ts
worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  // …取每一列的文本…
  builder.section({ kind: "sheet", sheet: title, rowStart: rowNumber, rowEnd: rowNumber });
  builder.appendLine(`| ${cells.join(" | ")} |`);
  if (emitted === 0) {
    builder.appendLine(`| ${Array(cells.length).fill("---").join(" | ")} |`);  // GFM 表头分隔行
  }
});
```

一张 2000 行的表会产出 2000 条锚点。看起来奢侈，但方向是对的：切块器按 2000 字切，一个 chunk 通常横跨几十行；若锚点按 50 行一块，引用就只能说"第 100–150 行"，而用户想要的是"第 137 行"。`locatorForLineRange` 会把 chunk 覆盖到的连续锚点合并成区间——**精度只会因为 chunk 变大而下降，不会因为锚点变粗而下降**，所以锚点取最细。

另外两处判断：**公式取计算值**（用户搜的是"营收 1200 万"，不是 `=SUM(B2:B13)`，取不到才落公式文本）；**单表 2000 行上限**，挡的是"整个数据库导出成 xlsx"——十万行明细进全文索引，除了把 BM25 的词频统计冲垮之外没有任何用处。

### 5.3 PPTX：文件名排序会让所有页码都错

`.pptx` 的文本抽取是自研的——用 jszip 解包之后直接对 XML 下手。JS 生态里没有维护良好的 pptx 文本提取库，而真正需要的只有一件事：**按顺序取出所有 `<a:t>` 文本 run**。那是 OOXML DrawingML 里唯一承载可见文字的元素，一条正则就够。自研百来行的收益是输出形态完全由自己决定，确定性不押在第三方身上。

但有一个坑必须提前知道：

```ts
/** ppt/presentation.xml 的 <p:sldIdLst> 按放映顺序列出 r:id，再经 rels 映射到文件 */
const SLIDE_ID_RE = /<p:sldId\b[^>]*r:id="([^"]+)"/g;
```

`ppt/slides/slide10.xml` 在字典序里排在 `slide2.xml` **前面**。按文件名排序会把第 10 页放到第 2 页之前——那意味着**所有页码都是错的**，而页码正是这个转换器唯一要产出的坐标。用户重排过幻灯片时，文件名与放映顺序更是彻底脱钩。

顺带一个共性细节：同一段落内的 run 必须**直接拼接**。Word 和 PPT 会因为改了一个字的颜色就把一句话拆成三个 run，中间插空格会把「知识库」变成「知 识 库」——和 PDF 那条是同一个病。

### 5.4 DOCX 与 HTML：标题树，以及别报错

**docx 的标题树是免费的**：mammoth 按 Word 的**样式**映射（`Heading 1` → `<h1>`），于是 turndown 产出 `#` / `##`，切块器、大纲、`read_document` 的 heading 模式直接就能用。代价是"手动加粗放大字号假装的标题"识别不出来——那是原文档的信息缺失，猜它只会造出一棵不存在的标题树。

不用 mammoth 自带的 `convertToMarkdown`，是因为它被上游标注为实验性且**不支持表格**，而 Word 文档里表格占比很高。绕道 HTML 还有个附带好处：html 与 docx 两条路产出的 Markdown 形态完全一致，下游只需要理解一种风格。

**html 的关键判断是"提不出来时降级，而不是报错"**：Readability 对短页面、纯列表页、单表格页会返回 null（它有最小字数阈值）。那些页面**依然是用户的资料**，不该因为"不像文章"就被踢出知识库，所以降级为整页 `<body>` 转换——噪声多一些，但内容不丢。

真正该报错的只有一种情况：**字节根本解不出文本**。这里的策略是先信 `<meta charset>` 声明、再信 UTF-8，最后按替换字符（U+FFFD）比例判定：

```ts
/** 超过 5% 即判定解码失败，而不是把一篇 30% 是问号的文本收进知识库 */
const MAX_REPLACEMENT_RATIO = 0.05;
```

阈值取 5% 不需要精调：正常文本里偶发的损坏字节远低于此，编码猜错时通常在 30% 以上，中间有很宽的安全带。**编码猜错的后果不是报错，是静默产出一整篇乱码**——那份乱码会照常被切块、被检索、被引用。

### 5.5 图片 OCR：为什么不上 ONNX

路线是 D4：**macOS 走系统 Vision 辅助二进制，其余平台 tesseract.js 兜底，明确不上 PaddleOCR / RapidOCR 的 onnxruntime 路线。**

否决 ONNX 的理由来自第一篇的坑三：`packages/local-models/src/embedder.ts` 的头注释记录过 onnxruntime 原生层在老机器上**静默崩溃**（退出码 5）的前科。那还只是个 384 维的小嵌入模型；OCR 模型重得多，而崩的是**整个 Utility 进程**——用户看到的是"应用突然不响应了"，不是"这张图没索引上"。

Vision 辅助二进制的协议刻意做得极简：**stdin 收图片字节，stdout 逐行吐识别结果**。不走临时文件（省一次落盘，也不给知识库内容留磁盘残留），不走 JSON（少一层解析，行本身就是我们要的结构）。整个 Swift CLI 约 60 行，构建期 swiftc 编译，electron-builder 作 extraResources 捆绑。

还有一条设计上的坚持：**引擎不可用是一等公民，不是异常。** 没装 Xcode、没有可写目录、断网——这些都很常见。此时图片文件走 `ConvertError("ocr_unavailable")` → `FileMeta.status="error"`，用户在索引错误列表里看到"OCR 引擎不可用"，而不是图片被静默跳过、然后困惑于"我明明放了截图进去为什么搜不到"。

同理，两个引擎都不可用时抛错而不是返回空文本：**空文本会让这张图以"识别出零个字"的姿态进索引，与"识别不了"是完全不同的两件事。**

## 六、三次把整个进程打死的事故

前面五节是"应该怎么做"。这一节是"实际发生了什么"——三次事故的共同点是：**单元测试全绿，应用起不来。**

### 6.1 事故一：tesseract 的 worker 脚本，在打包产物里不存在

现象：选中带图片的知识库，Utility 进程**当场退出**，索引进入崩溃-重启死循环。

根因：tesseract.js 起 worker 时用的是按它自己源码 `__dirname` 拼的相对路径。而本包在应用里被 electron-vite 打进 `out/chunks/`，于是它按 `apps/desktop/worker-script/node/index.js` 去找——找不到，`MODULE_NOT_FOUND` 在 **worker 引导线程里裸抛**，绕过一切 Promise 链，整个进程当场退出。

配方是 `createRequire` 从真实 node_modules 解析绝对路径：

```ts
export function resolveTesseractWorkerScript(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const packageJson = require.resolve("tesseract.js/package.json");
    const workerScript = join(dirname(packageJson), "src", "worker-script", "node", "index.js");
    return existsSync(workerScript) ? workerScript : null;
  } catch { return null; }
}
```

`createRequire` 按 Node 模块规则向上找真实 node_modules，**与调用方被打包到哪无关**。解析不到就返回 null → 引擎判「不可用」→ 图片进索引错误列表，这才是"OCR 失败不拖垮整轮索引"该有的降级。

还有一处顺手补的：`available()` 的探测里**也**要查这个脚本存不存在。把探测挡在 spawn 之前——worker 起来了才发现脚本不存在，那是杀进程的裸异常，捕不到。

### 6.2 事故二：pdfjs 以为自己在浏览器里

现象更阴险：索引库里 **6 个 PDF 全部报「文件可能已损坏」**，而同一个文件在命令行下转换完全正常。

查下去是两层：

**第一层，pdfjs 认错了自己的宿主。** 它在模块求值时算一个 `isNodeJS` 常量，判定式在 `process.versions.electron` 存在且 `process.type !== "browser"` 时得 false——它以为 Electron Utility Process 是有 DOM 的渲染进程。后果是模块顶层的 `new DOMMatrix()` 直接抛 `ReferenceError`（无 DOM 就没这个类）；就算垫上，`getDocument` 还会按浏览器路线要求 `workerSrc` 起 Web Worker，而不是走 Node 的进程内 fake worker。

**根子是判定，不是缺垫片。** 所以修法对准判定：

```ts
async function loadPdfjs() {
  installDomMatrixPolyfill();
  const typeDescriptor = Object.getOwnPropertyDescriptor(process, "type");
  if (typeDescriptor?.configurable) delete (process as { type?: unknown }).type;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } finally {
    // isNodeJS 已固化成常量，还原不影响后续行为
    if (typeDescriptor?.configurable) Object.defineProperty(process, "type", typeDescriptor);
  }
  // …
}
```

import 的一瞬把 `process.type` 摘掉（判定式里唯一可控的一项），让 pdfjs 走完整的 Node 适配路线；import 完成立即还原。纯 Node 环境（vitest、脚本）里 `process.type` 本就不存在，这段是无操作——这也解释了为什么单测里一切正常。

**第二层，workerSrc 的相对缺省值。** pdfjs 在 Node 下把它缺省设为 `"./pdf.worker.mjs"`，相对**运行时模块**。测试里模块就在 node_modules，隔壁真有这个文件；应用里本包被打进 `out/chunks/`，隔壁没有 → fake worker import 失败 → `getDocument` 抛错 → 被映射成「文件可能已损坏」，**全部 PDF 被误伤**。

和 tesseract 同一个病根、同一个配方：`createRequire` 钉绝对路径。

顺带记两个只有真实文件才教得会的：`destroy()` 挂在 `loadingTask` 上而不是 `document` 上（漏掉它，索引一个装满 PDF 的目录是几百 MB 的稳定泄漏）；不传 `wasmUrl` 的话 JBIG2 / JPEG2000 的图一律解不出来，pdfjs 只 warn 一句 "ignoring XObject" 就把图丢了——文字层提取不受影响，所以这个缺参数在纯文字管线里**潜伏了整个阶段没暴露**，直到开始做嵌入图片 OCR 才浮出来。

### 6.3 事故三：一个从没被用到的可选依赖，打死了整个应用

现象：`npm run dev` 起来后界面**全程白屏**，Utility 连续 5 次重启后判死：

```
Error: Could not resolve "canvas" imported by "linkedom". Is it installed?
[piagent] utility-event {"event":"host.fatal","error":{"code":"restart_exhausted"}}
```

根因也是两层，而第二层才是真问题：

1. **打包层**：`linkedom` 把 `canvas` 声明为 optional peer，自己带了兜底 `try { require("canvas") } catch { require("./canvas-shim.cjs") }`。但打包器会把未安装的 optional peer 换成一个**求值即抛**的存根，而那句 throw 发生在模块图求值阶段，**早于** try 块执行——兜底根本没机会跑。
2. **架构层**：六个解析库全在模块顶层静态 import，于是 `createDefaultConverters()` 一被调用就把它们全拉进 Utility 的**启动路径**。

于是——**一个"图片渲染"的可选依赖，打死了一个根本不渲染图片的知识库应用。**

<figure class="diagram">
<svg viewBox="0 0 860 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="懒加载前后的爆炸半径对比：改造前六个解析库在模块顶层静态导入，任一加载失败都在 Utility 启动路径上炸掉整个进程，界面白屏，utility 入口 14.25 MB；改造后解析库改为内联动态 import，加载失败转成 ConvertError 落进单文件容错通道，只影响那一个文件，utility 入口 311 KB">
<rect x="0" y="0" width="860" height="300" fill="#ffffff"/>
<text x="430" y="26" text-anchor="middle" font-size="14" font-weight="700" fill="#25262b">同一个错误，两种爆炸半径</text>

<rect x="40" y="50" width="360" height="210" rx="10" fill="#ffffff" stroke="#25262b" stroke-width="1.5"/>
<text x="220" y="74" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">改造前 · 模块顶层静态 import</text>
<rect x="62" y="88" width="316" height="30" rx="6" fill="#25262b"/>
<text x="220" y="108" text-anchor="middle" font-size="10.5" fill="#ffffff" font-family="monospace">createDefaultConverters()</text>
<text x="220" y="136" text-anchor="middle" font-size="10.5" fill="#6b6e76">→ pdfjs · mammoth · exceljs · linkedom · turndown</text>
<text x="220" y="153" text-anchor="middle" font-size="10.5" fill="#6b6e76">全部进入 Utility 启动路径</text>
<rect x="62" y="166" width="316" height="34" rx="6" fill="#f6f6f8" stroke="#e3e4e8" stroke-width="1.2"/>
<text x="220" y="187" text-anchor="middle" font-size="10.5" fill="#25262b">任一加载失败 → 模块求值阶段崩 → 退避重启 ×5 → 判死</text>
<text x="220" y="222" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="700">爆炸半径 = 整个进程（界面全程白屏）</text>
<text x="220" y="244" text-anchor="middle" font-size="10.5" fill="#6b6e76" font-family="monospace">utility 入口 14.25 MB</text>

<rect x="460" y="50" width="360" height="210" rx="10" fill="#f6f6f8" stroke="#25262b" stroke-width="1.5"/>
<text x="640" y="74" text-anchor="middle" font-size="12" fill="#25262b" font-weight="700">改造后 · 内联动态 import</text>
<rect x="482" y="88" width="316" height="30" rx="6" fill="#25262b"/>
<text x="640" y="108" text-anchor="middle" font-size="10.5" fill="#ffffff" font-family="monospace">loadParser("Excel", () =&gt; import("exceljs"))</text>
<text x="640" y="136" text-anchor="middle" font-size="10.5" fill="#6b6e76">解析库只在真的遇到那种文件时才加载</text>
<text x="640" y="153" text-anchor="middle" font-size="10.5" fill="#6b6e76">失败 → ConvertError → 单文件容错通道</text>
<rect x="482" y="166" width="316" height="34" rx="6" fill="#ffffff" stroke="#9a9da6" stroke-width="1.2"/>
<text x="640" y="187" text-anchor="middle" font-size="10.5" fill="#25262b">FileMeta{status:"error"} · 其余文件照常入库</text>
<text x="640" y="222" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="700">爆炸半径 = 这一个文件</text>
<text x="640" y="244" text-anchor="middle" font-size="10.5" fill="#6b6e76" font-family="monospace">utility 入口 311 KB</text>
</svg>
<figcaption>把解析库挪出启动路径，同一个加载失败从"整个进程"缩到"这一个文件"</figcaption>
</figure>

修法两条：解析库一律懒加载，`canvas` 别名到仓库自带的 stub。

```ts
/**
 * @param load 动态 import 的 thunk。**必须写成内联的 `() => import("…")`** ——
 *             打包器靠静态分析这个字面量来切出独立 chunk，套一层变量就切不出来了。
 */
export async function loadParser<T>(label: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    throw new ConvertError("unsupported", `${label} 解析器在本机加载失败，该文件未被索引：…`);
  }
}
```

顺带的收益是启动成本：utility 入口从 **14.25 MB 降到 311 KB**，而绝大多数用户的知识库里一个 PDF 都没有。

**但这次事故真正的教训在防线上。** 事故发生时，knowledge-convert 的 57 个用例**全绿**——因为单测直接 import 源码，永远走不到打包与进程启动那条路。所以补的不是更多单测，是两道**读文件**的检查：

- 一条断言 `src` 下没有任何文件静态 import 重解析库（放过 `import type` 与 `() => import()`），并**反证**每个重依赖确实以动态形态出现过。已实测：退回静态导入即判红，还原即绿。
- 冒烟脚本增两条产物形态检查：产物里不许出现"未解析依赖的抛错存根"；utility 入口 < 1 MB（事故时 14 MB，修好后 0.3 MB，阈值离两边都远）。

两条都是纯文件读取，不依赖冷启动 stdout。**测试要跑在缺陷所在的那一层**——这三次事故的缺陷全在打包与进程启动层，而那一层此前一个断言都没有。

### 6.4 一个不算事故的事故：报告里的数字过期了

改造完跑评估，闸门 34/34、观察 15/23。而上一版报告记的是「闸门 33/33、观察 17/22」——观察题**掉了两道**。

第一反应当然是"多格式改造弄坏了什么"。但查下去不是：那组 17/22 生成于几次检索相关提交**之后没有重跑**。我用 `git worktree` 在未改动的 HEAD 上原样重跑同一份题库，得到的是 **14/22**，而且 `data-07` / `team-09` / `team-12` 三题在那里也是失败的。

换句话说，多格式改造的净变化只有：题库 +2（均通过）、语料 +1 个 `.txt` 文件。**33/33 → 34/34、14/22 → 15/23，没有任何一题由通过转为失败。**

这件事写进了报告的差异说明。它值得记一笔的原因是：**一份没有重跑过的基线报告，比没有报告更危险**——它会让你把自己的改动归因到一个根本不存在的回归上，然后花两天去"修"一个别人早就改过的东西。

## 七、还欠缺什么

诚实地列这一版留下的洞：

- **扫描版 PDF（无文本层）不支持。** 需要 pdfjs 在 Node 侧渲染位图，牵出 node-canvas 原生依赖，与"不引原生依赖"的取舍相悖。当前是诚实地落进「索引错误」列表并区分「已加密」与「疑似扫描件」——**两件事用户的应对完全不同**，不能合并成一句"解析失败"。
- **docx / pptx 的内嵌图片还没 OCR。** PDF 的一期已经落地（下一节），docx / pptx 是二期。当前 docx 的图片被替换成 `[图片]` 占位——用户在预览里看得出"这里原本有张图"，但内容确实没进索引。
- **双栏 PDF 只承诺段落级顺序。** 跨栏脚注会被提到页面前部（跨栏组先输出），这是已知的次要瑕疵。
- **带页码的页眉剔不掉。** 见 5.1 的取舍。
- **Vision 的确定性有一个豁口。** 同机同 macOS 版本输出确定，跨大版本可能漂移。这是接受并记录了的——`parserVersion` 管不到系统框架的版本。
- **表格进 FTS5 的检索效果没有单独评估。** xlsx 派生出的 GFM 表格在 BM25 下表现如何（大量竖线与短单元格对词频统计的影响），当前只有"引用能落到第几行"的验收，没有独立的检索质量档。
- **`.doc` / `.xls` / `.ppt` 老二进制格式不做**，Windows 平台的第三个 OCR 实现（`Windows.Media.Ocr`）也还没写——接口是留好的，`OcrEngine` 全链路无一行平台专属逻辑。

## 八、下一步：嵌入图片，以及为什么 GraphRAG 被否决

多格式落地之后立刻暴露了一个新问题，而它是被一本真实的书教出来的。

《基于大模型的 RAG 应用开发与优化》，523 页、40 万字符，文本层提取完整。但第 44 页的 curl 示例是一张**嵌入截图**——文字层里没有它。检索不到、Agent 无从决策、问答答不出来。

**最阴险的地方是：正文里提到过 curl，显得"读过了"，实际内容静默缺失。**

这件事确立了一条判断：**检索不到的内容，Agent 根本不知道它存在。** 关键词只活在图片里时，FTS 和向量永远不会召回那一页；Agent 只能对"已定位的页"深挖，无法对"从未见过的内容"做决策。所以索引时 OCR 打底是地基，agentic 深挖是补充。

一期（PDF 嵌入图片）已经写完，形态是：逐页 `getOperatorList()` 抽已解码像素 → `node:zlib` 手工打包最小 PNG（无新依赖，输出确定）→ 串行喂 OCR → 识别文字以 `【图片 N】` 紧跟该页正文，锚点仍是整页。过滤规则防花边图标灌噪声：小于 64px 跳过、每页按面积取前 8 张、整册上限 200 张、同内容哈希整册只识别一次、出现在半数以上页面的图判为装饰（logo 水印，与剔页眉页脚同哲学）。

有一条纪律是从头就定死的：**必须转换时同步 OCR，禁止"先入库后补图"。** 派生文本一旦入库，后补内容会改行号，已发引用全部漂移。代价是带图大文档索引变慢（Vision 约 0.2–0.5 秒/张），进度可见，**不加开关**——一个"要不要 OCR"的开关等于让同一份文档有两种派生文本。

同期还有一个被否决的方向值得记录：**GraphRAG 暂不接入。**

否决它的不是工作量，是三条：

1. **一票否决当前接入**：图谱建自"已提取的文本"，而提取层的洞（比如上面那张截图）图谱永远不含——对"图里的字答不出"这个目标零帮助。**提取层先行。**
2. **隐私姿态反转**：建图需要把每个 chunk 过一遍 LLM 抽实体关系，等于全库上传服务商，与「只有检索命中的片段出网」这条承诺冲突，只能显式 opt-in。
3. **引用纪律**：社区摘要与图节点是模型的二手转述，按既有纪律不进证据集。

将来真要接，正确定位是**检索路由器**——帮 Agent 决定读哪些文档，回答仍然引用真实行号。这个位置不与任何一条现有纪律冲突。

## 九、小结

这一版最值得带走的三条：

**第一，扩展格式的正确姿势是"收敛"而不是"泛化"。** 面对八种坐标系，加八个字段是最直觉的路，而它会让引用验证从一条判据裂成八条。把一切压回「带锚点的 Markdown」之后，下游整条链路一行未改——**新格式的成本从"改整条链路"降到"写一个转换器"**，这才是这套架构真正的收益。

**第二，这套架构的命门是确定性，而它失效时不报错。** 版本没锁、忘了 bump `parserVersion`、用了 `toLocaleString()`——这三件事的后果都是引用静静地指向不存在的行。所以纪律要么写进类型（`Converter.parserVersion` 是必填字段），要么写进构造器（行号只在 `DerivedDocBuilder` 里加），要么写进测试（同输入跑两遍必须逐字节相同）。**指望自己记得，等于没有纪律。**

**第三，三次把进程打死的事故全部发生在打包与进程启动层，而那一层此前一个断言都没有。** 单测直接 import 源码，永远走不到那条路；57 个用例全绿的同时，应用连界面都渲染不出来。补上的两道防线——静态导入形态检查、产物体积阈值——都不是常规意义上的"测试"，它们只是读文件。但它们跑在缺陷真正所在的那一层。

第一篇的结尾我写过：那些坑没有一个是在设计阶段能想到的，但每一个都是在有 trace、有基准的前提下能被定位的。这一篇要补一句：**当缺陷发生在你的测试根本不经过的那一层时，trace 和基准也救不了你——得先把断言放到那一层去。**
