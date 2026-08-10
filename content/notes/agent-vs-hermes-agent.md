---
title: Agent 与 Hermes Agent：概念、框架与选型边界
date: 2026-08-10
group: AI 工程
groupOrder: 2
noteOrder: 1
---

先说结论：**Agent 是一种系统形态，Hermes Agent 是这种形态的一套具体开源实现。** 二者不是同级概念，也不是必须二选一。

## Agent 是通用概念

一个可落地的 AI Agent，通常由这些部分组成：

```text
Agent = 模型 + 决策循环 + 工具 + 状态/记忆 + 权限与停止条件
```

模型负责理解与决策，工具连接文件、搜索、数据库或外部服务，循环允许它根据结果继续行动。工程重点不在“能不能自主思考”，而在工具契约、执行预算、权限边界、结果验证和失败恢复是否可靠。

Agent 因而不是某个包、某个模型或某个 UI。自己写循环、使用框架、接入现成产品，都可以实现 Agent。

## Hermes Agent 是具体框架

[Hermes Agent](https://github.com/NousResearch/hermes-agent) 是 Nous Research 开源的一套可运行 Agent 框架。它已经提供终端与消息入口、模型提供商适配、工具系统、Skills、持久记忆、MCP、定时任务和子 Agent 等能力，适合快速搭建个人助理或服务器 Agent。

需要特别区分：**Hermes Agent 不是 Hermes 模型本身。** 官方实现支持切换多种模型和服务商，因此它更接近 Agent 运行时与产品框架，而不是一个固定大模型。

| 维度 | Agent | Hermes Agent |
| --- | --- | --- |
| 层级 | 通用架构与产品概念 | Nous Research 的具体开源实现 |
| 是否可直接运行 | 否，需要自己实现或选择框架 | 是，提供 CLI、网关和完整运行时 |
| 工具扩展 | 由项目自行定义 | 内置工具，并支持 Skills 与 MCP |
| 记忆与任务 | 没有统一标准 | 提供持久记忆、会话检索、定时任务与子 Agent |
| 模型选择 | 任意 | 支持多家模型服务与自定义端点 |
| 控制程度 | 自研时最高 | 接入快，但要接受其运行时和约定 |

## 我们是否应该使用 Hermes Agent

**可以接，但不应该直接替换现有工程。** 当前项目已经具备更贴合产品目标的核心能力：Electron/macOS 桌面界面、本地 Markdown、SQLite FTS5、向量召回、RRF 融合、本地重排，以及带精确行号的可点击引用。

Hermes Agent 最有价值的部分是编排与生态，而不是替代这套检索层。建议保持以下边界：

1. 保留 `search_knowledge`、`read_markdown`、`get_note_outline`、`list_markdown_files` 四个只读工具的参数和返回格式。
2. 保留本地索引、混合检索、引用证据集与评测基准，不把原始笔记上传给第三方托管检索。
3. 如果需要 Telegram/Discord、Cron、Skills 或子 Agent，再用 MCP 或工具适配层把这四个工具接给 Hermes Agent。
4. Hermes 只做可选的编排入口；桌面产品仍使用自己的 Agent 循环，避免 UI、权限和引用语义被框架绑定。
5. 所有写操作继续单独授权，设置工具调用上限、超时、取消和执行后校验。

## 什么时候值得接入

- 需要跨终端、消息平台持续运行的个人助理。
- 需要定时任务、可复用 Skills、长期记忆或并行子任务。
- 希望快速验证不同模型与 Agent 行为，不想先重写完整运行时。

如果当前目标仍是“本地知识库准确问答、数据不出本机、引用必须落到原文行号”，继续完善现有 Agent 更合适。等出现明确的多渠道或自动化需求，再把 Hermes 当作可替换适配器接入。

## 当前决策

**保留自研 Agent 与检索核心，预留 MCP 兼容层，暂不迁移到 Hermes Agent。** 这样既能复用 Hermes 的生态，也不会牺牲现有工程最重要的本地隐私、精确引用和可评测性。

参考：[Hermes Agent 官方仓库](https://github.com/NousResearch/hermes-agent) · [官方文档](https://hermes-agent.nousresearch.com/docs/)
