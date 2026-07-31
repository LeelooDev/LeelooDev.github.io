---
title: "Building a Clinical Literature Research Agent, Part 2: LangGraph Orchestration"
excerpt: Use LangGraph state, reducers and dynamic parallel branches to coordinate question decomposition, literature retrieval, evidence evaluation and synthesis.
tags: [AI, LangGraph, Agents, Python]
coverAlt: Small boats moored in a river bend surrounded by jungle
---

> The first part established the architecture and a working vertical slice. This part implements the workflow graph that moves a research question through decomposition, parallel retrieval, evidence evaluation and cited synthesis.

## Design one explicit state

Shared state is the contract between nodes:

```python
class ResearchState(TypedDict):
    question: str
    subquestions: list[str]
    queries: list[str]
    candidates: Annotated[list[Paper], operator.add]
    screened: list[Paper]
    evidence: Annotated[list[EvidenceAssessment], operator.add]
    report: ResearchReport | None
    errors: Annotated[list[str], operator.add]
```

Reducers matter for parallel work. Without them, two retrieval branches can overwrite one another instead of combining results.

## Keep nodes narrow

Useful nodes include:

- `clarify_question`;
- `decompose_question`;
- `build_queries`;
- `retrieve_query`;
- `deduplicate_and_screen`;
- `evaluate_paper`;
- `synthesize_report`;
- `validate_citations`.

Each node should do one kind of work and return only the fields it changes.

```python
async def retrieve_query(state: QueryState) -> dict:
    papers = await literature_provider.search(
        query=state["query"],
        limit=state["limit"],
    )
    return {"candidates": papers}
```

## Use dynamic parallel branches

The number of search queries is not known until the question is decomposed. LangGraph `Send` can create branches from runtime data:

```python
def fan_out_queries(state: ResearchState):
    return [
        Send("retrieve_query", {"query": query, "limit": 25})
        for query in state["queries"]
    ]
```

The same pattern can evaluate retained papers concurrently, but concurrency still needs limits. PubMed, full-text providers and model APIs each have different rate and timeout constraints.

## Deduplicate before expensive evaluation

Merge by PMID or DOI, then normalize titles for records without stable IDs. Screening can use transparent rules before a model:

- publication date;
- language;
- article type;
- human versus animal study;
- presence of an abstract;
- duplicate cohort or secondary analysis.

The model should receive a smaller set and return structured relevance and evidence fields.

## Build evidence objects

```python
class EvidenceAssessment(BaseModel):
    paper_id: str
    relevance: Literal["high", "medium", "low"]
    study_design: str
    population: str
    intervention: str | None
    comparator: str | None
    outcomes: list[str]
    limitations: list[str]
    supporting_quotes: list[str]
```

Supporting excerpts make the synthesis auditable and reduce the temptation to summarize beyond the retrieved material.

## Handle partial failure

One failed search or paper should not destroy the entire run. Capture branch errors, continue with valid evidence and report coverage limitations.

Use retries only for temporary failures. Invalid queries, missing identifiers and access restrictions need explicit outcomes, not exponential retry loops.

## Validate the final report

After synthesis:

1. Extract every cited paper ID.
2. Confirm it exists in the retained evidence set.
3. Reject uncited major claims.
4. Preserve conflicting findings and study limitations.
5. Include the exact search date and coverage.

## Test the graph

Unit-test nodes with fixtures, then test the compiled graph with deterministic provider adapters. Snapshot important state transitions rather than only comparing final prose.

The value of orchestration is not the number of agents. It is making concurrency, state and recovery explicit enough that every research run can be explained.
