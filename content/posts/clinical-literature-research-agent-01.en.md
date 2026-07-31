---
title: "Building a Clinical Literature Research Agent, Part 1: Architecture and Setup"
excerpt: Design and bootstrap a multi-agent application that searches, evaluates and synthesizes biomedical literature with a FastAPI backend and React interface.
tags: [AI, LangGraph, FastAPI, React, Medical Research]
coverAlt: An aerial view of an autumn forest and winding river
---

> This series builds a clinical literature research system from requirements and architecture through implementation. The first part establishes the system boundaries, technology choices and working frontend/backend skeleton.

## Why build it?

Clinicians and researchers often need to answer a narrow question using evidence scattered across millions of PubMed records. Manual search, screening and synthesis can take hours or days.

A research agent can help with the mechanical work:

- decompose a clinical question;
- create search strategies;
- retrieve candidate papers;
- screen relevance;
- assess evidence quality;
- synthesize findings with citations.

It must not make clinical decisions. The product is a transparent research assistant whose sources and intermediate decisions remain inspectable.

## Define the workflow before the agents

Use a simple sequence:

```text
question
  → clarify and decompose
  → generate search queries
  → retrieve literature
  → screen and deduplicate
  → evaluate evidence
  → synthesize with citations
```

Each stage should have typed input and output. This makes it possible to test the pipeline without calling a model for every case.

## Proposed architecture

The system has four major areas:

1. **React client** for the research question, progress and cited result.
2. **FastAPI service** for validation, authentication and streamed events.
3. **LangGraph workflow** for state, branching and recovery.
4. **Provider adapters** for PubMed, full text and model APIs.

Keep external services behind interfaces so tests can substitute deterministic fixtures.

```python
class LiteratureProvider(Protocol):
    async def search(self, query: str, limit: int) -> list[Paper]:
        ...

    async def fetch_details(self, ids: list[str]) -> list[Paper]:
        ...
```

## Model the domain

A paper should keep stable identifiers and provenance:

```python
class Paper(BaseModel):
    pmid: str
    title: str
    abstract: str
    journal: str | None
    publication_year: int | None
    authors: list[str]
    source_url: str
```

Evaluation output should separate model judgment from source facts. Store relevance, study type, limitations and supporting excerpts explicitly.

## Stream progress, not private reasoning

The interface benefits from events such as:

- planning search;
- retrieving 86 candidates;
- 24 papers after screening;
- evaluating evidence;
- writing synthesis.

Do not stream hidden chain-of-thought. Send structured product events and a short explanation of what stage is running.

```ts
type ResearchEvent =
  | { type: 'stage'; stage: string; message: string }
  | { type: 'paper_count'; total: number; retained: number }
  | { type: 'complete'; result: ResearchReport }
  | { type: 'error'; code: string; message: string }
```

## Project setup

Create a small vertical slice first:

- React submits one question.
- FastAPI validates it.
- A mocked workflow emits three progress events.
- The client displays a cited placeholder report from fixtures.

Once this path works, replace one mock at a time with PubMed search, model decomposition and evidence assessment.

## Safety and evaluation

Every claim in the final report must reference a retrieved paper. Record query strings, filters, candidate IDs and excluded reasons. Add a warning that the output supports research and is not medical advice.

Before optimizing prompts, create test questions and known relevant papers. Measure retrieval recall, screening precision, citation correctness and whether limitations survive synthesis.

The foundation is successful when the complete flow is typed, observable and testable even before the first sophisticated agent is added.
