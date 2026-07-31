---
title: "Enterprise AI Agents, Part 2: Design the Tool Interface as a Product"
excerpt: Refactor a ticketing agent from thin API wrappers into a production-grade agent-computer interface with better granularity, errors, write gates and observability.
tags: [AI, Agents, LLM, Engineering Practice]
coverAlt: A figure entering a green door set in a weathered red wall
---

> The first part reduced an agent to a guarded loop. This part focuses on the layer that determines what the loop can actually accomplish: the tool interface.

## The interface changes performance

Agents do not experience a product through screens. They experience names, descriptions, schemas and returned data. This layer is an agent-computer interface, or ACI.

A direct wrapper around every backend endpoint is rarely a good ACI. Existing APIs are often optimized for frontend screens, service ownership or historical compatibility rather than model decisions.

## Begin with real tasks

Suppose a support agent must:

- find recent billing tickets;
- inspect the customer and order;
- propose a response;
- issue a refund only after approval;
- notify the customer.

Design tools around these decisions, not around database tables.

```text
search_tickets(query, status, created_after, limit)
get_ticket_context(ticket_id)
draft_resolution(ticket_id, resolution_type, message)
apply_refund(ticket_id, amount, reason, idempotency_key)
send_customer_reply(ticket_id, draft_id)
```

`get_ticket_context` can safely combine ticket, customer and order data that the model nearly always needs together.

## Descriptions should prevent mistakes

A useful tool description includes:

- what the tool returns;
- when it should be used;
- when it should not be used;
- required permissions;
- side effects;
- important limits and defaults.

Argument descriptions should use business language. Replace generic fields like `type` or `value` with `resolution_type` and `refund_amount_cents`.

## Return decision-ready results

Do not return a raw 200 KB API payload. Return the identifiers, status, constraints and next valid actions the model needs.

```json
{
  "ticket_id": "T-1842",
  "order_status": "delivered",
  "refundable_amount_cents": 4200,
  "customer_tier": "standard",
  "allowed_actions": ["reply", "partial_refund"],
  "warnings": []
}
```

Keep source identifiers so the application can audit later decisions.

## Errors should guide recovery

“Request failed” teaches the agent nothing. Prefer a typed result:

```json
{
  "error": "REFUND_LIMIT_EXCEEDED",
  "message": "Requested 5000 cents; maximum refundable amount is 4200.",
  "retryable": false,
  "suggested_action": "Ask for approval to refund 4200 cents or less."
}
```

The model should not invent recovery rules that the business system already knows.

## Put three gates around writes

1. **Authorization** verifies that the user and agent may perform the action.
2. **Confirmation** displays the exact consequence at the execution point.
3. **Idempotency and verification** prevent duplicates and confirm the authoritative result.

Separate `draft_*` from `send_*`, and `prepare_*` from `apply_*`. This makes consequential boundaries visible in both code and UX.

## MCP does not remove interface design

MCP can standardize how tools and resources are exposed, but it does not automatically make them understandable, safe or task-oriented. Treat an MCP server as a product surface:

- version schemas deliberately;
- keep permissions narrow;
- document side effects;
- return bounded results;
- trace every call;
- test with representative tasks.

## Measure the tool layer

Track tool selection accuracy, argument correction rate, unnecessary calls, step count, write rejections, latency and task completion. Compare interfaces with the model held constant whenever possible.

The model supplies reasoning, but the tool interface defines the available moves. Designing that interface well is one of the highest-leverage improvements in an agent system.
