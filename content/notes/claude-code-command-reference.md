---
title: Claude Code 指令速查
date: 2026-08-02
group: Claude Code
groupOrder: 4
noteOrder: 1
cover: /images/cover-telephone.jpg
coverAlt: 墙上的老式壁挂电话
---

命令不用背。按「现在卡在哪一步」去记，需要的时候手会自己敲出来。下面按使用时机排，不按字母序。

## 干活前先摆好姿势

`/plan` 进计划模式——改动大、涉及多文件时先让它出方案，比直接动手省返工。

`/model` 换模型，`/effort` 调推理档位（low / medium / high / xhigh / max）。难题调高，机械活调低，这比换模型更细粒度。

`/init` 生成 `CLAUDE.md`，`/memory` 之后再改。项目约定写进去一次，省掉每轮重复交代。

`/permissions` 配批准规则。被同一类命令反复弹窗打断时，来这里加白名单。

## 上下文快满的时候

`/context` 看当前上下文占用，彩色网格一眼看出谁在吃配额。

`/compact` 压缩历史继续干，`/clear` 直接开新对话但保留项目内存。区别是前者留摘要，后者不留。

`/btw` 问一句题外话而不写进对话历史——查个语法、确认个用法，用它不会污染上下文。

## 交付前

```
/diff  →  /code-review [--fix]  →  /security-review
```

`/code-review` 审当前 diff，加 `ultra` 走云端多 Agent 审查。`/verify` 验证实现是否真的对，`/simplify` 做纯质量的清理（它不找 bug，找 bug 是 `/code-review` 的事）。

## 出问题时

`/doctor` 检查安装和配置，能顺手修。`/debug` 开调试日志并诊断运行时问题。

`/rewind` 是最被低估的一个：代码和对话一起回滚到检查点。改崩了不用手动 `git checkout` 再重述上下文。

## 并行

`/tasks` 看后台任务和子 Agent，`/background` 把当前会话丢到后台释放终端，`/subtask` 委托一件边界清晰的活，`/batch` 在多个独立单元上并行推大规模改动。

## 会话之间

`/resume` 回到之前的对话，`/branch` 从当前对话分叉去试另一条路，`/fork` 复制一份到后台跑。

命令行侧对应的是 `--continue` 和 `--resume`——**两者的区别在缓存**：`--continue` 保留提示缓存，`--resume` 清掉。想接着刚才的活干，用前者更省。

## 命令行

```bash
claude -p "..."        # 非交互，读 stdin，适合塞进脚本
claude --continue      # 接着上次干，保留缓存
claude agents          # 列出后台会话
claude doctor          # 不开会话直接看安装诊断
claude plugin          # 管理插件
claude mcp             # 管理 MCP 服务器
```

`--add-dir` 值得单独记：它既放开目录访问权限，也会加载该目录下的 `.claude/skills/`——这是唯一有这个副作用的开关，`settings.json` 里的 `additionalDirectories` 只给文件权限，不带 skills。

## 一句话

真正每天在用的不超过十个：`/plan`、`/context`、`/compact`、`/effort`、`/diff`、`/code-review`、`/rewind`、`/resume`、`/doctor`、`/clear`。其余等撞上具体问题时再查。
