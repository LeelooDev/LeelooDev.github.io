---
title: Claude Code Command Reference
group: Claude Code
---

Don't memorise the list. Index it by "where am I stuck right now" and your hands will find the command when it matters. What follows is ordered by moment of use, not alphabetically.

## Before starting work

`/plan` enters plan mode. For anything large or spanning several files, getting a plan first costs less than redoing the work.

`/model` switches models; `/effort` sets the reasoning tier (low / medium / high / xhigh / max). Raise it for hard problems, lower it for mechanical ones — a finer control than swapping models.

`/init` generates `CLAUDE.md`, and `/memory` edits it afterwards. Write the project conventions down once instead of restating them every session.

`/permissions` configures approval rules. When the same category of command keeps interrupting you with prompts, allowlist it here.

## When context fills up

`/context` shows what's occupying the window as a coloured grid — you can see at a glance what's eating the budget.

`/compact` summarises and carries on; `/clear` starts fresh but keeps project memory. The difference is whether a summary survives.

`/btw` asks a side question without writing it into the conversation history. Checking a syntax detail or confirming an API won't pollute your context.

## Before shipping

```
/diff  →  /code-review [--fix]  →  /security-review
```

`/code-review` reviews the current diff; add `ultra` for a cloud multi-agent pass. `/verify` checks that the implementation is actually correct, and `/simplify` does pure quality cleanup — it doesn't hunt bugs, that's `/code-review`'s job.

## When something breaks

`/doctor` checks your installation and configuration, and can fix what it finds. `/debug` turns on debug logging and diagnoses runtime issues.

`/rewind` is the most underrated one: it rolls back code *and* conversation to a checkpoint. No manual `git checkout` followed by re-explaining where you were.

## Working in parallel

`/tasks` lists background work and subagents, `/background` detaches the session to free your terminal, `/subtask` delegates one well-bounded job, and `/batch` drives a large change across many independent units at once.

## Across sessions

`/resume` returns to an earlier conversation, `/branch` forks the current one to try a different direction, and `/fork` copies it into a background session.

On the CLI side the equivalents are `--continue` and `--resume`, and **the difference is the cache**: `--continue` keeps the prompt cache, `--resume` clears it. To pick up exactly where you left off, the former is cheaper.

## Command line

```bash
claude -p "..."        # non-interactive, reads stdin, fits in scripts
claude --continue      # resume the last session, cache intact
claude agents          # list background sessions
claude doctor          # installation diagnostics without opening a session
claude plugin          # manage plugins
claude mcp             # manage MCP servers
```

`--add-dir` deserves its own note: it grants directory access *and* loads that directory's `.claude/skills/`. It's the only flag with that side effect — `additionalDirectories` in `settings.json` grants file access only, no skills.

## In one line

Fewer than ten see daily use: `/plan`, `/context`, `/compact`, `/effort`, `/diff`, `/code-review`, `/rewind`, `/resume`, `/doctor`, `/clear`. Look the rest up when you hit the problem they solve.
