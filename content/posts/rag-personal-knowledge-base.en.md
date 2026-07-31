---
title: Build a Traceable RAG Personal Knowledge Base
excerpt: A runnable RAG blueprint covering document parsing, chunking, embeddings, retrieval, reranking, citations, hallucination controls and tenant isolation.
tags: [RAG, AI, Embeddings, Vector Database, Python]
coverAlt: An aerial view of a canyon road, riverbed and a vehicle at a bend
---

> After building a basic AI API, a personal knowledge base is an excellent second project. It combines backend APIs, file processing, retrieval, model calls and a client experience in one testable system.

## The product is evidence, not chat

A useful RAG system follows a concrete pipeline:

1. Upload PDF or Markdown documents.
2. Parse text and structural metadata.
3. Split content into semantically coherent chunks.
4. Generate an embedding for every chunk.
5. Store vectors and metadata.
6. Retrieve candidates for a question.
7. Rerank and remove noise.
8. Answer with citations that point back to the source.

Ordinary chat depends on model memory. A knowledge base should depend on the documents you control.

## Parse structure before counting tokens

Keep headings, page numbers, source names and stable chunk IDs. A chunk should carry enough metadata to render a citation later.

```python
class Chunk(BaseModel):
    chunk_id: str
    document_id: str
    source_name: str
    page: int | None
    heading_path: list[str]
    text: str
```

Start around 400–800 tokens with 10–20% overlap, but treat these as experiment values. Split on headings and paragraphs before applying a hard length limit.

## Retrieval needs more than one score

Dense embeddings are good at semantic similarity but weaker with exact identifiers, error codes and function names. A practical pipeline often combines:

- dense vector search;
- lexical or BM25 search;
- metadata filters;
- deduplication or MMR;
- a reranker.

Retrieve a wider candidate set, for example 16 passages, then rerank to the best four to six. Candidate `top-k` should not automatically become model context.

## Make citations part of the contract

Build context with stable source identifiers:

```text
[S1] handbook.pdf, page 12, Security > Tokens
chunk_id: handbook-12-03
...
```

Return structured data:

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

After generation, verify that every citation references a chunk retrieved for the current request.

## Refuse when evidence is weak

RAG does not automatically prevent hallucinations. Use several layers:

- a minimum retrieval score;
- instructions that prohibit unsupported claims;
- mandatory citations;
- server-side citation validation;
- an optional groundedness check for higher-risk use cases.

If the evidence is insufficient, return a direct answer such as “The current knowledge base does not contain enough evidence.”

## Isolate every tenant boundary

Do not trust a `user_id` supplied by the client. Derive the tenant from authentication, then apply it during upload, storage, retrieval and deletion.

```python
results = vector_store.search(
    query_vector=query_vector,
    filters={"tenant_id": current_user.tenant_id},
)
```

Object storage paths, relational rows, vector payloads and logs must follow the same boundary. PostgreSQL row-level security can reinforce the application checks.

## A seven-day implementation path

1. Parse Markdown and text PDFs.
2. Create structured chunks.
3. Add embeddings and vector storage.
4. Implement retrieval and cited answers.
5. Add reranking.
6. Add hybrid lexical retrieval.
7. Build an evaluation set and measure citation accuracy.

Prepare at least 20 realistic questions. Record retrieved passages, answer quality, citation correctness and refusal behavior. A stable retrieval and evidence path matters far more than a decorative chat interface.
