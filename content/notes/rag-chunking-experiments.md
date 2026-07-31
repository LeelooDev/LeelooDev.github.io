---
title: RAG 切片实验记录
date: 2026-07-19
group: AI 工程
groupOrder: 2
noteOrder: 1
cover: /images/rag-personal-knowledge-base-cover.jpg
coverAlt: 高处俯拍的峡谷土路与河道纹理
---

RAG 的切片大小没有通用最优值。真正影响效果的是文档结构、问题粒度、检索方式和最终允许进入模型的上下文预算。

## 当前默认值

我会先按 Markdown 标题、PDF 页和段落边界切，再用 token 数做兜底：

| 参数 | 默认值 |
| --- | --- |
| chunk size | 600 tokens |
| overlap | 80 tokens |
| candidate top-k | 16 |
| rerank 后保留 | 5 |

结构边界优先于固定长度。一个完整的小节即使只有 280 tokens，也通常比把它和下一个主题硬拼成 600 tokens 更好。

## 评测问题要覆盖三种类型

1. **定位题**：答案集中在一个段落。
2. **综合题**：需要合并同一文档的多个片段。
3. **边界题**：问题刻意落在标题、分页或切片边缘。

每次实验记录 `recall@k`、重排后的证据命中率、答案引用正确率和拒答准确率。只看最终答案会掩盖检索层的问题。

```python
experiment = {
    "chunk_size": 600,
    "overlap": 80,
    "candidate_k": 16,
    "context_k": 5,
}
```

## 下一轮要验证

- 对 API 文档使用按函数或类定义切片。
- 对长 PDF 保留标题路径和页码。
- 对错误码、函数名等关键词加入 BM25。
- 在 rerank 前按文档与相邻位置做轻量去重。

切片不是一次配置完成的基础设施，而是需要跟着真实问题集持续调整的检索参数。
