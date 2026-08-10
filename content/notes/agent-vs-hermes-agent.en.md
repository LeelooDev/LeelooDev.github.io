---
title: "Agent vs. Hermes Agent: Concept, Framework, and Boundaries"
group: AI Engineering
---

The short answer: **an agent is a system pattern; Hermes Agent is one concrete open-source implementation of that pattern.** They are not peer concepts, and choosing one does not exclude the other.

## Agent is the general concept

A production agent usually combines:

```text
Agent = model + decision loop + tools + state/memory + permissions and stop conditions
```

The model interprets and decides, tools connect it to files, search, databases, or services, and the loop lets it act again after observing a result. The engineering challenge is reliable tool contracts, budgets, permissions, result verification, and recovery—not vague autonomy.

An agent is therefore not a package, model, or UI. It can be built from scratch, assembled with a framework, or consumed as a finished product.

## Hermes Agent is a concrete framework

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is an open-source agent framework from Nous Research. It provides terminal and messaging interfaces, model-provider adapters, tools, Skills, persistent memory, MCP integration, scheduled tasks, and subagents. It is designed to get a personal or server-based agent running quickly.

**Hermes Agent is not the Hermes model itself.** The project supports multiple providers and custom endpoints, so it is better understood as an agent runtime and product framework than as a fixed model.

| Dimension | Agent | Hermes Agent |
| --- | --- | --- |
| Level | General architecture and product concept | A specific Nous Research implementation |
| Runnable by itself | No | Yes, with CLI, gateway, and runtime |
| Tool extension | Defined by each project | Built-ins plus Skills and MCP |
| Memory and tasks | No universal standard | Persistent memory, session search, cron, and subagents |
| Model choice | Any | Multiple providers and custom endpoints |
| Control | Highest when built in-house | Faster integration, with framework conventions |

## Should we use Hermes Agent?

**Yes as an adapter, not as a replacement for the current core.** Our project already has a product-specific Electron/macOS UI, local Markdown ingestion, SQLite FTS5, vector retrieval, RRF fusion, local reranking, and clickable citations with exact line ranges.

Hermes is most valuable as an orchestration layer and ecosystem. The recommended boundary is:

1. Keep the contracts of `search_knowledge`, `read_markdown`, `get_note_outline`, and `list_markdown_files` stable and read-only.
2. Keep local indexing, hybrid retrieval, citation evidence, and evaluation; do not move raw notes to hosted retrieval.
3. When messaging channels, cron, Skills, or subagents are needed, expose those four tools to Hermes through MCP or a small adapter.
4. Treat Hermes as an optional entry point while the desktop product retains its own agent loop.
5. Keep writes separately authorized, with tool-call limits, timeouts, cancellation, and post-action verification.

## When integration becomes worthwhile

- A personal assistant must run across terminals and messaging platforms.
- Scheduled tasks, reusable Skills, durable memory, or parallel subtasks become product requirements.
- We want to compare models and agent behavior without first building another runtime.

If the current goal remains accurate local knowledge Q&A, on-device data, and citations that resolve to exact source lines, improving the existing agent is the better choice.

## Decision

**Keep the in-house agent and retrieval core, reserve an MCP-compatible boundary, and do not migrate to Hermes Agent yet.** This preserves local privacy, exact citations, and evaluation while leaving the Hermes ecosystem available later.

References: [official repository](https://github.com/NousResearch/hermes-agent) · [official documentation](https://hermes-agent.nousresearch.com/docs/)
