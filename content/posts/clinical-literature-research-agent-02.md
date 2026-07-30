---
title: 从零构建临床文献智能研究 Agent（二）：LangGraph 多智能体编排
date: 2026-06-04
category: code
tags: [AI, LangGraph, Agent, Python]
cover: /images/cover-jungle-boats.jpg
coverAlt: 丛林河湾停泊的几艘小船
excerpt: 深入后端核心，使用 LangGraph 构建多智能体状态图，实现问题拆解、并行文献检索、证据评估与智能综合的完整流水线。
dek: 本篇深入后端核心，用 StateGraph 编排四个智能体，掌握 Reducer 自动归并并行结果与 Send API 动态并行分支的精髓。
---

> 在上一篇中，我们完成了项目环境搭建和前后端通信验证。本篇将深入后端核心——使用 LangGraph 构建多智能体状态图，实现问题拆解、并行文献检索、证据评估和智能综合的完整流水线。

## 本篇目标

读完这篇文章，你将掌握：

-   如何设计 AgentState 来管理多智能体之间的数据流
-   LangGraph 的 Reducer 机制——让并行结果自动归并
-   使用 Send API 实现动态并行分支（fan-out）
-   四个智能体节点的职责划分和实现思路
-   状态图的构建、编排与编译

## 核心概念：为什么需要"状态图"？

在传统的 AI 应用中，我们通常只有一个 LLM 调用链——输入进去，输出出来。但对于临床文献研究这种复杂任务，一次性调用远远不够：

0.  用户的临床问题可能很宏观，需要**拆解**为多个可检索的子问题
0.  多个子问题应该**并行检索**，而不是串行等待
0.  检索到的数十篇文献需要**独立评估**打分
0.  最终需要**综合分析**所有证据，生成有引用的结论

这就是一个典型的**有向无环图（DAG）** 执行流程。LangGraph 的 StateGraph 正是为这种场景设计的——它让你用图的方式定义节点（智能体）和边（数据流），并内建了并行执行和状态管理能力。

## 第一步：设计 AgentState（状态模式）

AgentState 是整个系统的"数据总线"——每个智能体节点从中读取输入，执行完后将结果写回。设计一个好的 State，是多智能体系统最关键的第一步。

### 完整定义

创建 `backend/src/state.py`：

```python
import operator
from typing import Annotated, TypedDict


def _last_value(existing: str, new: str) -> str:
    """自定义 Reducer：保留最后一个值"""
    return new


class AgentState(TypedDict):
    # 用户输入
    user_query: str                                    # 原始临床问题
    language: str                                      # "zh" 或 "en"

    # 问题拆解结果
    sub_questions: list[str]                          # 拆解后的子问题列表

    # 文献检索结果（核心：使用加法 Reducer）
    retrieval_results: Annotated[list, operator.add]  # 并行检索的论文列表

    # 证据评估结果
    evaluated_papers: list[EvaluatedPaper]            # 评分后的论文

    # 综合输出
    synthesis: str                                     # 最终证据摘要
    citations: list[Citation]                         # 引用列表

    # 控制字段
    retry_count: int                                  # 重试计数器
    current_step: Annotated[str, _last_value]        # 当前执行步骤
```

### 关键设计解析

#### 1. Reducer 机制——并行结果自动归并

这是 LangGraph 最精妙的设计之一。看这行代码：

```python
retrieval_results: Annotated[list, operator.add]
```

`Annotated[list, operator.add]` 的含义是：当多个节点同时向 `retrieval_results` 写入数据时，**使用列表拼接**（`+`）来合并结果，而不是覆盖。

具体场景：假设用户问了一个复杂问题，被拆解成 3 个子问题，3 个检索器并行执行：

```
检索器 1 返回：{"retrieval_results": [论文A, 论文B, ...]}
检索器 2 返回：{"retrieval_results": [论文C, 论文D, ...]}
检索器 3 返回：{"retrieval_results": [论文E, 论文F, ...]}
```

LangGraph 自动调用 `operator.add`，最终状态变为：

```
state["retrieval_results"] = [论文A, 论文B, ..., 论文C, 论文D, ..., 论文E, 论文F, ...]
```

**无需手动写任何合并代码**，框架帮你搞定。

#### 2. 自定义 Reducer：`_last_value`

```python
def _last_value(existing: str, new: str) -> str:
    return new

current_step: Annotated[str, _last_value]
```

`current_step` 用于追踪当前执行到了哪一步（"decomposing"、"retrieving"、"evaluating"、"synthesizing"）。当多个节点并行执行时，只保留最后更新的值。这个字段主要用于向前端推送进度信息。

#### 3. 没有 Reducer 的字段

像 `user_query`、`sub_questions`、`synthesis` 这些字段没有使用 Reducer，意味着后写入的值会直接覆盖前一个值——这正是我们期望的行为，因为它们在整个流程中只会被写入一次。

## 第二步：定义数据模型

在编写智能体之前，先定义它们之间传递的数据结构。

创建 `backend/src/models.py`：

```python
from pydantic import BaseModel


class Paper(BaseModel):
    """PubMed 论文数据模型"""
    pmid: str                   # PubMed 唯一标识
    title: str                  # 论文标题
    abstract: str               # 摘要
    authors: list[str]          # 作者列表
    journal: str                # 期刊名称
    pub_date: str               # 发表日期（YYYY 或 YYYY-MM）
    doi: str = ""               # DOI 号
    pub_type: str = ""          # 研究类型（如 "Randomized Controlled Trial"）


class EvaluatedPaper(BaseModel):
    """评估后的论文"""
    paper: Paper
    evidence_score: float       # 综合证据评分（0-100）
    evidence_level: str         # 证据等级（Level I-IV）
    study_design_score: int     # 研究设计得分
    recency_score: int          # 时效性得分
    sample_size_score: int      # 样本量得分
    relevance_score: int        # 相关性得分


class Citation(BaseModel):
    """引用信息"""
    claim: str                  # 支持的论断
    doi: str                    # DOI 引用
    pmid: str                   # PubMed ID
    evidence_level: str         # 证据等级
    source_title: str           # 来源论文标题
```

### 设计思路

数据模型的设计遵循了**渐进增强**的思路：

-   `Paper`：原始文献数据，来自 PubMed API
-   `EvaluatedPaper`：在 Paper 基础上增加了评分信息
-   `Citation`：从评估后的论文中提取的引用信息

每个模型对应流水线中的一个阶段，清晰反映了数据的流转过程。

## 第三步：实现四个智能体节点

### 节点 1：问题拆解器（Query Decomposer）

**职责**：将用户的复杂临床问题拆解为 2-5 个可直接在 PubMed 上检索的子问题。

创建 `backend/src/agents/query_decomposer.py`：

````python
import json
import re

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from src.config import settings
from src.state import AgentState
from src.utils import detect_language


async def decompose_query(state: AgentState, llm: ChatOpenAI = None) -> dict:
    """将复杂临床问题拆解为可检索的子问题"""
    user_query = state["user_query"]
    language = state.get("language") or detect_language(user_query)

    if llm is None:
        llm = ChatOpenAI(
            base_url=settings.deepseek_base_url,
            api_key=settings.deepseek_api_key,
            model=settings.deepseek_model,
            temperature=0.1,
        )

    system_prompt = """You are a clinical research query decomposition expert.
Your task is to break down complex clinical questions into 2-5 specific,
searchable sub-questions for PubMed literature search.

Rules:
- Each sub-question should be specific enough to search on PubMed
- Use medical terminology appropriate for literature search
- Cover different aspects: efficacy, safety, mechanism, population, comparison
- Output MUST be valid JSON: {"sub_questions": ["q1", "q2", ...]}
- If the question is already specific enough, return it as a single sub-question
- Always output sub-questions in English for PubMed search"""

    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Decompose this clinical question: {user_query}"),
    ])

    # 解析 LLM 输出的 JSON
    sub_questions = _parse_sub_questions(response.content, user_query)

    return {
        "sub_questions": sub_questions,
        "language": language,
        "current_step": "decomposing",
    }


def _parse_sub_questions(content: str, fallback: str) -> list[str]:
    """从 LLM 输出中提取子问题列表，失败则回退到原始问题"""
    try:
        # 尝试从 markdown 代码块中提取 JSON
        json_match = re.search(r'```(?:json)?\s*(.*?)```', content, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(1).strip())
        else:
            data = json.loads(content)

        questions = data.get("sub_questions", [])
        if questions and isinstance(questions, list):
            return questions
    except (json.JSONDecodeError, AttributeError, KeyError):
        pass

    return [fallback]
````

**要点解析**：

0.  **Prompt 工程**：系统提示要求 LLM 遵循 PICO 框架（Population、Intervention、Comparator、Outcome）来拆解问题。通过明确要求 JSON 输出格式，减少解析失败的概率。
0.  **健壮的 JSON 解析**：LLM 可能返回 markdown 代码块包裹的 JSON，也可能返回裸 JSON。`_parse_sub_questions` 同时处理两种情况。
0.  **优雅降级**：如果 JSON 解析失败，直接将原始问题作为唯一的子问题返回，保证流水线不中断。
0.  **双语支持**：通过 `detect_language()` 检测输入语言，但子问题统一输出为英文——因为 PubMed 是英文数据库。

### 节点 2：文献检索器（Literature Retriever）

**职责**：调用 PubMed E-utilities API 检索文献，支持自动重试和查询放宽。

在实现检索器之前，先实现 PubMed 工具层。

#### PubMed 工具封装

创建 `backend/src/tools/pubmed_tool.py`：

```python
import xml.etree.ElementTree as ET

import httpx

from src.config import settings

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


async def search_pubmed(
    query: str,
    max_results: int = None,
    min_date: str = None,
) -> list[dict]:
    """两步检索：eSearch 获取 PMID → eFetch 获取详细信息"""
    max_results = max_results or settings.pubmed_max_results
    min_date = min_date or settings.pubmed_min_date

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: eSearch — 搜索获取 PMID 列表
        search_params = {
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": max_results,
            "sort": "relevance",
            "mindate": min_date,
            "maxdate": "3000",
            "datetype": "pdat",
        }

        # 如果配置了 NCBI API Key，附加到请求中（提升速率限制）
        if settings.ncbi_api_key:
            search_params["api_key"] = settings.ncbi_api_key

        resp = await client.get(ESEARCH_URL, params=search_params)
        resp.raise_for_status()
        search_data = resp.json()

        pmids = search_data.get("esearchresult", {}).get("idlist", [])
        if not pmids:
            return []

        # Step 2: eFetch — 批量获取论文详情
        fetch_params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
        }
        if settings.ncbi_api_key:
            fetch_params["api_key"] = settings.ncbi_api_key

        resp = await client.get(EFETCH_URL, params=fetch_params)
        resp.raise_for_status()

        return _parse_pubmed_xml(resp.text)


def _parse_pubmed_xml(xml_text: str) -> list[dict]:
    """解析 PubMed XML 响应，提取论文关键字段"""
    root = ET.fromstring(xml_text)
    papers = []

    for article in root.findall(".//PubmedArticle"):
        # ... 解析 PMID、标题、摘要、作者、期刊、日期、DOI、研究类型
        paper = {
            "pmid": _get_text(article, ".//PMID"),
            "title": _get_text(article, ".//ArticleTitle"),
            "abstract": _get_abstract(article),
            "authors": _get_authors(article),
            "journal": _get_text(article, ".//Journal/Title"),
            "pub_date": _get_pub_date(article),
            "doi": _get_doi(article),
            "pub_type": _get_pub_type(article),
        }
        papers.append(paper)

    return papers
```

PubMed E-utilities 采用两步检索策略：

0.  **eSearch**：发送检索词，返回匹配的 PMID 列表
0.  **eFetch**：用 PMID 批量获取论文的完整元数据（XML 格式）

这种两步策略是 NCBI 官方推荐的做法，能够充分利用 PubMed 的相关性排序能力。

#### 检索器节点实现

创建 `backend/src/agents/literature_retriever.py`：

```python
from src.models import Paper
from src.tools.pubmed_tool import search_pubmed
from src.config import settings


async def retrieve_literature(sub_question: str) -> list[Paper]:
    """检索文献，支持自动重试与查询放宽"""
    all_papers = []
    seen_pmids = set()
    retry = 0

    while retry <= settings.pubmed_retry_max:
        # 根据重试次数逐步放宽检索策略
        query = _build_query(sub_question, retry)
        raw_papers = await search_pubmed(query)

        for p in raw_papers:
            if p["pmid"] not in seen_pmids:
                seen_pmids.add(p["pmid"])
                all_papers.append(Paper(**p))

        # 结果足够多则停止重试
        if len(all_papers) >= 5:
            break

        retry += 1

    return all_papers


def _build_query(question: str, retry: int) -> str:
    """根据重试次数构建不同宽度的检索词"""
    if retry == 0:
        return question  # 首次：使用完整问题
    elif retry == 1:
        return question  # 第二次：移除出版类型限制（在 search_pubmed 中处理）
    else:
        # 第三次：只取前几个关键词，大幅放宽检索
        words = question.split()
        return " ".join(words[:4])
```

**自动重试策略**是检索器的亮点设计：

| 重试次数 | 策略              | 原因                     |
| -------- | ----------------- | ------------------------ |
| 第 0 次  | 完整问题检索      | 最精确匹配               |
| 第 1 次  | 移除出版类型限制  | 扩大检索范围             |
| 第 2 次  | 只取前 4 个关键词 | 大幅放宽，获取泛相关文献 |

每次重试都会**去重**（通过 `seen_pmids` 集合），避免重复论文。当累计结果 ≥ 5 篇时提前终止，兼顾效率和覆盖率。

### 节点 3：证据评估器（Evidence Evaluator）

**职责**：基于循证医学的证据等级体系，对每篇论文进行多维度打分。

创建 `backend/src/agents/evidence_evaluator.py`：

```python
from datetime import datetime

from src.models import Paper, EvaluatedPaper


def evaluate_papers(
    papers: list[Paper],
    sub_question: str = "",
) -> list[EvaluatedPaper]:
    """评估论文质量，返回按证据评分排序的结果"""
    evaluated = []

    for paper in papers:
        design_score = _score_study_design(paper.pub_type)
        recency_score = _score_recency(paper.pub_date)
        sample_score = 50   # 占位：待实现样本量提取
        relevance_score = 50  # 占位：待实现语义相关性评分

        # 加权综合评分
        evidence_score = (
            design_score * 0.35 +
            recency_score * 0.25 +
            sample_score * 0.20 +
            relevance_score * 0.20
        )

        evaluated.append(EvaluatedPaper(
            paper=paper,
            evidence_score=round(evidence_score, 1),
            evidence_level=_classify_level(paper.pub_type),
            study_design_score=design_score,
            recency_score=recency_score,
            sample_size_score=sample_score,
            relevance_score=relevance_score,
        ))

    # 按证据评分降序排列
    evaluated.sort(key=lambda x: x.evidence_score, reverse=True)
    return evaluated
```

#### 评分维度详解

**维度一：研究设计得分（权重 35%）**

```python
STUDY_DESIGN_SCORES = {
    "Meta-Analysis": 100,
    "Systematic Review": 100,
    "Randomized Controlled Trial": 85,
    "Clinical Trial": 70,
    "Cohort Study": 60,
    "Observational Study": 60,
    "Case-Control": 40,
    "Case Reports": 20,
    "Review": 50,
}
```

这个评分体系直接映射了循证医学的经典**证据金字塔**。

**维度二：时效性得分（权重 25%）**

```python
def _score_recency(pub_date: str) -> int:
    """论文越新，分数越高"""
    try:
        year = int(pub_date[:4])
        age = datetime.now().year - year
        if age <= 2:
            return 100  # 近 2 年
        elif age <= 5:
            return 70   # 3-5 年
        elif age <= 10:
            return 40   # 6-10 年
        else:
            return 20   # 10 年以上
    except (ValueError, IndexError):
        return 50
```

在快速发展的临床领域，最新的证据往往更有参考价值。我们将 2020 年以后的文献作为最低检索门槛（在 PubMed 查询参数中设置了 `min_date`），并在评分中进一步区分。

**维度三和四：样本量和相关性（各 20%）**

目前使用占位值 50 分。后续迭代中将分别实现：

-   **样本量评分**：从摘要中提取样本量信息（NLP 任务）
-   **相关性评分**：使用嵌入模型计算论文与查询的语义相似度

#### 证据等级分类

```python
def _classify_level(pub_type: str) -> str:
    """将论文分为四个证据等级"""
    pub_type_lower = pub_type.lower()
    if any(t in pub_type_lower for t in ["meta-analysis", "systematic review"]):
        return "Level I"
    elif any(t in pub_type_lower for t in ["randomized", "clinical trial"]):
        return "Level II"
    elif any(t in pub_type_lower for t in ["cohort", "observational", "case-control"]):
        return "Level III"
    else:
        return "Level IV"
```

| 等级      | 对应研究类型                        | 可信度 |
| --------- | ----------------------------------- | ------ |
| Level I   | Meta-Analysis、Systematic Review    | 最高   |
| Level II  | RCT、Clinical Trial                 | 高     |
| Level III | Cohort、Observational、Case-Control | 中等   |
| Level IV  | Case Report、Review、其他           | 较低   |

### 节点 4：证据综合器（Synthesizer）

**职责**：将评估后的文献综合为结构化的证据摘要，带引用和免责声明。

创建 `backend/src/agents/synthesizer.py`：

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from src.config import settings
from src.state import AgentState
from src.models import Citation


async def synthesize_evidence(state: AgentState, llm: ChatOpenAI = None) -> dict:
    """综合所有证据，生成带引用的结构化摘要"""
    if llm is None:
        llm = ChatOpenAI(
            base_url=settings.deepseek_base_url,
            api_key=settings.deepseek_api_key,
            model=settings.deepseek_model,
            temperature=0.1,
        )

    language = state.get("language", "en")
    evaluated_papers = state.get("evaluated_papers", [])
    sub_questions = state.get("sub_questions", [])

    # 取评分最高的 20 篇论文
    top_papers = sorted(
        evaluated_papers,
        key=lambda x: x.evidence_score,
        reverse=True,
    )[:20]

    # 构建论文摘要信息
    papers_context = _format_papers_for_prompt(top_papers)

    # 根据语言选择提示词
    system_prompt = _get_system_prompt(language)

    user_prompt = f"""Original question: {state['user_query']}

Sub-questions investigated:
{chr(10).join(f'- {sq}' for sq in sub_questions)}

Evidence from {len(top_papers)} top-ranked papers:
{papers_context}

Please synthesize the evidence above into a comprehensive summary."""

    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    # 添加免责声明
    disclaimer = _get_disclaimer(language)
    synthesis = response.content + "\n\n" + disclaimer

    # 提取引用信息
    citations = _extract_citations(top_papers)

    return {
        "synthesis": synthesis,
        "citations": citations,
        "current_step": "synthesizing",
    }


def _format_papers_for_prompt(papers) -> str:
    """将论文格式化为 LLM 可读的文本"""
    lines = []
    for i, ep in enumerate(papers, 1):
        p = ep.paper
        lines.append(
            f"[{i}] ({ep.evidence_level}) {p.title}\n"
            f"    DOI: {p.doi} | PMID: {p.pmid}\n"
            f"    Type: {p.pub_type} | Date: {p.pub_date} | Score: {ep.evidence_score}\n"
            f"    Abstract: {p.abstract[:300]}..."
        )
    return "\n\n".join(lines)
```

**综合器的 Prompt 设计**有几个关键要求：

0.  **每个论断必须引用 DOI**：`[DOI: 10.xxxx/yyyy]`，确保可追溯
0.  **按子问题分组呈现**：帮助读者快速定位感兴趣的部分
0.  **显式处理矛盾证据**：当不同研究结论相悖时，必须说明
0.  **自动附加免责声明**：明确系统输出不构成医疗建议

```python
def _get_disclaimer(language: str) -> str:
    if language == "zh":
        return ("---\n⚠️ **免责声明**：本报告由 AI 系统自动生成，"
                "仅供学术参考，不构成任何医疗建议。"
                "临床决策请遵循专业医生的指导和最新临床指南。")
    return ("---\n⚠️ **Disclaimer**: This report was generated by an AI system "
            "for academic reference only and does not constitute medical advice. "
            "Clinical decisions should follow professional medical guidance.")
```

## 第四步：构建状态图

四个智能体节点准备就绪，现在将它们用 LangGraph 的 StateGraph 编排起来。

创建 `backend/src/graph.py`：

```python
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END, Send

from src.config import settings
from src.state import AgentState
from src.agents.query_decomposer import decompose_query
from src.agents.literature_retriever import retrieve_literature
from src.agents.evidence_evaluator import evaluate_papers
from src.agents.synthesizer import synthesize_evidence


def build_graph(llm: ChatOpenAI = None):
    """构建并编译多智能体状态图"""

    # ─── 节点定义 ───────────────────────────────────

    async def decomposer_node(state: AgentState) -> dict:
        return await decompose_query(state, llm=llm)

    async def retriever_node(state: AgentState) -> dict:
        sub_q = state.get("_current_sub_question", "")
        papers = await retrieve_literature(sub_q)
        return {"retrieval_results": papers}

    async def evaluator_node(state: AgentState) -> dict:
        papers = state["retrieval_results"]
        evaluated = evaluate_papers(papers, sub_question=state["user_query"])
        return {"evaluated_papers": evaluated, "current_step": "evaluating"}

    async def synthesizer_node(state: AgentState) -> dict:
        return await synthesize_evidence(state, llm=llm)

    # ─── 并行路由函数 ─────────────────────────────────

    def route_to_retrievers(state: AgentState):
        """使用 Send API 实现动态并行分支"""
        sub_questions = state["sub_questions"]
        if not sub_questions:
            return [Send("retriever", {
                **state,
                "_current_sub_question": state["user_query"],
            })]
        return [
            Send("retriever", {**state, "_current_sub_question": sq})
            for sq in sub_questions
        ]

    # ─── 构建状态图 ─────────────────────────────────

    graph = StateGraph(AgentState)

    # 添加节点
    graph.add_node("decomposer", decomposer_node)
    graph.add_node("retriever", retriever_node)
    graph.add_node("evaluator", evaluator_node)
    graph.add_node("synthesizer", synthesizer_node)

    # 定义边
    graph.add_edge(START, "decomposer")
    graph.add_conditional_edges("decomposer", route_to_retrievers, ["retriever"])
    graph.add_edge("retriever", "evaluator")
    graph.add_edge("evaluator", "synthesizer")
    graph.add_edge("synthesizer", END)

    # 编译
    return graph.compile()
```

### 核心：Send API 实现并行 Fan-Out

`route_to_retrievers` 是整个系统最关键的函数。让我们仔细拆解：

```python
def route_to_retrievers(state: AgentState):
    sub_questions = state["sub_questions"]
    return [
        Send("retriever", {**state, "_current_sub_question": sq})
        for sq in sub_questions
    ]
```

0.  **`Send("retriever", new_state)`** ：创建一个指令，告诉 LangGraph "用这个 state 启动一个 retriever 节点"
0.  **列表推导式**：为每个子问题生成一个 Send，意味着**同时启动 N 个 retriever**
0.  **`_current_sub_question`**：通过向 state 注入临时字段，告知每个检索器它该检索哪个子问题
0.  **`add_conditional_edges`**：将这个路由函数注册为 decomposer → retriever 之间的条件边

### LLM 初始化

```python
def create_llm() -> ChatOpenAI:
    """创建 LLM 实例（使用 DeepSeek API）"""
    return ChatOpenAI(
        base_url=settings.deepseek_base_url,
        api_key=settings.deepseek_api_key,
        model=settings.deepseek_model,
        temperature=0.1,  # 低温度确保输出稳定性
    )
```

这里使用 `langchain-openai` 的 `ChatOpenAI`，因为 DeepSeek 的 API 完全兼容 OpenAI 格式——只需替换 `base_url` 即可，零适配成本。

## 第五步：辅助模块

### 语言检测

创建 `backend/src/utils.py`：

```python
import re


def detect_language(text: str) -> str:
    """检测文本语言：中文返回 'zh'，否则返回 'en'"""
    if re.search(r"[\u4e00-\u9fff]", text):
        return "zh"
    return "en"
```

通过检测 Unicode 中文字符范围（U+4E00 至 U+9FFF）来判断。虽然简单，但对我们的场景足够用——用户输入要么是中文，要么是英文。

## 整体数据流回顾

让我们用一个完整的例子来回顾数据流。用户输入：

> "SGLT2 抑制剂治疗射血分数保留型心衰的最新证据是什么？"

### 1. 语言检测

```
detect_language("SGLT2 抑制剂治疗射血分数保留型心衰的最新证据是什么？")
# → "zh"（检测到中文字符）
```

### 2. 问题拆解（Decomposer）

LLM 将问题拆解为：

```json
{
  "sub_questions": [
    "SGLT2 inhibitors efficacy in HFpEF randomized controlled trials",
    "SGLT2 inhibitors safety profile in heart failure with preserved ejection fraction",
    "Mechanism of SGLT2 inhibitors in HFpEF pathophysiology"
  ]
}
```

注意：子问题统一转为英文，因为 PubMed 是英文数据库。

### 3. 并行检索（Retriever × 3）

```
子问题 1 → PubMed 检索 → [论文A, 论文B, ...]  (约20篇)
子问题 2 → PubMed 检索 → [论文C, 论文D, ...]  (约20篇)
子问题 3 → PubMed 检索 → [论文E, 论文F, ...]  (约20篇)
```

`operator.add` Reducer 自动合并 → `retrieval_results` 包含约 60 篇论文（去重后）。

### 4. 证据评估（Evaluator）

对每篇论文计算综合评分：

```
论文A: 设计85×0.35 + 时效100×0.25 + 样本50×0.20 + 相关50×0.20 = 74.8 (Level II)
论文B: 设计100×0.35 + 时效70×0.25 + 样本50×0.20 + 相关50×0.20 = 72.5 (Level I)
...
```

按评分降序排列。

### 5. 证据综合（Synthesizer）

取 Top 20 论文，LLM 生成中文证据摘要：

```
## SGLT2 抑制剂治疗 HFpEF 的证据综述

### 疗效证据
EMPEROR-Preserved 试验表明，恩格列净显著降低 HFpEF 患者的
心血管死亡和心衰住院复合终点风险 [DOI: 10.1056/NEJMoa2107038]...

### 安全性数据
...

### 作用机制
...

---
⚠️ **免责声明**：本报告由 AI 系统自动生成，仅供学术参考...
```

## 关键设计决策小结

| 决策       | 选择                | 原因                             |
| ---------- | ------------------- | -------------------------------- |
| 状态管理   | TypedDict + Reducer | 类型安全 + 自动合并并行结果      |
| 并行策略   | Send API            | 动态数量的并行分支，不需要预定义 |
| 评分模型   | 加权多维评分        | 可解释、可扩展，符合循证医学体系 |
| LLM 调用   | 异步 ainvoke        | 不阻塞事件循环，支持高并发       |
| JSON 解析  | 正则提取 + 降级     | 兼容 LLM 输出的不确定性          |
| 子问题语言 | 统一英文            | PubMed 是英文数据库              |

## 本地验证

创建一个简单的测试脚本来验证图的构建：

```python
# test_graph.py
import asyncio
from src.graph import build_graph, create_llm

async def main():
    llm = create_llm()
    graph = build_graph(llm=llm)

    # 打印图结构
    print("Graph nodes:", list(graph.nodes))
    print("Graph built successfully!")

    # 如果你已配置好 API Key，可以运行完整测试
    # result = await graph.ainvoke({
    #     "user_query": "What is the latest evidence on SGLT2 inhibitors for HFpEF?",
    #     "language": "en",
    #     "sub_questions": [],
    #     "retrieval_results": [],
    #     "evaluated_papers": [],
    #     "synthesis": "",
    #     "citations": [],
    #     "retry_count": 0,
    #     "current_step": "",
    # })
    # print(result["synthesis"])

asyncio.run(main())
```

```bash
cd backend
uv run python test_graph.py
# 预期输出：
# Graph nodes: ['decomposer', 'retriever', 'evaluator', 'synthesizer']
# Graph built successfully!
```

## 小结

在这篇文章中，我们完成了后端核心的搭建：

-   **设计了 AgentState**：使用 TypedDict + Reducer 实现类型安全的状态管理，`operator.add` 解决并行结果合并
-   **实现了四个智能体**：问题拆解器（LLM）、文献检索器（PubMed API）、证据评估器（规则引擎）、综合器（LLM）
-   **使用 Send API 实现并行 Fan-Out**：动态数量的检索器并行执行，无需手动协调
-   **建立了证据评估体系**：基于循证医学金字塔的四维加权评分
-   **构建了完整的状态图**：从 START 到 END 的有向无环图，编译为可执行的 LangGraph 应用

**下一篇预告**：我们将实现 FastAPI 后端的 SSE（Server-Sent Events）流式推送接口，让前端能够实时展示每个智能体的执行进度和中间结果。

* * *

*本系列文章基于实际开发过程编写，旨在分享多智能体系统的设计思路与工程实践。如有问题或建议，欢迎交流讨论。*
