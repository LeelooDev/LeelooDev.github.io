---
title: Choosing Claude Code Plugins
group: Claude Code
coverAlt: A street wall covered in colourful graffiti
---

More plugins is not better. Each one carries an **always-on cost** — its descriptions sit in your context whether or not you use it that session. Past twenty plugins those descriptions alone can consume several thousand tokens, and that's exactly the space you wanted for code.

So there are two numbers to look at: how many people use it, and how much it costs while idle.

## The top ten by installs

Out of 178 plugins in the official catalog, ranked by installs (catalog snapshot as of May 2026):

| Plugin | Installs | Always-on | Contents |
|-|-|-|-|
| frontend-design | 760k | 91 | 1 skill |
| superpowers | 682k | 723 | 14 skills |
| context7 | 328k | 0 | MCP |
| code-review | 323k | 25 | 1 command |
| code-simplifier | 265k | 69 | 1 agent |
| skill-creator | 256k | 117 | 1 skill |
| github | 246k | 0 | MCP |
| playwright | 230k | 0 | MCP |
| feature-dev | 207k | 243 | 1 command + 3 agents |
| claude-md-management | 205k | 180 | 1 skill + 1 command |

## MCP plugins are free to keep

Note that context7, github and playwright all cost **0**. MCP-shaped plugins fetch their tool definitions on demand rather than parking descriptions in context the way skills must.

That gives a useful rule: **plugins that connect to external services can be installed freely; plugins that bundle a pile of skills need choosing.**

The most expensive entries are all skill bundles:

```
twilio-developer-kit   8752 tok   55 skills
posthog                6317 tok   39 skills
azure                  6135 tok   27 skills
aws-dev-toolkit        5103 tok   34 skills
```

Installing twilio-developer-kit means paying an 8,700-token entry fee on every turn. If you touch it twice a month, that's not worth it — install when needed, remove afterwards.

## What I keep enabled

Twenty installed, roughly 3,475 tokens resident, mostly:

- **superpowers** (723) — a full development-process suite: brainstorming, writing plans, executing them, systematic debugging, TDD. The most frequently triggered of the set.
- **feature-dev** (243) — three dedicated agents for exploring code, designing architecture and reviewing the result. Walking a new feature through them in order works well.
- **pr-review-toolkit** (2038) — six review agents, and the most expensive item here. Worth the price during review work; worth disabling on pure writing days.
- **frontend-design** (91) — cheap, and pays for itself on any frontend project.
- **Language LSPs** (typescript / rust-analyzer / clangd / swift, all 0) — zero resident cost, so there's no reason not to install the one matching your project.

## Managing them

```bash
claude plugin          # from the command line
/plugin                # install, remove and toggle in-session
/context               # check what the change did to your window
```

Running `/context` after installing a batch is a good habit — it tells you directly how much those plugins are consuming.

## In one line

Install MCP-shaped plugins as needed (they're free), pick one or two process suites like superpowers, and leave the rest until a real situation calls for them. Context is a finite resource, and the plugin list deserves a periodic prune.
