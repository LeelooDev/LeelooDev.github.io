---
title: Claude Code Skills 的写法与加载规则
date: 2026-08-02
group: Claude Code
groupOrder: 4
noteOrder: 2
cover: /images/note-claude-code-skills-cover.svg
coverAlt: 手绘风格的工具箱图标
---

判断一段内容该进 `CLAUDE.md` 还是该做成 skill，标准很简单：**事实进 CLAUDE.md，流程进 skill**。前者常驻上下文，后者只有被用到时才加载——所以再长的参考资料做成 skill 都几乎不花成本。

当你发现自己在反复粘贴同一套步骤，或者 CLAUDE.md 里某一节已经从「说明」长成了「流程」，就该拆出来了。

## 最小结构

```
~/.claude/skills/summarize-changes/
└── SKILL.md          # 必需，其余都可选
```

目录名就是命令名，写完即可 `/summarize-changes` 调用。`SKILL.md` 由 YAML frontmatter 加正文组成，frontmatter 里 `description` 最关键——**它决定 Claude 会不会在合适的时机自动想起这个 skill**，写得含糊就只能靠手动调用。

## frontmatter 常用字段

| 字段 | 作用 |
|-|-|
| `name` / `description` | 名字与触发时机，description 直接影响自动调用 |
| `argument-hint` | 自动补全时的参数提示，如 `[issue-number]` |
| `disable-model-invocation` | 设 `true` 则只能手动 `/name` 调，Claude 不会自己用 |
| `allowed-tools` | 限定这个 skill 能用哪些工具 |
| `context: fork` | 在独立子 Agent 上下文里跑，不占用主对话 |

部署、提交、发版这类「我说了才能做」的流程，加 `disable-model-invocation: true`；输出很长的调研类流程，加 `context: fork` 让它在子 Agent 里跑完再把结论带回来。

## 三个位置，一套优先级

| 层级 | 路径 | 作用范围 |
|-|-|-|
| 个人 | `~/.claude/skills/<name>/SKILL.md` | 你的所有项目 |
| 项目 | `.claude/skills/<name>/SKILL.md` | 仅该项目 |
| 插件 | `<plugin>/skills/<name>/SKILL.md` | 插件启用处 |

同名时**企业 > 个人 > 项目**，并且任意一层都能覆盖内置 skill——在项目里放一个 `code-review`，内置的 `/code-review` 就被替换掉了。插件的 skill 走 `plugin-name:skill-name` 命名空间，不参与这场冲突。

## 三个容易踩的点

**嵌套 skill 不在启动时加载。** monorepo 里 `apps/web/.claude/skills/` 的 skill，要等 Claude 真的读写过那个子目录里的文件才可用。在那之前它不出现在自动补全里，也没法按名字调——不是坏了，是还没轮到它。

**改 SKILL.md 当场生效，新建顶层目录要重启。** 正文改动会被实时监测到；但如果会话启动时 `~/.claude/skills/` 还不存在，新建之后必须重启才会被监听。

**云端会话读不到本机的个人 skill。** 定时任务、Cowork、云会话都是全新的远程会话，不会读你机器上的 `~/.claude/skills/`。要让它们能用，得把 skill 提交进仓库的 `.claude/skills/`，或者打包成插件在仓库的 `.claude/settings.json` 里声明。

## 顺带一提

自定义命令已经并入 skills 了：`.claude/commands/deploy.md` 和 `.claude/skills/deploy/SKILL.md` 都产生 `/deploy`，行为一致。老的 `commands/` 文件继续能用，但只有 skill 形态支持配套文件、调用控制和自动加载。同名时 skill 优先。
