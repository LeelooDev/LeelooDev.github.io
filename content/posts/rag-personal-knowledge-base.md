---
title: 目标：做出一个 RAG 个人知识库
date: 2026-06-26T13:00:00
category: code
tags: [RAG, AI, Embedding, 向量数据库, Python]
cover: /images/rag-personal-knowledge-base-cover.jpg
coverAlt: 高处俯拍的峡谷土路与河道纹理，一辆车停在转弯处
excerpt: 接着 AI API 入门之后，第二个最适合 iOS 开发者的项目是 RAG 个人知识库：上传 PDF / Markdown，自动切片、生成 embedding、写入向量库，再用 Top-K、Rerank、Hybrid Search 和引用来源生成可信回答。
dek: 不要只学 RAG 理论。这一篇直接按一个可运行 Demo 的方式拆开：文档解析、切片、embedding、向量检索、重排、引用、反幻觉和多用户隔离。
---

> 上一篇我们把目标定在「iOS App -> 后端 API -> LLM API -> 流式回答」。这一篇继续往前走：做一个真正能放进产品里的 **RAG 个人知识库**。如果你本来就想做个人知识库产品，这个方向非常适合你，因为它同时练到后端 API、文件处理、检索系统、模型调用和前端引用展示。

## 一、先把目标说死：不是聊天机器人，是可追溯的知识库

RAG，全称 Retrieval-Augmented Generation，直译是「检索增强生成」。不要被名词吓到，它本质上是一条很朴素的工程链路：

1. 用户上传 PDF / Markdown。
2. 后端把文档解析成纯文本和结构化元数据。
3. 系统把文本切成 chunk。
4. 每个 chunk 生成 embedding。
5. embedding 和 chunk 元数据写入向量数据库。
6. 用户提问时，系统先检索相关片段。
7. 模型只基于这些片段回答。
8. 答案带引用，告诉用户每句话来自哪份文档、哪一页、哪一段。

这和普通聊天机器人最大的区别是：**普通聊天依赖模型记忆，RAG 依赖你的资料库。** 面试官问 RAG，不是在问你会不会调模型，而是在问你会不会把「文档 -> 检索 -> 证据 -> 回答」做成一个可靠系统。

<figure class="diagram">
<svg viewBox="0 0 860 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="RAG 个人知识库从上传到回答的完整流水线" overflow="hidden">
<defs>
<marker id="rag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8b9099"/></marker>
</defs>
<text x="430" y="30" text-anchor="middle" font-size="15" font-weight="700" fill="#25262b">RAG 个人知识库：写入链路 + 查询链路</text>
<rect x="42" y="72" width="122" height="54" rx="10" fill="#25262b"/>
<text x="103" y="95" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700">上传文档</text>
<text x="103" y="113" text-anchor="middle" font-size="11" fill="#d6d8de">PDF / Markdown</text>
<rect x="202" y="72" width="122" height="54" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="263" y="95" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">文档解析</text>
<text x="263" y="113" text-anchor="middle" font-size="11" fill="#6b6e76">文本 / 页码 / 标题</text>
<rect x="362" y="72" width="122" height="54" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="423" y="95" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">Chunk 切片</text>
<text x="423" y="113" text-anchor="middle" font-size="11" fill="#6b6e76">语义完整 + overlap</text>
<rect x="522" y="72" width="122" height="54" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="583" y="95" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">Embedding</text>
<text x="583" y="113" text-anchor="middle" font-size="11" fill="#6b6e76">文本 -> 向量</text>
<rect x="682" y="72" width="122" height="54" rx="10" fill="#25262b"/>
<text x="743" y="95" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700">向量数据库</text>
<text x="743" y="113" text-anchor="middle" font-size="11" fill="#d6d8de">vector + metadata</text>
<g stroke="#8b9099" stroke-width="1.6" marker-end="url(#rag-arrow)">
<line x1="164" y1="99" x2="199" y2="99"/>
<line x1="324" y1="99" x2="359" y2="99"/>
<line x1="484" y1="99" x2="519" y2="99"/>
<line x1="644" y1="99" x2="679" y2="99"/>
</g>
<rect x="42" y="248" width="122" height="54" rx="10" fill="#25262b"/>
<text x="103" y="271" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700">用户提问</text>
<text x="103" y="289" text-anchor="middle" font-size="11" fill="#d6d8de">自然语言 query</text>
<rect x="202" y="248" width="122" height="54" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="263" y="271" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">Query 改写</text>
<text x="263" y="289" text-anchor="middle" font-size="11" fill="#6b6e76">关键词 / 同义词</text>
<rect x="362" y="248" width="122" height="54" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="423" y="271" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">Top-K 检索</text>
<text x="423" y="289" text-anchor="middle" font-size="11" fill="#6b6e76">dense + sparse</text>
<rect x="522" y="248" width="122" height="54" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="583" y="271" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">Rerank</text>
<text x="583" y="289" text-anchor="middle" font-size="11" fill="#6b6e76">去干扰 / 排证据</text>
<rect x="682" y="248" width="122" height="54" rx="10" fill="#25262b"/>
<text x="743" y="271" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700">带引用回答</text>
<text x="743" y="289" text-anchor="middle" font-size="11" fill="#d6d8de">答案 + source ids</text>
<g stroke="#8b9099" stroke-width="1.6" marker-end="url(#rag-arrow)">
<line x1="164" y1="275" x2="199" y2="275"/>
<line x1="324" y1="275" x2="359" y2="275"/>
<line x1="484" y1="275" x2="519" y2="275"/>
<line x1="644" y1="275" x2="679" y2="275"/>
</g>
<path d="M 743 126 C 798 164 798 210 743 246" fill="none" stroke="#8b9099" stroke-width="1.5" marker-end="url(#rag-arrow)"/>
<text x="790" y="188" font-size="11" fill="#6b6e76" transform="rotate(90 790 188)">检索时读取</text>
<text x="430" y="362" text-anchor="middle" font-size="12" fill="#6b6e76">写入链路决定资料能不能被找回；查询链路决定回答能不能可信。RAG 的难点通常不在模型，而在中间这两条链路。</text>
</svg>
<figcaption>图 1：RAG 不是单次模型调用，而是「写入链路」和「查询链路」两套工程系统。</figcaption>
</figure>

## 二、你要学什么：按 Demo 的目录来学

不要把 RAG 学成概念背诵。你可以直接按一个小 Demo 的目录拆能力：

```text
rag-knowledge-base/
  app/
    main.py              # FastAPI 接口
    parsers.py           # Markdown / PDF 文档解析
    chunking.py          # Chunk 切片
    embeddings.py        # 调 embedding 模型
    vector_store.py      # 向量数据库写入和检索
    retrieval.py         # Top-K / Hybrid Search / Rerank
    answer.py            # 基于片段回答并返回引用
    schemas.py           # Pydantic 输入输出结构
```

最小接口也很明确：

```text
POST /documents/upload      上传 PDF / Markdown
POST /documents/ingest      解析、切片、embedding、入库
POST /ask                   提问、检索、重排、回答
GET  /documents             当前用户文档列表
DELETE /documents/{id}      删除当前用户文档及 chunk
```

这个 Demo 做完，你就能在面试里讲清楚 RAG 的全流程，而不是只说「把知识库放进向量数据库」。

## 三、文档解析：先保住结构，再谈智能

很多 RAG 项目召回差，第一步就错了：PDF 一解析，页码没了；Markdown 一转文本，标题层级没了；表格被打散；代码块被混进普通段落。后面 embedding 再强，也只能检索一堆坏材料。

解析阶段要保留这些元数据：

- `tenant_id`：租户或用户隔离。
- `document_id`：文档 ID。
- `source_name`：原始文件名。
- `page`：PDF 页码，Markdown 可以为空。
- `heading_path`：Markdown 标题路径，例如 `第二章 > API 鉴权`。
- `block_type`：paragraph、table、code、list。
- `text`：清理后的正文。

一个够用的解析结构：

```python
from dataclasses import dataclass

@dataclass
class ParsedBlock:
    document_id: str
    source_name: str
    text: str
    page: int | None = None
    heading_path: list[str] | None = None
    block_type: str = "paragraph"
```

Markdown 解析可以先从简单规则开始：标题更新 `heading_path`，空行分段，代码块单独保留。

```python
from pathlib import Path

def parse_markdown(path: str, document_id: str) -> list[ParsedBlock]:
    source_name = Path(path).name
    blocks: list[ParsedBlock] = []
    headings: list[str] = []
    buffer: list[str] = []
    in_code = False

    def flush(block_type: str = "paragraph"):
        nonlocal buffer
        text = "\n".join(buffer).strip()
        if text:
            blocks.append(
                ParsedBlock(
                    document_id=document_id,
                    source_name=source_name,
                    text=text,
                    heading_path=headings.copy(),
                    block_type=block_type,
                )
            )
        buffer = []

    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.startswith("```"):
            if in_code:
                buffer.append(line)
                flush("code")
                in_code = False
            else:
                flush()
                buffer.append(line)
                in_code = True
            continue

        if in_code:
            buffer.append(line)
            continue

        if line.startswith("#"):
            flush()
            level = len(line) - len(line.lstrip("#"))
            title = line[level:].strip()
            headings = headings[: level - 1] + [title]
            continue

        if not line.strip():
            flush()
        else:
            buffer.append(line)

    flush("code" if in_code else "paragraph")
    return blocks
```

PDF 先用 PyMuPDF 做文本抽取，不要一开始就做 OCR。OCR、表格抽取、版面理解都很有价值，但不是第一版 Demo 的核心。

```python
import fitz  # pip install pymupdf

def parse_pdf(path: str, document_id: str) -> list[ParsedBlock]:
    source_name = Path(path).name
    blocks: list[ParsedBlock] = []
    doc = fitz.open(path)

    for page_index, page in enumerate(doc, start=1):
        text = page.get_text("text").strip()
        for paragraph in text.split("\n\n"):
            paragraph = paragraph.strip()
            if paragraph:
                blocks.append(
                    ParsedBlock(
                        document_id=document_id,
                        source_name=source_name,
                        page=page_index,
                        text=paragraph,
                    )
                )

    return blocks
```

第一版不要追求「什么 PDF 都完美」。你先把文字型 PDF 和 Markdown 做稳定，遇到扫描件再加 OCR，遇到表格再加专门解析器。**RAG 的工程原则是：先让可控文档稳定，再扩大输入范围。**

## 四、Chunk 切片：切片大小怎么选？

切片不是简单按字符数硬切。切太小，语义不完整；切太大，检索命中后塞进模型的噪声太多。

可以先用这组默认值：

- 普通知识库文档：`400-800 tokens`。
- 技术教程、长段解释：`700-1200 tokens`。
- API 文档、FAQ、规章制度：尽量按标题、条款、问答单元切，不要只按长度切。
- overlap：`10%-20%`，例如 600 tokens 的 chunk 用 80-120 tokens overlap。

为什么不是越大越好？因为 Top-K 检索返回的是 chunk，不是句子。一个 2000 tokens 的 chunk 即使命中，也可能只有其中 80 tokens 与问题相关，其余都是干扰。为什么不是越小越好？因为很多答案需要上下文，例如「它」指代谁、「这个限制」属于哪一节，切太碎会丢信息。

一个实用切片策略是：**先按结构切，再按 token 长度合并或拆分。**

```python
import tiktoken

enc = tiktoken.get_encoding("cl100k_base")

def token_len(text: str) -> int:
    return len(enc.encode(text))

def split_text(text: str, max_tokens: int = 700, overlap_tokens: int = 100) -> list[str]:
    tokens = enc.encode(text)
    if len(tokens) <= max_tokens:
        return [text]

    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + max_tokens, len(tokens))
        chunk = enc.decode(tokens[start:end]).strip()
        if chunk:
            chunks.append(chunk)
        if end == len(tokens):
            break
        start = max(0, end - overlap_tokens)
    return chunks
```

再把 `ParsedBlock` 合并成 chunk：

```python
from dataclasses import dataclass
from uuid import uuid4

@dataclass
class Chunk:
    chunk_id: str
    document_id: str
    source_name: str
    text: str
    page: int | None
    heading_path: list[str]
    chunk_index: int

def build_chunks(blocks: list[ParsedBlock], max_tokens: int = 700) -> list[Chunk]:
    chunks: list[Chunk] = []

    for block in blocks:
        prefix = ""
        if block.heading_path:
            prefix = " > ".join(block.heading_path) + "\n\n"
        text = prefix + block.text

        for part in split_text(text, max_tokens=max_tokens):
            chunks.append(
                Chunk(
                    chunk_id=str(uuid4()),
                    document_id=block.document_id,
                    source_name=block.source_name,
                    text=part,
                    page=block.page,
                    heading_path=block.heading_path or [],
                    chunk_index=len(chunks),
                )
            )

    return chunks
```

面试里如果问「切片大小怎么选」，不要回答一个死数字。更好的回答是：

> 我会先按文档结构切，再把 chunk 控制在 400-800 tokens，保留 10%-20% overlap。然后用一组真实问题评测 recall@k 和答案引用质量。如果召回缺上下文，就增大 chunk 或加 parent chunk；如果 Top-K 噪声太多，就减小 chunk、加 rerank 或加 metadata filter。

这说明你知道切片是实验参数，不是玄学参数。

## 五、Embedding：把文本变成可检索的向量

Embedding 的作用是把文本映射成一组数字向量，让语义接近的内容在向量空间里更近。比如「续费失败怎么办」和「付款没有成功」字面不同，但 embedding 后可能距离很近。

OpenAI 的 Embeddings API 可以直接把文本转成向量；第一版 Demo 只要封装一个函数：

```python
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
EMBED_MODEL = os.getenv("EMBED_MODEL", "text-embedding-3-small")

def embed_texts(texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(
        model=EMBED_MODEL,
        input=texts,
    )
    return [item.embedding for item in response.data]
```

工程上要注意四件事：

- **批量生成**：不要一个 chunk 调一次接口，先按 50-100 个 chunk 一批。
- **保存模型名**：chunk 元数据里记录 embedding 模型，未来换模型要能重建索引。
- **失败可重跑**：ingest 要做成幂等，某批 embedding 失败可以重试，不要整份文档全废。
- **不要混用不同维度**：同一个向量集合里不要混不同 embedding 维度。

embedding 不是魔法。它擅长语义相似，但对精确关键词、编号、函数名、错误码不一定稳。这就是后面要加 Hybrid Search 的原因。

## 六、向量数据库：第一版选 Qdrant，生产再按场景换

向量数据库做三件事：

1. 存向量。
2. 存 chunk 原文和元数据。
3. 根据 query 向量找相似 chunk，并支持 metadata filter。

你可以用 Chroma 快速试验，也可以用 PostgreSQL + pgvector 做一体化存储。这里用 Qdrant 讲 Demo，因为它本地 Docker 容易启动，而且 payload filter、hybrid search、多租户隔离都比较清晰。

启动：

```bash
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
pip install qdrant-client openai fastapi uvicorn pymupdf tiktoken
```

创建 collection：

```python
from qdrant_client import QdrantClient, models

qdrant = QdrantClient(url="http://127.0.0.1:6333")
COLLECTION = "personal_knowledge"
VECTOR_SIZE = 1536  # text-embedding-3-small 默认维度

def ensure_collection():
    if not qdrant.collection_exists(COLLECTION):
        qdrant.create_collection(
            collection_name=COLLECTION,
            vectors_config=models.VectorParams(
                size=VECTOR_SIZE,
                distance=models.Distance.COSINE,
            ),
        )
```

写入 chunk：

```python
def upsert_chunks(tenant_id: str, chunks: list[Chunk]):
    vectors = embed_texts([c.text for c in chunks])

    points = []
    for chunk, vector in zip(chunks, vectors):
        points.append(
            models.PointStruct(
                id=chunk.chunk_id,
                vector=vector,
                payload={
                    "tenant_id": tenant_id,
                    "document_id": chunk.document_id,
                    "source_name": chunk.source_name,
                    "page": chunk.page,
                    "heading_path": chunk.heading_path,
                    "chunk_index": chunk.chunk_index,
                    "text": chunk.text,
                    "embedding_model": EMBED_MODEL,
                },
            )
        )

    qdrant.upsert(collection_name=COLLECTION, points=points)
```

这里 `tenant_id` 不只是字段，而是安全边界的一部分。后面所有查询都必须带它。

## 七、Top-K 检索：先拿回候选，再谈回答

用户提问时，先把 query 也转成 embedding，然后查向量库：

```python
def search_top_k(tenant_id: str, question: str, k: int = 8):
    query_vector = embed_texts([question])[0]

    return qdrant.search(
        collection_name=COLLECTION,
        query_vector=query_vector,
        limit=k,
        query_filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="tenant_id",
                    match=models.MatchValue(value=tenant_id),
                )
            ]
        ),
        with_payload=True,
    )
```

Top-K 是最容易被误解的参数。`k=3` 看起来干净，但可能漏证据；`k=20` 看起来保险，但噪声会挤占上下文。第一版可以这样定：

- 先 dense search 取 `top_k=12`。
- 用 rerank 重新排序。
- 最终给模型 `top_n=4-6` 个片段。

面试里如果问「Top-K 有干扰怎么办」，不要说「调小 K」。更完整的回答是：

> 我会把 Top-K 分成候选召回和最终上下文两步。第一步 K 可以大一点，比如 12 或 20，提高 recall；第二步用 rerank、metadata filter、MMR 去重和分数阈值，压到 4-6 个高质量片段再给模型。这样不牺牲召回，也减少干扰。

## 八、RAG 召回不准怎么办？

召回不准通常不是一个原因。你要按层排查：

1. **文档解析坏了**：PDF 页码丢失、标题丢失、表格乱序。
2. **切片坏了**：chunk 太大有噪声，太小缺上下文。
3. **query 太短**：用户问「这个怎么配」，没有关键词。
4. **embedding 不适合精确匹配**：错误码、函数名、产品编号这种更适合关键词搜索。
5. **metadata filter 缺失**：用户问某个项目，但检索到了另一个项目的文档。
6. **Top-K 后没有 rerank**：候选里有相关片段，但顺序靠后。

可以按这个优先级修：

- 加 `document_id`、`tag`、`project_id` 过滤。
- 给 query 做改写，补全用户问题里的指代。
- 加 Hybrid Search，把向量检索和关键词检索合并。
- 候选取大一点，再 rerank。
- 建立测试集，用 recall@k 而不是感觉评估。

一个简单的 query 改写 prompt：

```python
def rewrite_query_for_search(question: str, recent_context: str = "") -> str:
    prompt = f"""
你要把用户问题改写成适合知识库检索的查询句。
要求：
1. 补全指代，但不要编造文档里没有的实体。
2. 保留专业术语、错误码、函数名。
3. 输出一行检索查询，不要解释。

最近对话：
{recent_context}

用户问题：
{question}
"""
    # 这里可以用便宜模型调用一次，也可以先不做，等召回问题出现再加。
    return call_small_model(prompt)
```

不要一开始就堆很多优化。先保留日志：原问题、改写后 query、召回 chunk、rerank 后 chunk、最终引用。没有这些日志，你无法判断到底哪一层坏了。

## 九、Hybrid Search：语义检索 + 关键词检索

向量检索擅长语义相似，关键词检索擅长精确命中。RAG 个人知识库最好两者都要。

例子：

- 用户问「iOS 上传 PDF 接口怎么鉴权」：向量检索通常能找到相关段落。
- 用户问「`ERR_AUTH_4017` 是什么」：关键词检索更可靠。
- 用户问「MCP 配置里那个 timeout 字段在哪」：关键词和语义都可能有用。

Hybrid Search 的思路：

1. dense search：用 embedding 找语义相近片段。
2. sparse / keyword search：用 BM25、全文索引或 Qdrant sparse vectors 找关键词片段。
3. 合并两个结果，常用 Reciprocal Rank Fusion（RRF）。
4. 再进入 rerank。

一个简化版 RRF：

```python
def reciprocal_rank_fusion(result_lists: list[list[str]], k: int = 60) -> list[str]:
    scores: dict[str, float] = {}
    for results in result_lists:
        for rank, chunk_id in enumerate(results, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
    return [
        chunk_id
        for chunk_id, _ in sorted(scores.items(), key=lambda item: item[1], reverse=True)
    ]
```

第一版 Demo 不一定要把 Hybrid Search 全做完，但你至少要在文章、设计和面试里讲清楚：**只靠 embedding 会漏精确词，只靠关键词会漏语义表达，RAG 最终往往要混合。**

## 十、Rerank：Top-K 里有干扰时怎么处理？

Rerank 的作用是：先宽召回，再精排。它不负责从全库找东西，而是判断「这些候选 chunk 里，哪个最能回答问题」。

你可以先用 LLM 做一个简化 rerank：

```python
from pydantic import BaseModel, Field

class RerankItem(BaseModel):
    chunk_id: str
    score: int = Field(ge=0, le=5)
    reason: str

class RerankResult(BaseModel):
    items: list[RerankItem]

def rerank_with_llm(question: str, candidates: list[dict]) -> list[str]:
    numbered = "\n\n".join(
        f"[{c['chunk_id']}]\n{c['text'][:1200]}" for c in candidates
    )
    prompt = f"""
请判断每个片段是否能回答用户问题。
评分 0-5：
5 = 直接回答问题
3 = 部分相关
1 = 只有主题相近
0 = 无关

用户问题：
{question}

候选片段：
{numbered}
"""
    result: RerankResult = call_structured_model(prompt, RerankResult)
    return [
        item.chunk_id
        for item in sorted(result.items, key=lambda x: x.score, reverse=True)
        if item.score >= 3
    ]
```

生产里可以换成专门的 reranker 模型或交叉编码器；但入门阶段先用 LLM rerank 足够让你理解链路。你会很快看到一个现象：很多时候 Top-K 已经召回了正确片段，只是排在第 7、第 8，直接给前 4 个上下文就错了。Rerank 就是解决这个问题。

## 十一、答案引用来源：没有引用，就不算知识库

个人知识库的可信感来自引用。答案必须告诉用户：

- 这句话参考了哪份文档。
- 来自第几页或哪个标题。
- 对应的是哪个 chunk。
- 如果资料里没有，就明确说没有找到依据。

构造上下文时，把 chunk 编号写清楚：

```python
def build_context(chunks: list[dict]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, start=1):
        source = chunk["source_name"]
        page = chunk.get("page")
        heading = " > ".join(chunk.get("heading_path") or [])
        location = f"{source}"
        if page:
            location += f"，第 {page} 页"
        if heading:
            location += f"，{heading}"

        parts.append(
            f"[S{i}] {location}\n"
            f"chunk_id: {chunk['chunk_id']}\n"
            f"{chunk['text']}"
        )
    return "\n\n---\n\n".join(parts)
```

回答 prompt 要强制模型只基于上下文：

```python
def answer_prompt(question: str, context: str) -> str:
    return f"""
你是个人知识库问答助手。只能使用给定资料回答。

规则：
1. 如果资料不足以回答，直接说「当前知识库没有足够依据」。
2. 不要使用常识补全资料里没有的细节。
3. 每个关键结论后面都要标注来源，例如 [S1] 或 [S2]。
4. 不要引用没有使用的来源。

资料：
{context}

用户问题：
{question}
"""
```

如果前端要做引用卡片，最好让后端返回结构化结果：

```python
class Citation(BaseModel):
    source_id: str
    document_id: str
    source_name: str
    page: int | None
    chunk_id: str

class RagAnswer(BaseModel):
    answer: str
    citations: list[Citation]
```

这样 iOS 端就能把 `[S1]` 做成可点击引用，跳到对应 PDF 页或 Markdown 标题。

## 十二、如何避免模型编答案？

RAG 不是自动防幻觉。模型仍然可能把上下文和常识混在一起，或者看到一点证据就过度推断。要靠工程约束。

第一层：**检索阈值**。如果最高分太低，直接不回答。

```python
def has_enough_evidence(results, min_score: float = 0.25) -> bool:
    if not results:
        return False
    return max(r.score for r in results) >= min_score
```

第二层：**上下文外禁止回答**。prompt 里明确「资料不足就说不知道」，但不要只靠 prompt。

第三层：**答案必须带引用**。没有引用的句子不要让它成为最终答案。可以让模型输出结构化 `answer + citations`，再检查 citation 是否都来自本次检索结果。

```python
def validate_citations(answer: RagAnswer, allowed_chunk_ids: set[str]) -> RagAnswer:
    valid = [
        c for c in answer.citations
        if c.chunk_id in allowed_chunk_ids
    ]
    if not valid:
        return RagAnswer(
            answer="当前知识库没有足够依据回答这个问题。",
            citations=[],
        )
    answer.citations = valid
    return answer
```

第四层：**必要时做二次核查**。让另一个模型或同一个模型用更严格 prompt 判断：「答案中的每个结论是否能被引用片段支持？」这一步成本更高，不一定第一版就做，但面试里讲出来会很加分。

## 十三、多用户文档怎么隔离？

多用户隔离是 RAG 面试高频点。错误答案是：「我在 metadata 里放 user_id」。这只是开始，不是完整方案。

至少要做到四层：

1. **认证层**：后端从登录态拿 `tenant_id`，不要信任客户端传来的 `tenant_id`。
2. **写入层**：每个 document、chunk、vector payload 都写入 `tenant_id`。
3. **检索层**：所有向量查询必须带 `tenant_id` filter。
4. **删除层**：删除文档时，只删除当前租户下的 document 和 chunks。

查询时的 filter 前面已经写过，删除也一样：

```python
def delete_document(tenant_id: str, document_id: str):
    qdrant.delete(
        collection_name=COLLECTION,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="tenant_id",
                        match=models.MatchValue(value=tenant_id),
                    ),
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(value=document_id),
                    ),
                ]
            )
        ),
    )
```

生产里还要考虑：

- 对象存储路径隔离：`s3://bucket/{tenant_id}/{document_id}/original.pdf`。
- 元数据库隔离：PostgreSQL 可以用 Row Level Security。
- 向量库隔离：小规模可以一个 collection 加 tenant filter；大客户或强隔离场景可以一个租户一个 collection。
- 日志脱敏：不要把用户文档原文完整打到日志里。
- 权限继承：团队知识库里，一个用户能不能查某份文档，要看 workspace、folder、document permission，而不只是 `tenant_id`。

面试回答可以这么说：

> 我不会让前端传 user_id 决定检索范围。后端从 auth token 解析 tenant_id，并在文档元数据、chunk payload、向量检索 filter、删除条件里都带上 tenant_id。生产里再配合对象存储路径隔离、数据库 RLS 和权限表，避免跨用户召回。

## 十四、一个可运行的 `/ask` 链路

把前面的东西合起来，`/ask` 大概长这样：

```python
from fastapi import FastAPI, Depends
from pydantic import BaseModel

app = FastAPI()

class AskRequest(BaseModel):
    question: str
    document_ids: list[str] | None = None

class CurrentUser(BaseModel):
    tenant_id: str
    user_id: str

def get_current_user() -> CurrentUser:
    # Demo 里可以写死；真实项目必须从登录态解析。
    return CurrentUser(tenant_id="tenant_demo", user_id="user_demo")

@app.post("/ask", response_model=RagAnswer)
async def ask(req: AskRequest, user: CurrentUser = Depends(get_current_user)):
    candidates = search_top_k(
        tenant_id=user.tenant_id,
        question=req.question,
        k=16,
    )

    if not has_enough_evidence(candidates):
        return RagAnswer(answer="当前知识库没有足够依据回答这个问题。", citations=[])

    candidate_payloads = [hit.payload | {"score": hit.score} for hit in candidates]
    ordered_ids = rerank_with_llm(req.question, candidate_payloads)
    ordered = [
        c for chunk_id in ordered_ids
        for c in candidate_payloads
        if c["chunk_id"] == chunk_id
    ][:5]

    context = build_context(ordered)
    prompt = answer_prompt(req.question, context)
    answer = call_structured_model(prompt, RagAnswer)

    allowed = {c["chunk_id"] for c in ordered}
    return validate_citations(answer, allowed)
```

这不是完整生产代码，但它已经包含了 RAG 的关键骨架：

- 先检索，不直接问模型。
- 检索时按租户过滤。
- 候选 Top-K 和最终上下文分开。
- Rerank 后只给少量高质量片段。
- 答案必须带引用。
- 引用必须来自本次检索。

## 十五、面试会怎么问？

### RAG 召回不准怎么办？

按层排查：文档解析、chunk、query 改写、metadata filter、hybrid search、rerank、评测集。不要一上来就说换模型。

### Top-K 有干扰怎么办？

候选 K 取大一点保证召回，再用 rerank、分数阈值、MMR 去重、metadata filter 压到 4-6 个上下文片段。不要把 Top-K 直接塞给模型。

### 切片大小怎么选？

先按文档结构切，再用 400-800 tokens 做默认值，10%-20% overlap。用真实问题评测 recall@k、引用正确率和答案质量，再调 chunk size。

### 如何避免模型编答案？

低分不回答；prompt 限制只能使用资料；答案必须带引用；后端校验引用是否来自检索结果；必要时做二次 groundedness check。

### 多用户文档怎么隔离？

认证层解析 tenant_id，写入、检索、删除都带 tenant filter；对象存储、元数据库、向量库和日志都要隔离。不要信任前端传 user_id。

## 十六、七天 Demo 计划

1. **第 1 天：文件上传和文档解析。** Markdown 和文字型 PDF 能转成 `ParsedBlock`。
2. **第 2 天：Chunk 切片。** 支持标题路径、页码、chunk_id、overlap。
3. **第 3 天：Embedding 和向量库。** 能把 chunk 写入 Qdrant，并按 tenant 过滤检索。
4. **第 4 天：Top-K 问答。** `/ask` 能返回答案和引用。
5. **第 5 天：Rerank。** 先宽召回，再压缩到 4-6 个片段。
6. **第 6 天：Hybrid Search。** 加关键词召回或全文索引，处理错误码、函数名、专有名词。
7. **第 7 天：评测和面试准备。** 准备 20 个问题，记录召回片段、引用是否正确、模型是否编答案。

这七天的目标不是做一个漂亮 UI，而是做一个能讲清楚、能跑通、能定位问题的 RAG 核心。UI 可以后补；检索链路不稳，界面再好看也没用。

## 十七、本篇小结

RAG 个人知识库是 iOS 开发者转 AI 应用开发非常合适的第二个项目。它不像纯聊天 Demo 那样只练 API，也不像 Agent 那样一上来就失控；它刚好把文档处理、后端接口、模型调用、检索系统和前端引用展示连起来。

带走五句话：

1. **RAG 的难点在链路，不在一句 prompt。** 文档解析、chunk、embedding、检索、rerank、引用每一层都会影响结果。
2. **切片大小是实验参数。** 先按结构切，再用 400-800 tokens 起步，用真实问题调。
3. **Top-K 不是最终上下文。** 先宽召回，再 rerank、去噪、压缩。
4. **没有引用就不是知识库。** 答案必须能追到文档、页码和 chunk。
5. **多用户隔离必须贯穿写入、检索、删除和日志。** 只在 metadata 里放 user_id 不够。

下一步你应该真的做一个小 Demo：上传两份 Markdown、两份 PDF，准备 20 个问题，看它能不能找对片段、能不能拒绝资料外问题、能不能给出可点击引用。做到这里，你就已经不是「听过 RAG」，而是有一个能面试、能扩展、能产品化的知识库原型。

## 参考资料

- OpenAI, [Embeddings](https://platform.openai.com/docs/guides/embeddings)
- OpenAI, [Retrieval](https://platform.openai.com/docs/guides/retrieval)
- Qdrant, [Hybrid Queries](https://qdrant.tech/documentation/concepts/hybrid-queries/)
- Qdrant, [Filtering](https://qdrant.tech/documentation/concepts/filtering/)
- Qdrant, [Multitenancy](https://qdrant.tech/documentation/guides/multiple-partitions/)
- LangChain, [Text splitters](https://python.langchain.com/docs/concepts/text_splitters/)
