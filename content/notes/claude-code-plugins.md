---
title: Claude Code 插件怎么选
date: 2026-08-02
group: Claude Code
groupOrder: 4
noteOrder: 3
cover: /images/note-claude-code-plugins-cover.svg
coverAlt: 手绘风格的插头与插座图标
---

插件不是装越多越好。每个插件都有一份 **always_on 开销**——不管你这次用不用，它的描述都常驻在上下文里。装到二十个以上，光是这些描述就能吃掉几千 token，而那正是你本来想留给代码的空间。

所以选插件要看两个数：有多少人在用，以及它常驻多少。

## 装机量前十

官方目录里 178 个插件，按安装量排（截至 2026 年 5 月的目录快照）：

| 插件 | 安装量 | 常驻 | 构成 |
|-|-|-|-|
| frontend-design | 76.0 万 | 91 | 1 skill |
| superpowers | 68.2 万 | 723 | 14 skills |
| context7 | 32.8 万 | 0 | MCP |
| code-review | 32.3 万 | 25 | 1 命令 |
| code-simplifier | 26.5 万 | 69 | 1 agent |
| skill-creator | 25.6 万 | 117 | 1 skill |
| github | 24.6 万 | 0 | MCP |
| playwright | 23.0 万 | 0 | MCP |
| feature-dev | 20.7 万 | 243 | 1 命令 + 3 agents |
| claude-md-management | 20.5 万 | 180 | 1 skill + 1 命令 |

## MCP 型插件常驻为零

注意上表里 context7、github、playwright 的常驻都是 **0**。MCP 型插件的工具定义是按需拉取的，不像 skill 那样要先把描述摆进上下文。

这条规律很实用：**接外部服务的插件可以放心装，带一堆 skill 的插件要挑着装**。

反过来看常驻最贵的那几个，全是 skill 大礼包：

```
twilio-developer-kit   8752 tok   55 skills
posthog                6317 tok   39 skills
azure                  6135 tok   27 skills
aws-dev-toolkit        5103 tok   34 skills
```

装一个 twilio-developer-kit，等于每轮对话先付掉 8700 token 的入场费。如果你一个月用不上两次，这笔钱不该花——需要时临时装、用完卸更划算。

## 我常开的那几个

装了二十个，常驻合计约 3475 token，构成大致是：

- **superpowers**（723）—— 一整套开发流程 skill：头脑风暴、写计划、执行计划、系统化调试、TDD。日常触发最频繁的一个。
- **feature-dev**（243）—— 三个专职 agent：探索代码、设计架构、审查实现。做新功能时按这个顺序走一遍很省心。
- **pr-review-toolkit**（2038）—— 六个审查 agent，是这批里最贵的。只在开始做 PR 审查时才值这个价，纯写代码的日子可以关掉。
- **frontend-design**（91）—— 便宜，前端项目里性价比很高。
- **各语言 LSP**（typescript / rust-analyzer / clangd / swift，全部 0）—— 常驻为零，对应语言的项目直接装上，没有理由不装。

## 管理

```bash
claude plugin          # 命令行侧管理
/plugin                # 会话里装卸和启停
/context               # 装完回来看一眼上下文占用变化
```

装完一批插件后跑一次 `/context` 是个好习惯——它会直接告诉你这些插件到底吃掉了多少。

## 一句话

先按需要装 MCP 型（免费），再挑一到两个流程型 skill 包（superpowers 这类），剩下的等真正撞上场景再说。上下文是有限资源，插件列表该定期删一遍。
