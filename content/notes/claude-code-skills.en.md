---
title: How Claude Code Skills Are Written and Loaded
group: Claude Code
coverAlt: A hand-drawn toolbox
---

Deciding whether something belongs in `CLAUDE.md` or in a skill is simple: **facts go in CLAUDE.md, procedures go in a skill**. The former stays resident in context; the latter loads only when used — which is why even a long reference document costs almost nothing as a skill.

The moment you notice you're pasting the same sequence of steps again, or that a section of CLAUDE.md has grown from description into procedure, it's time to split it out.

## The minimum

```
~/.claude/skills/summarize-changes/
└── SKILL.md          # required, everything else optional
```

The directory name becomes the command, so `/summarize-changes` works as soon as the file exists. `SKILL.md` is YAML frontmatter plus markdown, and `description` is the field that matters most — **it decides whether Claude reaches for the skill on its own**. Write it vaguely and you're stuck invoking it by hand.

## Frontmatter worth knowing

| Field | What it does |
|-|-|
| `name` / `description` | Name and trigger conditions; description drives automatic invocation |
| `argument-hint` | Autocomplete hint, e.g. `[issue-number]` |
| `disable-model-invocation` | `true` means manual `/name` only — Claude won't trigger it |
| `allowed-tools` | Restricts which tools the skill may use |
| `context: fork` | Runs in its own subagent context instead of the main conversation |

For deploy, commit and release procedures — the ones that should only run when you say so — set `disable-model-invocation: true`. For research-shaped work with long output, `context: fork` lets it run in a subagent and return only the conclusion.

## Three locations, one precedence order

| Level | Path | Scope |
|-|-|-|
| Personal | `~/.claude/skills/<name>/SKILL.md` | All your projects |
| Project | `.claude/skills/<name>/SKILL.md` | That project only |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | Wherever the plugin is enabled |

On a name collision, **enterprise beats personal beats project**, and any level overrides a bundled skill — drop a `code-review` into a project and the built-in `/code-review` is replaced. Plugin skills live under a `plugin-name:skill-name` namespace and stay out of the contest entirely.

## Three things that catch people out

**Nested skills don't load at startup.** In a monorepo, a skill under `apps/web/.claude/skills/` only becomes available after Claude has actually read or edited a file in that subdirectory. Until then it won't appear in autocomplete and can't be invoked by name — not broken, just not its turn yet.

**Editing SKILL.md takes effect immediately; creating a new top-level directory doesn't.** Body changes are picked up live. But if `~/.claude/skills/` didn't exist when the session started, you have to restart before it's watched.

**Cloud sessions can't see your personal skills.** Scheduled tasks, Cowork and cloud sessions all start as fresh remote sessions and never read `~/.claude/skills/` from your machine. To make one available there, commit it to the repository's `.claude/skills/` or ship it in a plugin declared in the repo's `.claude/settings.json`.

## Also worth knowing

Custom commands have been merged into skills: `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both produce `/deploy` and behave identically. Existing `commands/` files keep working, but only the skill form supports supporting files, invocation control and automatic loading. When both exist under one name, the skill wins.
