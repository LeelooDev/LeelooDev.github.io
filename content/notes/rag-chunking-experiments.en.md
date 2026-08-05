---
title: RAG Chunking Experiment Log
group: AI Engineering
---

There is no universally optimal chunk size for RAG. Results depend on document structure, question granularity, retrieval strategy, and the context budget available to the model.

## Current defaults

I split first on Markdown headings, PDF pages, and paragraph boundaries, then use token length as a fallback:

| Parameter | Default |
| --- | --- |
| chunk size | 600 tokens |
| overlap | 80 tokens |
| candidate top-k | 16 |
| after reranking | 5 |

Structural boundaries matter more than a fixed length. A complete 280-token section is often better than forcing it together with the next topic to reach 600 tokens.

## Evaluation questions cover three types

1. **Lookup questions** with an answer in one paragraph.
2. **Synthesis questions** that combine several passages from one document.
3. **Boundary questions** intentionally placed near a heading, page, or chunk edge.

For every run, record `recall@k`, evidence hits after reranking, citation accuracy, and correct refusals. Looking only at the final answer hides retrieval failures.

```python
experiment = {
    "chunk_size": 600,
    "overlap": 80,
    "candidate_k": 16,
    "context_k": 5,
}
```

## Next experiments

- Split API documentation by function or class definition.
- Preserve heading paths and page numbers for long PDFs.
- Add BM25 for error codes, function names, and exact terms.
- Deduplicate nearby passages by document and position before reranking.

Chunking is not a one-time infrastructure setting. It is a retrieval parameter that should evolve with a real evaluation set.
