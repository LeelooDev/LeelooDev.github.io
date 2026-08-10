---
title: "RAG Is More Than Retrieval: Evolution and a Local-First Choice"
group: AI Engineering
---

RAG stands for Retrieval-Augmented Generation. **Retrieval is only one subsystem.** A complete implementation also covers parsing, chunking and indexing, query understanding, evidence selection, context construction, generation, citation checks, refusal behavior, and evaluation.

## How RAG has evolved

| Stage | Main approach | Strength | Typical weakness |
| --- | --- | --- | --- |
| Naive RAG | Vector top-k followed by generation | Simple and quick to prototype | Weak exact matching and no recovery from a bad first search |
| Hybrid RAG | BM25 + vector retrieval + fusion + reranking | Covers both lexical and semantic relevance | May still lose section context or cross-document relations |
| Contextual RAG | Structure-aware chunks, context prefixes, and parent expansion | Preserves source and section meaning | More indexing complexity and evaluation work |
| Agentic RAG | An agent decides when to retrieve, rewrite, or decompose | Handles ambiguity, multiple tools, and multi-hop tasks | Variable latency and cost; loops must be bounded |
| Hybrid/Adaptive RAG | Deterministic flow plus agent decisions and validation | Balances control and flexibility | Higher implementation and evaluation cost |
| GraphRAG | Entity, relation, and community-based graph retrieval | Strong for global themes and relationship questions | Expensive indexing and not a default replacement |

[Anthropic's Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval) adds chunk-specific context to both semantic and BM25 indexes. [LangChain's retrieval guide](https://docs.langchain.com/oss/python/langchain/retrieval) describes current architectures as 2-Step, Agentic, and Hybrid RAG. The direction is not simply a larger vector database: retrieval becomes structure-aware, agents recover from failures, and validation remains explicit.

## What is recommended in 2026?

There is no universally best new stack. For a local Markdown knowledge base, the practical choice is **layered Hybrid/Agentic RAG**:

1. Read a small or explicitly named file directly instead of forcing vector retrieval.
2. Use BM25 and vector recall by default, fuse with RRF, then rerank locally.
3. Preserve heading paths, file paths, and line ranges; expand a matching child chunk to its parent section when needed.
4. Let the agent rewrite or decompose only when evidence is insufficient, with a strict retry limit.
5. Check evidence sufficiency before generation and verify citations afterward; refuse when support is missing.
6. Evaluate recall, evidence hits, citation accuracy, refusal accuracy, latency, and resource use on real questions.

This does not hand every stage to an agent. Exact matching, indexing, citation verification, and permissions remain deterministic; model decisions are reserved for query planning and recovery.

## Can the existing stack continue?

**Yes. It is already on the right path.** The project is not a naive vector top-k pipeline:

| Current capability | Stage | Recommendation |
| --- | --- | --- |
| SQLite FTS5 / BM25 with CJK unigrams | Lexical recall | Keep |
| Local `multilingual-e5-small` vectors | Semantic recall | Keep behind a replaceable interface |
| RRF and a local reranker | Hybrid retrieval | Keep |
| Markdown-aware chunks and exact line ranges | Traceable context | Keep |
| Four read-only knowledge tools | Agentic RAG | Keep contracts stable |
| Query rewriting and decomposition | Agentic RAG | Add budgets and quality gates |
| Citation evidence and real-question evaluation | Quality control | Expand |

There is no reason to replace SQLite, move private notes to hosted file search, or adopt GraphRAG merely to appear current. The local stack is simpler and works offline. Replace a component only after evaluation identifies a real bottleneck.

## Implementation order

1. **Parent-child chunks**: retrieve precise child passages, then add the parent section without losing source line ranges.
2. **Query routing**: prefer lexical search for filenames, error codes, and API names; use hybrid search for concepts; directly read named files.
3. **Evidence sufficiency**: after reranking, decide whether the question is covered and allow no more than two additional searches.
4. **Multi-hop evaluation**: add questions that require several passages or files, plus unanswerable cases.
5. **GraphRAG only on demand**: run a small A/B test only when real questions repeatedly ask for corpus-wide themes, relationships, or impact paths. Microsoft's official repository warns that [GraphRAG indexing can consume substantial resources](https://github.com/microsoft/graphrag) and recommends starting small.

## Decision

**Keep the local hybrid retrieval stack and invest next in parent-child chunks, query routing, evidence sufficiency, and multi-hop evaluation.** Agentic RAG is an incremental enhancement to the current architecture, not a replacement framework. GraphRAG remains a targeted experiment rather than the default path.
