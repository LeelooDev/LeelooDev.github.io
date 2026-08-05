---
title: Agent Workflow Guardrails
group: AI Engineering
---

For an agent that can call tools, the critical question is not whether it can plan autonomously. Every step must be observable, cancellable, and retryable.

## Tool contracts

Every tool should define:

- Input fields, defaults, and limits.
- Whether it is read-only or creates an external side effect.
- Timeout, retry, and idempotency semantics.
- Actionable failure information returned to the model.
- Actions that require user confirmation.

A tool description should also explain when the tool must not be called. Positive-only instructions encourage an agent to overreach when uncertain.

## Loop budget

```python
budget = {
    "max_steps": 12,
    "max_tool_calls": 20,
    "deadline_seconds": 90,
}
```

When the budget is exhausted, return completed work, remaining work, and the last reliable state. Do not hide failure behind more tool calls.

## Three gates for writes

1. **Planning gate**: identify the goal, target, and impact radius.
2. **Confirmation gate**: confirm deletion, publishing, payment, and messaging at the execution point.
3. **Verification gate**: read the authoritative state after a write instead of trusting a success response.

## Minimum logging

Record run ID, step, tool name, elapsed time, input summary, result summary, error class, and token usage. Redact sensitive information before it reaches logs.

Once guardrails, budgets, and state verification are explicit, agent autonomy becomes an engineering capability that can actually be shipped.
