---
title: 从零写一个企业级 Agent：参考 Pi 与 Claude Code 的 16 步 TypeScript 实战
date: 2026-08-10T23:59:00
category: code
tags: [AI Agent, Pi Agent, Claude Code, TypeScript, 工程实践, 系统架构]
cover: /images/pi-agent-harness-cover.jpg
coverAlt: 黑色天空下，一轮红色太阳从云海升起，金色光线向四周放射
coverFit: cover
coverPosition: center 50%
excerpt: 不再停留在架构名词：从一个能运行的 Pi Agent 开始，逐步写出认证、会话隔离、任务状态机、工具网关、队列、断点续跑、RAG、限流、缓存、观测、评测和优雅发布，形成可上线的 TypeScript Agent 服务骨架。
dek: Agent 循环只占很小一部分；这篇文章把循环外面的生产工程，按代码文件和验收条件一步一步补齐。
---

> 这是一篇“照着做”的教程，不是一篇新的架构名词综述。最终要做出来的是一个企业工单 Agent：用户提交任务后立即得到 `run_id`，后台 Worker 调用模型和工具，任务可以查询进度、取消、失败重试和断点恢复；每次模型调用、工具调用、Token、耗时和权限决策都有记录，不同租户的数据不会混在一起。

上一篇[《企业级 AI Agent + RAG 架构选型》](/posts/ai-agent-architecture-selection-guide)回答“应该选哪类架构”，[《Pi Agent Harness 源码拆解》](/posts/pi-agent-harness-source-analysis)回答“Pi 内部怎样运行”。本文只回答剩下的实际问题：**项目目录怎样建、代码从哪里开始写、每一层写到什么程度才算可以进入下一步。**

本文选择 TypeScript、Node.js 22、PostgreSQL、Redis、任务队列和 [`@earendil-works/pi-agent-core`](https://github.com/earendil-works/pi/tree/main/packages/agent) 演示。Pi 只负责内层模型—工具循环，企业平台能力仍由我们自己实现。换成 LangGraph、OpenAI Agents SDK 或其他内核，外层的身份、状态、工具、队列和治理代码也不应跟着推倒重来。

## 阅读路线

全文分为四段，建议按顺序动手：

1. **先让它跑起来**：用 Pi 写出一个有最大轮次和绝对超时的最小 Agent。
2. **把一次调用改成企业任务**：加入 API、数据库、租户上下文、幂等和队列。
3. **把工具调用改成受控执行**：加入授权、Schema、沙箱、检查点、重试和取消。
4. **达到上线条件**：加入 RAG、缓存、观测、评测、容量控制和优雅发布。

每一步都有“完成标准”。不要在上一步还不能稳定验收时，提前加入多 Agent。

## 一、先跑通一个最小 Agent

先不要建平台。第一步只验证三件事：模型能收到任务、能调用一个只读工具、循环能够被代码停止。

### 1.1 初始化项目

Pi Agent Core 当前要求 Node.js 22.19 或更高版本。创建项目并安装最小依赖：

```bash
mkdir enterprise-ticket-agent
cd enterprise-ticket-agent
pnpm init
pnpm add @earendil-works/pi-agent-core @earendil-works/pi-ai typebox
pnpm add -D typescript tsx vitest @types/node
```

在 `package.json` 中加入：

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/demo.ts"
  }
}
```

设置模型密钥，然后新建 `src/demo.ts`：

```typescript
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { Type } from "typebox";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("模型没有注册成功");

const tickets = new Map([
  ["T-1001", { title: "无法登录", status: "open", owner: "support-a" }],
]);

const getTicket: AgentTool = {
  name: "get_ticket",
  label: "读取工单",
  description: "按工单编号读取标题、状态和负责人。只能读取，不能修改。",
  parameters: Type.Object({
    ticketId: Type.String({ description: "工单编号，例如 T-1001" }),
  }),
  executionMode: "parallel",
  async execute(_callId, input) {
    const ticket = tickets.get(input.ticketId);
    if (!ticket) throw new Error("TICKET_NOT_FOUND");
    return {
      content: [{ type: "text", text: JSON.stringify(ticket) }],
      details: { ticketId: input.ticketId },
    };
  },
};

let completedTurns = 0;
const agent = new Agent({
  initialState: {
    systemPrompt: [
      "你是企业工单助手。",
      "只能依据工具结果回答，不得编造工单。",
      "信息足够后直接结束，不要重复调用相同工具。",
    ].join("\n"),
    model,
    tools: [getTicket],
  },
  streamFn: models.streamSimple.bind(models),
  shouldStopAfterTurn: async () => ++completedTurns >= 6,
});

agent.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

const timeout = setTimeout(() => agent.abort(), 60_000);
try {
  await agent.prompt("查询 T-1001，告诉我当前状态和负责人");
} finally {
  clearTimeout(timeout);
}
```

运行：

```bash
ANTHROPIC_API_KEY=你的密钥 pnpm dev
```

此时你已经拥有真正的 Agent 循环，而不是一次普通聊天调用：模型可以产生工具请求，工具结果会回到上下文，模型再根据结果完成回答。Pi 的 [`Agent` 文档](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)还提供流式事件、并行或串行工具、前后置工具钩子、取消和上下文转换。

### 1.2 为什么这还不能上线

这段代码缺少的不是“更聪明的 Prompt”，而是企业服务最基本的控制面：

| 当前缺口 | 直接上线会发生什么 |
| --- | --- |
| 没有认证和租户上下文 | 用户可能读取别人的工单 |
| 状态只在内存里 | 进程重启后任务消失 |
| HTTP 请求内直接运行 | 模型慢时占满连接和 Worker |
| 工具就是普通函数 | 没有权限、审计、幂等和输出限制 |
| 只有一个进程内计数器 | 多副本时限流、预算和并发全部失效 |
| 没有检查点 | 第五步失败后只能从第一步重跑 |

**完成标准**：最小示例能正常调用工具；无论模型怎样输出，运行都能在 6 轮或 60 秒内结束。达到这个条件后再开始服务化。

## 二、先确定生产主链路，不要先堆框架

我们要实现的第一条生产链路是：

```text
POST /v1/runs
  → 验证身份与输入
  → 在 PostgreSQL 创建 run 和 outbox 事件
  → 返回 202 + run_id
  → outbox relay 投递队列
  → Worker 领取 run
  → 构建受权限约束的上下文
  → 运行 Pi Agent
  → 工具网关执行工具
  → 持久化事件、步骤、成本和最终结果
  → GET /v1/runs/:id 查询状态
```

这是整个平台的脊柱。流式输出、RAG、多模型和多 Agent 都是这条链路上的可替换分支。

建议目录从下面开始：

```text
enterprise-ticket-agent/
├── src/
│   ├── api/                 # HTTP 路由，只做认证、校验和提交任务
│   ├── application/         # 用例：创建、取消、恢复、查询 run
│   ├── agent/               # Pi 适配器、上下文构建、终止条件
│   ├── tools/               # 工具契约、策略、执行器和审计
│   ├── rag/                 # 摄取、检索、重排和引用验证
│   ├── workers/             # 队列消费者、心跳、重试和恢复
│   ├── infrastructure/      # PostgreSQL、Redis、模型网关、遥测
│   ├── domain/              # Run、Step、Event、错误码等纯类型
│   └── main.ts
├── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── evals/
│   └── chaos/
├── docker-compose.yml
└── package.json
```

先用最小的本地依赖启动 PostgreSQL 和 Redis：

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent_dev_only
      POSTGRES_DB: agent
    ports: ["5432:5432"]
    volumes:
      - agent_pg:/var/lib/postgresql/data
      - ./migrations:/migrations:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agent -d agent"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - agent_redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  agent_pg:
  agent_redis:
```

```bash
docker compose up -d
docker compose ps
```

本地 `.env`只放开发配置，生产密钥由 Secret Manager 注入：

```dotenv
DATABASE_URL=postgresql://agent:agent_dev_only@127.0.0.1:5432/agent
REDIS_URL=redis://127.0.0.1:6379
ANTHROPIC_API_KEY=替换为本地开发密钥
JWT_ISSUER=https://identity.example.com/
JWT_AUDIENCE=enterprise-agent
```

这里最重要的边界是：`api` 不调用模型，`agent` 不直接访问任意业务 API，`tools` 不决定业务终态，`workers` 不保存权威状态。它们都通过数据库中的 `run` 和 `step` 协作。

后文为了把主线写清楚，会使用一些按职责命名的辅助函数。它们不是框架魔法，分别对应下面这些文件：

| 辅助函数 | 你要实现的内容 | 建议文件 |
| --- | --- | --- |
| `authenticate()` | 验 JWT 签名、签发方、受众、过期时间，解析租户与角色 | `api/authenticate.ts` |
| `createRunInTransaction()` | 插入 run 和 outbox，处理幂等冲突 | `application/create-run.ts` |
| `claimRun()` | 用条件更新抢占任务 | `application/claim-run.ts` |
| `buildRunContext()` | 把可信身份和数据库 run 组装为只读上下文 | `application/build-run-context.ts` |
| `persistObservableEvent()` | 把 Pi 事件转换为脱敏后的事件、消息与用量记录 | `agent/event-recorder.ts` |
| `reserveDurableStep()` | 在事务中分配步骤号、幂等键并查找已有结果 | `tools/step-repository.ts` |
| `toolPolicy.authorize()` | 依据租户、角色、资源和风险做确定性授权 | `tools/tool-policy.ts` |
| `knowledge.search()` | 带 ACL 的混合检索、重排和引用裁剪 | `rag/knowledge-search.ts` |
| `handleRunFailure()` | 错误分类、退避、终态和死信处理 | `workers/failure-policy.ts` |

按表逐个实现和测试，不要先写一个几千行的 `AgentService`。

## 三、步骤 1：建立任务状态，而不是只保存聊天记录

安装服务端依赖：

```bash
pnpm add fastify @fastify/jwt zod pg ioredis bullmq pino
pnpm add @opentelemetry/api
```

第一份迁移至少要有 `agent_runs`、`agent_steps`、`agent_events` 和 `outbox_events` 四张表：

```sql
CREATE TYPE agent_run_status AS ENUM (
  'queued', 'running', 'waiting_approval', 'retry_wait',
  'succeeded', 'failed', 'cancelled'
);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  request_id text NOT NULL,
  status agent_run_status NOT NULL DEFAULT 'queued',
  input_json jsonb NOT NULL,
  result_json jsonb,
  current_step integer NOT NULL DEFAULT 0,
  max_steps integer NOT NULL DEFAULT 12,
  deadline_at timestamptz NOT NULL,
  token_budget integer NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  model_route text,
  prompt_version text NOT NULL,
  heartbeat_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, request_id)
);

CREATE TABLE agent_steps (
  run_id uuid NOT NULL REFERENCES agent_runs(id),
  step_no integer NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  input_hash text,
  output_json jsonb,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY (run_id, step_no),
  UNIQUE (idempotency_key)
);

CREATE TABLE agent_events (
  run_id uuid NOT NULL REFERENCES agent_runs(id),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_runs_claim_idx
  ON agent_runs (status, created_at)
  WHERE status IN ('queued', 'retry_wait');
CREATE INDEX agent_events_tenant_run_idx
  ON agent_events (tenant_id, run_id, seq);
CREATE INDEX outbox_unpublished_idx
  ON outbox_events (created_at)
  WHERE published_at IS NULL;
```

把 SQL 保存为 `migrations/001_init.sql`，然后执行：

```bash
docker compose exec postgres \
  psql -U agent -d agent -v ON_ERROR_STOP=1 \
  -f /migrations/001_init.sql
```

为什么不能只有一张 `messages` 表？因为“模型说完成了”和“业务任务已经完成”不是一回事。`agent_runs` 保存权威任务状态，`agent_steps` 保存可以恢复和去重的执行步骤，`agent_events` 保存可观察的过程，聊天消息只是构建模型上下文的一种材料。

**完成标准**：能用 SQL 明确回答一个任务现在处于什么状态、执行到第几步、是否可以重试、最后一次心跳是什么时候。不能只靠搜索日志猜。

## 四、步骤 2：把租户上下文做成强类型对象

企业 Agent 的每次内部调用都必须携带同一组身份字段：

```typescript
// src/domain/run-context.ts
export type RunContext = Readonly<{
  tenantId: string;
  userId: string;
  sessionId: string;
  runId: string;
  requestId: string;
  roles: readonly string[];
  deadlineAt: Date;
  tokenBudget: number;
  traceId: string;
}>;
```

`tenantId` 和 `userId` 必须从经过验证的 JWT、网关签名或服务身份中解析，不能接受客户端在请求体里自行填写。数据库查询、Redis Key、队列消息、缓存 Key、RAG 过滤器和审计事件全部从 `RunContext` 取值。

如果 PostgreSQL 使用行级安全策略，可以这样设置：

```sql
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_on_runs ON agent_runs
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

每个数据库事务开始后执行 `SET LOCAL app.tenant_id = $1`。一定要使用 `SET LOCAL` 并绑定事务，不能在连接池连接上做永久 `SET`，否则连接被下一位用户复用时会造成串租户。

**完成标准**：增加一条自动化测试——租户 A 拿着自己的 Token 查询租户 B 的 `run_id`，API 必须返回 404，而不是返回 403 暴露资源存在性，更不能返回数据。

## 五、步骤 3：创建任务时同时解决幂等和可靠投递

创建任务接口接收业务输入，但不在 HTTP 请求里运行 Agent：

```typescript
// src/api/run-routes.ts
const CreateRunBody = z.object({
  sessionId: z.string().uuid(),
  task: z.string().min(1).max(8_000),
});

app.post("/v1/runs", async (request, reply) => {
  const identity = await authenticate(request);
  const body = CreateRunBody.parse(request.body);
  const requestId = request.headers["idempotency-key"];

  if (typeof requestId !== "string" || requestId.length > 128) {
    return reply.code(400).send({ code: "INVALID_IDEMPOTENCY_KEY" });
  }

  const run = await createRunInTransaction({
    tenantId: identity.tenantId,
    userId: identity.userId,
    sessionId: body.sessionId,
    requestId,
    task: body.task,
    maxSteps: 12,
    tokenBudget: 30_000,
    deadlineAt: new Date(Date.now() + 5 * 60_000),
    promptVersion: "ticket-agent-v1",
  });

  return reply.code(202).send({
    runId: run.id,
    status: run.status,
    statusUrl: `/v1/runs/${run.id}`,
  });
});
```

查询与取消接口也必须同时按 `tenant_id`过滤：

```typescript
app.get("/v1/runs/:runId", async (request, reply) => {
  const identity = await authenticate(request);
  const run = await runs.findByTenantAndId(identity.tenantId, request.params.runId);
  if (!run) return reply.code(404).send({ code: "RUN_NOT_FOUND" });
  return { runId: run.id, status: run.status, result: run.result_json };
});

app.post("/v1/runs/:runId/cancel", async (request, reply) => {
  const identity = await authenticate(request);
  const cancelled = await runs.cancelIfActive(
    identity.tenantId,
    request.params.runId,
  );
  if (!cancelled) return reply.code(404).send({ code: "RUN_NOT_FOUND" });
  await cancellationBus.publish(cancelled.id);
  return reply.code(202).send({ runId: cancelled.id, status: "cancelled" });
});
```

`createRunInTransaction()`必须在同一数据库事务里完成两件事：

```sql
INSERT INTO agent_runs (...)
VALUES (...)
ON CONFLICT (tenant_id, request_id)
DO UPDATE SET request_id = EXCLUDED.request_id
RETURNING *;

INSERT INTO outbox_events (id, aggregate_id, event_type, payload)
VALUES ($event_id, $run_id, 'agent.run.requested', $payload)
ON CONFLICT DO NOTHING;
```

随后由独立的 outbox relay 扫描未发布事件并投递 BullMQ。发布成功后再写 `published_at`。即使进程在“数据库提交成功、队列发布之前”崩溃，事件也不会丢；重复发布则由队列 `jobId=run_id` 和 Worker 的状态领取语句去重。

```typescript
export async function publishOutboxBatch() {
  await db.transaction(async (tx) => {
    const events = await tx.query<OutboxEvent>(`
      SELECT * FROM outbox_events
      WHERE published_at IS NULL
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 100
    `);

    for (const event of events.rows) {
      await runQueue.add(
        "execute",
        { runId: event.aggregate_id },
        { jobId: event.aggregate_id, removeOnComplete: 1_000 },
      );
      await tx.query(
        "UPDATE outbox_events SET published_at = now() WHERE id = $1",
        [event.id],
      );
    }
  });
}
```

本地 Demo 可以先直接 `queue.add()`，但进入共享测试环境前必须改成 outbox。否则你会遇到一种最难排查的失败：API 已经向用户返回成功，数据库里也有任务，却永远没有 Worker 执行。

**完成标准**：用同一个租户和同一个 `Idempotency-Key` 连续提交十次，只产生一个 `agent_run`；在提交后、投递前模拟进程退出，重启 relay 后任务仍能进入队列。

## 六、步骤 4：Worker 必须先领取状态，再执行任务

队列消息只携带 `runId`，不要塞完整聊天历史、凭证或大段检索结果。Worker 收到消息后，用带条件的更新领取任务：

```sql
UPDATE agent_runs
SET status = 'running',
    started_at = COALESCE(started_at, now()),
    heartbeat_at = now(),
    version = version + 1
WHERE id = $1
  AND status IN ('queued', 'retry_wait')
  AND deadline_at > now()
RETURNING *;
```

如果没有返回行，说明任务已被其他 Worker 领取、已取消、已完成或已经超时，当前消息直接确认即可。不要因为队列重复投递就重复运行 Agent。

Worker 主函数保持简单：

```typescript
// src/workers/run-worker.ts
export async function processRun(runId: string): Promise<void> {
  const run = await claimRun(runId);
  if (!run) return;

  const heartbeat = startHeartbeat(run.id, 10_000);
  try {
    const context = await buildRunContext(run);
    const result = await executeAgentRun(context, run.input_json.task);
    await markRunSucceeded(context, result);
  } catch (error) {
    await handleRunFailure(run, classifyError(error));
  } finally {
    heartbeat.stop();
  }
}
```

BullMQ Worker 只负责把队列消息交给这个函数，并设置实例级并发上限：

```typescript
const worker = new Worker(
  "agent-runs",
  async (job) => processRun(job.data.runId),
  {
    connection: redis,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 8),
    lockDuration: 60_000,
  },
);
```

这里的 `concurrency`只是单副本保护，租户并发、模型 TPM 和工具并发仍要使用共享限流器控制。

把 API 与 Worker 做成两个入口：

```json
{
  "scripts": {
    "dev:api": "tsx src/main.ts",
    "dev:worker": "tsx src/worker.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

```typescript
// src/main.ts
const app = Fastify({ logger: true });
await registerAuth(app);
await registerRunRoutes(app);
await app.listen({ host: "0.0.0.0", port: 3000 });

// src/worker.ts
startOutboxRelay();
startExpiredRunReaper();
startRunWorker();
```

分别运行 `pnpm dev:api`和 `pnpm dev:worker`。调用 `POST /v1/runs`后，先从数据库确认状态从 `queued`变为 `running`，再看最终是否进入 `succeeded`；不要只盯着控制台输出。

`handleRunFailure()`根据错误类型决定终态：

- 输入、权限、Schema 错误：直接失败，不重试。
- 模型 429、网络抖动、依赖 5xx：在剩余截止时间和重试预算内进入 `retry_wait`。
- 用户取消：写 `cancelled`，不重试。
- Worker 失联：由 reaper 根据过期心跳把任务重新放回队列。
- 业务写操作结果不确定：进入人工核对，不能盲目重试。

**完成标准**：同一队列消息并发投递给两个 Worker，只有一个能把状态从 `queued` 改为 `running`；杀掉执行中的 Worker 后，reaper 能发现心跳过期并恢复任务。

## 七、步骤 5：把 Pi 包在自己的 Agent 适配器里

不要让业务代码到处直接创建 `Agent`。只保留一个适配器，统一模型选择、上下文、工具、事件、超时和预算：

```typescript
// src/agent/execute-agent-run.ts
import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

export async function executeAgentRun(
  ctx: RunContext,
  task: string,
): Promise<{ text: string; turns: number }> {
  const models = createModels();
  models.setProvider(anthropicProvider());

  const route = await chooseModelRoute(ctx, task);
  const model = models.getModel(route.provider, route.modelId);
  if (!model) throw new PermanentError("MODEL_NOT_AVAILABLE");

  const projected = await buildModelContext(ctx, task);
  const tools = await buildPiTools(ctx);
  let turns = 0;

  const agent = new Agent({
    initialState: {
      systemPrompt: projected.systemPrompt,
      model,
      tools,
      messages: projected.messages,
    },
    streamFn: models.streamSimple.bind(models),
    sessionId: ctx.sessionId,
    toolExecution: "parallel",

    beforeToolCall: async ({ toolCall, args }) => {
      const decision = await toolPolicy.authorize(ctx, toolCall.name, args);
      if (!decision.allowed) {
        return {
          block: true,
          reason: decision.publicReason,
          terminate: decision.terminateRun,
        };
      }
    },

    afterToolCall: async ({ toolCall, result, isError }) => {
      await auditToolResult(ctx, toolCall.name, result, isError);
      return { details: redactToolDetails(result.details) };
    },

    shouldStopAfterTurn: async () => ++turns >= ctxLimits(ctx).maxTurns,
  });

  agent.subscribe(async (event) => {
    await persistObservableEvent(ctx, event);
  });

  const remaining = ctx.deadlineAt.getTime() - Date.now();
  if (remaining <= 0) throw new DeadlineError();

  const timer = setTimeout(() => agent.abort(), remaining);
  try {
    await agent.prompt(task);
  } finally {
    clearTimeout(timer);
  }

  const text = extractLastVisibleAssistantText(agent.state.messages);
  if (!text && turns >= ctxLimits(ctx).maxTurns) {
    throw new BudgetError("MAX_TURNS_EXCEEDED");
  }
  return { text, turns };
}
```

这里故意不把业务逻辑写进 `systemPrompt`。权限由 `toolPolicy` 决定，模型路由由 `chooseModelRoute` 决定，终止条件由代码决定，审计由事件订阅器决定。

`persistObservableEvent()`也不能把事件对象原样落库。生产环境只保存：

- `run_id`、`step_no`、事件类型和时间；
- 模型、Token、首 Token 时间和总耗时；
- 工具名、参数摘要、权限结果、结果摘要和错误码；
- 对用户可见的消息、引用和最终输出；
- Prompt、模型、工具和知识库版本。

不要记录模型的隐藏思维链，也不要把密钥、Cookie、完整文件内容或工具原始大输出写进日志。大结果先写对象存储，事件里只放摘要、内容哈希和短期引用。

还有一个容易忽略的细节：Pi 的 `shouldStopAfterTurn`在一轮正常完成后运行，它不会替你取消正在执行的工具。每个工具都必须接收并传播 `AbortSignal`，否则 Agent 看似已经取消，数据库查询、Shell 或第三方写操作仍会在后台继续。

**完成标准**：业务代码只能通过 `executeAgentRun()`运行 Agent；切换模型供应商时不用修改 API、队列和工具实现；取消 `run` 后，模型流和正在运行的可取消工具都会停止。

## 八、步骤 6：把工具写成协议，不要写成 API 包装函数

Pi 和 Claude Code 实现都指向同一件事：工具不是“一个函数名加一段描述”，而是一条包含输入验证、权限、并发、执行、输出验证和审计的运行时协议。

先定义企业工具契约：

```typescript
// src/tools/types.ts
import type { TSchema } from "typebox";
import type { ZodType } from "zod";

export type ToolRisk = "read" | "write" | "privileged";

export interface EnterpriseTool<I, O> {
  name: string;
  description: string;
  inputSchema: TSchema;
  outputSchema: ZodType<O>;
  risk: ToolRisk;
  concurrency: "parallel" | "sequential";
  timeoutMs: number;
  maxOutputBytes: number;
  execute(ctx: RunContext, input: I, signal: AbortSignal): Promise<O>;
}
```

所有工具都走同一个网关：

```typescript
// src/tools/tool-gateway.ts
export async function executeTool<I, O>(
  ctx: RunContext,
  spec: EnterpriseTool<I, O>,
  input: I,
): Promise<O> {
  assertRunStillActive(ctx);

  const normalized = canonicalize(input);
  const inputHash = sha256(normalized);
  const step = await reserveDurableStep(ctx, spec.name, inputHash);

  if (step.status === "succeeded") {
    return spec.outputSchema.parse(step.output);
  }

  const decision = await toolPolicy.authorize(ctx, spec.name, input);
  if (!decision.allowed) throw new PermissionError(decision.code);

  if (spec.risk !== "read" && decision.requiresApproval) {
    await moveRunToWaitingApproval(ctx, step);
    throw new ApprovalRequiredError(step.stepNo);
  }

  const signal = AbortSignal.any([
    AbortSignal.timeout(spec.timeoutMs),
    signalUntil(ctx.deadlineAt),
    signalForRunCancellation(ctx.runId),
  ]);

  try {
    const raw = await spec.execute(ctx, input, signal);
    const output = spec.outputSchema.parse(raw);

    if (Buffer.byteLength(JSON.stringify(output)) > spec.maxOutputBytes) {
      throw new PermanentError("TOOL_OUTPUT_TOO_LARGE");
    }

    await completeStep(step, redactForStorage(output));
    return output;
  } catch (error) {
    await failStep(step, classifyError(error));
    throw sanitizeToolError(error);
  }
}
```

`reserveDurableStep()`在数据库里分配逻辑步骤号和幂等键。写工具的幂等键应来自 `run_id + step_no + tool_name`，不能让模型自己编，也不能只依赖一次模型响应中的临时 `tool_call_id`。

再把企业工具适配为 Pi 工具：

```typescript
export function asPiTool<I, O>(
  ctx: RunContext,
  spec: EnterpriseTool<I, O>,
): AgentTool {
  return {
    name: spec.name,
    label: spec.name,
    description: spec.description,
    parameters: spec.inputSchema,
    executionMode: spec.concurrency,
    async execute(_callId, input) {
      const output = await executeTool(ctx, spec, input as I);
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        details: { step: "persisted", risk: spec.risk },
      };
    },
  };
}
```

工具的执行顺序固定为：

```text
查找工具 → 校验参数 → 检查任务状态 → 授权 → 必要时审批
→ 分配持久步骤 → 设置截止时间 → 执行 → 校验输出
→ 截断或外置大结果 → 审计 → 结果回到模型
```

并发也不能交给模型判断。只读、无共享副作用并且显式标注为 `parallel` 的工具才能并发；写操作、依赖顺序的工具和未知工具默认串行。社区整理的 Claude Code 源码快照中，工具的并发安全默认值也是 `false`，这是一种值得保留的失败关闭策略。

以下逻辑必须硬编码，不能让 LLM 自主判断：

- 当前用户和租户能不能调用工具；
- 工具能访问哪些资源、路径和字段；
- 写操作是否需要审批以及审批人是谁；
- 幂等键、金额上限、状态迁移和事务边界；
- 超时、重试次数、并发、Token 和成本上限；
- 哪些结果可以缓存，哪些字段必须脱敏；
- 任务是否真正完成，是否满足业务验收条件。

**完成标准**：新增工具时，开发者必须填写风险、并发、输入、输出、超时和输出上限；绕过工具网关直接访问业务 API 的代码会被测试或代码扫描阻止。

## 九、步骤 7：上下文要按预算投影，不能加载完整历史

数据库保存“完整事实”，模型只接收“本轮所需投影”。这正是 Pi 将 `transformContext` 与 `convertToLlm`分开的价值，也是 Claude Code 官方文档强调自动压缩和按需加载工具定义的原因。

上下文按下面顺序构建：

```text
稳定系统规则
  + 当前身份、能力范围和任务预算
  + 会话摘要
  + 最近若干轮可见消息
  + 本轮 RAG 证据
  + 当前任务
  - 旧工具大输出
  - UI 事件和调试日志
  - 已失效计划与重复指令
```

先增加消息与摘要表：

```sql
CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  role text NOT NULL,
  visible_content text NOT NULL,
  token_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session_summaries (
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  summary_version integer NOT NULL,
  through_message_id uuid NOT NULL,
  summary text NOT NULL,
  token_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, session_id, summary_version)
);
```

把这段保存为 `migrations/002_context.sql`，用与第一份迁移相同的 `psql -v ON_ERROR_STOP=1`命令执行。

上下文构建器只做选择和格式化：

```typescript
// src/agent/build-model-context.ts
export async function buildModelContext(ctx: RunContext, task: string) {
  const rules = await promptRegistry.load("ticket-agent", "v1");
  const summary = await summaries.latest(ctx.tenantId, ctx.sessionId);
  const recent = await messages.loadRecentWithinBudget({
    tenantId: ctx.tenantId,
    sessionId: ctx.sessionId,
    maxTokens: 12_000,
  });
  const evidence = await knowledge.search({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roles: ctx.roles,
    query: task,
    maxTokens: 6_000,
  });

  return {
    systemPrompt: renderSystemPrompt({
      rules,
      runId: ctx.runId,
      deadlineAt: ctx.deadlineAt,
      allowedTools: await toolPolicy.listAllowed(ctx),
    }),
    messages: projectToAgentMessages({ summary, recent, evidence }),
  };
}
```

当“摘要 + 最近消息 + 新任务 + 预留输出”接近模型窗口时，生成新摘要并记录 `through_message_id`。摘要是有损投影，完整消息仍保留在数据库中。工具结果超过阈值时，将完整内容写入对象存储，只向模型提供结构化摘要和可再次读取的受控引用。

压缩不是简单截取最后 N 条消息，还要保证工具调用和工具结果成对保留，不能把半个执行回合切掉。Pi 的[上下文压缩实现](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md)会选择切分点、保留近期消息、累计文件操作，并把完整历史留在会话存储中；企业服务可以借鉴这个原则，但摘要结构应换成自己的业务事实。

**完成标准**：连续对话 100 轮后，单次模型输入仍受预算限制；恢复会话时能区分“数据库里存在的完整历史”和“本轮实际发给模型的投影”；摘要失败不会破坏原始消息。

## 十、步骤 8：RAG 必须先做权限过滤，再做相似度

RAG 不是把向量搜索结果直接拼进 Prompt。生产链路至少包含：

```text
离线：文档授权 → 解析 → 切块 → 元数据 → Embedding → 索引版本 → 质量抽检
在线：身份过滤 → Query 规范化 → 关键词/向量混合召回 → 重排 → 去重
      → Token 预算裁剪 → 引用坐标 → 回答后引用校验
```

检索接口必须要求租户与权限，而不是把过滤器设成可选参数：

```typescript
export interface KnowledgeSearchInput {
  tenantId: string;
  userId: string;
  roles: readonly string[];
  query: string;
  maxTokens: number;
  knowledgeVersion?: string;
}

export async function searchKnowledge(input: KnowledgeSearchInput) {
  const acl = await resolveDocumentAcl(input);
  const candidates = await hybridSearch({
    query: input.query,
    filters: {
      tenantId: input.tenantId,
      allowedDocumentIds: acl.documentIds,
      status: "published",
    },
    keywordTopK: 40,
    vectorTopK: 40,
  });
  const ranked = await rerank(input.query, deduplicate(candidates));
  return fitCitationChunks(ranked, input.maxTokens);
}
```

不能先跨租户召回，再在应用层删除无权结果。向量库、关键词索引和重排输入都要带相同的授权过滤；缓存键也必须包含 `tenant_id`、ACL 版本和知识库版本。

第一版先做 Hybrid Search + Rerank + 引用验证。只有真实评测集证明普通检索无法解决关系发现或全库主题归纳时，再把 GraphRAG 作为专用分支加入路由。

**完成标准**：建立至少包含“正确命中、相似但无权、已删除、跨租户同名文档、无答案”五类样本的检索测试；线上回答的每条关键事实都能回到授权后的引用片段。

## 十一、步骤 9：把超时、重试、限流和熔断放在不同层

一个“全链路 60 秒超时”无法治理 Agent。建议先给每层独立预算：

| 层级 | 示例预算 | 超时后的动作 |
| --- | ---: | --- |
| 创建任务 API | 2 秒 | 返回失败，客户端可用同一幂等键重试 |
| 队列等待 | 30 秒 SLO | 扩容或降级，不能消耗执行预算 |
| 单次模型调用 | 45 秒 | 取消流；在总截止时间内切备用路由或重试 |
| 只读业务工具 | 5–10 秒 | 有预算时重试，返回结构化错误 |
| 写业务工具 | 10–30 秒 | 先查幂等结果，再决定是否重试 |
| 数据库语句 | 1 秒 | 取消查询，保护连接池 |
| 整个 run | 5 分钟 | 保存检查点，进入超时终态或人工恢复 |

所有子调用都从绝对截止时间计算剩余预算：

```typescript
export function childTimeoutMs(
  deadlineAt: Date,
  layerDefaultMs: number,
  reserveForCleanupMs = 1_000,
): number {
  const remaining = deadlineAt.getTime() - Date.now() - reserveForCleanupMs;
  if (remaining <= 0) throw new DeadlineError();
  return Math.min(layerDefaultMs, remaining);
}
```

重试规则不要写成一个通用装饰器：

- 429：读取 `Retry-After`，进入共享限流器等待或切换有容量的模型路由。
- 连接重置、网关 502/503：指数退避加随机抖动，但受绝对截止时间和最大尝试次数约束。
- 参数错误、权限拒绝、内容策略拒绝：不重试。
- 写操作超时：先用幂等键查询远端结果，不能直接再次执行。
- 上下文溢出：触发压缩或缩短检索结果，不要原样重试。

限流必须是 Redis 等共享存储中的分布式 Token Bucket，而不是每个进程各自计数。至少同时限制：

```text
tenant requests/minute
tenant tokens/minute
user concurrent runs
model provider requests/minute
model provider tokens/minute
tool concurrent calls
```

发起模型调用前先按估算输入和最大输出“预留 Token”，响应后按真实用量结算，多退少补。这样可以避免所有请求同时通过检查，随后一起把 TPM 打穿。

熔断器按“供应商 + 区域 + 模型 + 接口类型”建桶，持续失败时短路新请求；半开阶段只放少量探测流量。熔断后优先选择同质量级的备用路由，其次切换小模型或模板化降级，不能悄悄用低质量模型完成高风险写任务。

**完成标准**：故障注入 429、超时、连接重置和 5xx 后，没有重试风暴；到达总截止时间后不会再启动新的模型或工具调用；限流在多个 Worker 副本间仍然有效。

## 十二、步骤 10：每个副作用前后都落检查点

长任务不能只在“开始”和“结束”时更新数据库。真正可恢复的执行顺序是：

```text
模型产生工具请求
  → 持久化可见消息和工具请求
  → 创建 agent_step：pending
  → 校验权限与幂等
  → agent_step：running
  → 执行外部副作用
  → 保存结果或错误
  → agent_step：succeeded / failed
  → 把工具结果写回 Agent 上下文
  → 开始下一轮模型调用
```

Pi 的 `Agent.subscribe()`监听器会被按注册顺序等待，`Agent` 类还把 assistant 的 `message_end`处理当作工具预检之前的屏障。这意味着我们可以在模型已经提出工具调用、工具尚未开始执行时，先把请求可靠落盘。不要使用低层 `agentLoop()`后异步“顺手写日志”，因为低层事件流是观察性的，不会等你的异步监听器完成。

恢复 Worker 按步骤状态处理：

```typescript
export async function recoverRun(run: AgentRun) {
  const transcript = await loadPersistedTranscript(run.id);
  const pending = await loadPendingSteps(run.id);

  for (const step of pending) {
    if (step.status === "succeeded") {
      transcript.ensureToolResult(step.output_json);
      continue;
    }

    if (step.kind === "tool:read") {
      await retryReadStep(step);
      continue;
    }

    const remote = await queryWriteResultByIdempotencyKey(step.idempotency_key);
    if (remote.found) {
      await completeStep(step, remote.result);
    } else if (remote.definitelyNotExecuted) {
      await retryWriteStep(step);
    } else {
      await requireManualReconciliation(step);
    }
  }

  return continueFromTranscript(run, transcript);
}
```

恢复的关键不是“重新问一次模型”，而是先判断上一次副作用到底有没有发生。只读操作通常可以重试；支付、发消息、改状态等写操作必须依赖业务系统支持幂等查询，否则只能进入人工核对。

检查点还要包含 `prompt_version`、`model_route`、`tool_version` 和 `knowledge_version`。恢复时默认沿用原版本，不能因为部署了新 Prompt，就让执行到一半的任务突然改变行为。确实需要迁移时，写显式迁移函数并记录迁移事件。

**完成标准**：在“模型响应后、工具执行前”“工具执行中”“工具成功后、结果回写前”三个位置分别杀进程，恢复后都不会丢步骤，也不会重复写业务数据。

## 十三、步骤 11：缓存按数据性质分层，不要做一个万能缓存

建议从五类缓存开始：

| 缓存 | Key 必须包含 | 可以缓存什么 | 失效方式 |
| --- | --- | --- | --- |
| 模型 Prompt Cache | provider、model、Prompt 版本 | 稳定系统提示、重复前缀 | 模型或 Prompt 变更 |
| RAG 检索缓存 | tenant、ACL 版本、知识版本、query hash | 授权后的候选文档 ID 和分数 | 文档、权限或索引版本变更 |
| 文档派生缓存 | tenant、doc、content hash、parser version | 解析文本、切块、Embedding | 内容或处理器版本变更 |
| 工具只读缓存 | tenant、user/role scope、tool、args、data version | 低风险、短时效查询结果 | TTL + 数据版本 |
| 最终回答缓存 | tenant、权限指纹、Prompt/模型/知识版本、规范化输入 | 稳定、只读、可验证问答 | 任一依赖版本变化 |

下面这些内容默认不能缓存：

- 带一次性凭证、Cookie、密钥或个人敏感信息的结果；
- 支付、审批、发信、改状态等写操作结果；
- 依赖实时库存、余额、权限或任务状态的回答；
- 未经授权过滤的原始检索候选；
- 模型的隐藏推理过程；
- 错误响应和熔断降级结果，除非有极短的负缓存策略。

缓存 Key 不能只写 `hash(question)`。一个合格的最终回答缓存键至少是：

```text
tenant_id
+ permission_fingerprint
+ normalized_question
+ prompt_version
+ model_policy_version
+ knowledge_version
+ locale
```

缓存命中也要记录“省掉了哪次调用、使用了哪个版本、原始产物何时生成”。否则成本下降了，问题出现时却无法解释答案从哪里来。

**完成标准**：权限变更或知识库发布新版本后，旧租户缓存不会继续命中；压测能分别看到各层命中率和节省的 Token/耗时，而不是只有一个 Redis QPS。

## 十四、步骤 12：观测一条任务，而不是只观测一个 HTTP 请求

每个 `run` 建立一条跨 API、队列、Worker、模型和工具的 Trace：

```text
agent.run
├── run.submit
├── queue.wait
├── context.build
│   ├── session.load
│   └── rag.retrieve + rag.rerank
├── model.turn.1
├── tool.get_ticket
├── model.turn.2
└── run.persist_result
```

最小 Span 属性：

```typescript
const attributes = {
  "agent.run.id": ctx.runId,
  "agent.session.id": ctx.sessionId,
  "tenant.id": ctx.tenantId,
  "enduser.id_hash": hashUserId(ctx.userId),
  "gen_ai.provider.name": route.provider,
  "gen_ai.request.model": route.modelId,
  "agent.prompt.version": promptVersion,
  "agent.knowledge.version": knowledgeVersion,
};
```

不要把用户原文、文档正文和工具完整参数默认放进 Trace。生产遥测以 ID、哈希、枚举、长度和计数为主，敏感内容进入权限更严格、保留期更短的审计存储。

至少建设下面这些指标：

| 维度 | 核心指标 |
| --- | --- |
| 性能 | 端到端 P50/P95/P99、队列等待、TTFT、每轮模型耗时、每类工具耗时 |
| 质量 | 任务成功率、引用正确率、工具选择正确率、人工接管率、回退率 |
| 稳定性 | 超时率、重试放大倍数、熔断次数、死信、过期心跳、恢复成功率 |
| 成本 | 每个成功任务的 Token、模型费用、检索费用、重试浪费、缓存节省 |
| 安全 | 权限拒绝、审批触发、跨租户测试失败、沙箱违规、敏感数据拦截 |

“每个成功任务成本”比“平均一次模型调用成本”更有意义：

```text
成功任务单位成本
=（模型 + Embedding + 重排 + 工具 + 基础设施 + 重试浪费）
  / 成功完成且通过质量验收的任务数
```

告警要落到可以行动的原因。例如 P95 上升时，能直接区分队列拥塞、模型 TTFT、上下文变大、检索变慢还是工具超时，而不是只收到“Agent 很慢”。

**完成标准**：拿任意 `run_id`，五分钟内能回答它排队多久、用了哪个模型和 Prompt、调用了哪些工具、哪里重试、花了多少 Token、为什么结束。

## 十五、步骤 13：用脚本化模型测试控制流

Agent 测试不能全部调用真实模型。Pi 把 `streamFn`设为可注入依赖，正适合用脚本化模型生成确定的工具请求和错误。

测试分四层：

### 15.1 单元测试

- 每个工具的输入/输出 Schema、权限、超时、截断和脱敏；
- 状态机合法迁移，禁止 `succeeded → running`；
- 幂等键相同的写步骤只执行一次；
- 缓存 Key 包含租户、权限和版本；
- 上下文预算不会拆散工具请求和工具结果。

### 15.2 集成测试

用 Fake `streamFn`依次输出：

```text
场景 A：模型 → get_ticket → 工具成功 → 最终回答
场景 B：模型重复调用同一工具 → 达到步数上限
场景 C：模型请求无权写工具 → 工具网关拒绝
场景 D：模型返回非法参数 → Schema 错误，不执行工具
场景 E：Worker 在工具前后崩溃 → 从检查点恢复
```

这类测试验证的是“模型不听话时系统仍然正确”，而不是验证某个 Prompt 今天恰好表现不错。

### 15.3 离线评测

从真实任务中构建版本化数据集，至少保存：输入、允许的工具、禁止动作、期望事实、引用、最大成本和人工评分规则。每次修改 Prompt、模型、工具描述、检索或摘要算法，都在同一数据集上比较：

```text
质量变化
成本变化
P95 变化
工具错误变化
越权变化
```

只有质量、安全、成本和性能的综合结果通过门槛，版本才能进入灰度。

### 15.4 混沌与安全测试

- 模型 429、500、慢流和中途断流；
- Redis、PostgreSQL、向量库和第三方 API 短暂不可用；
- 重复队列消息、乱序消息和 Worker 强制退出；
- Prompt Injection 文档诱导调用高危工具；
- 租户 A 的问题与租户 B 的同名知识文档；
- 工具输出包含密钥、超大文本、恶意 HTML 或错误编码。

**完成标准**：CI 不依赖真实模型也能覆盖主控制流；模型、Prompt、知识库和工具版本上线前都有可比较的评测报告；故障测试不会造成跨租户或重复副作用。

## 十六、步骤 14：代码执行必须有操作系统级隔离

Pi 官方[安全文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)明确说明：Pi 是本地 Coding Agent，默认没有内置沙箱，工具和扩展继承启动进程的系统权限；项目信任只控制是否加载项目资源，并不是运行时安全边界。

因此，企业服务如果允许 Bash、Python、浏览器自动化、第三方插件或用户上传代码，必须把执行放进独立容器、虚拟机、MicroVM 或策略沙箱：

```text
Agent Worker
  → Sandbox Broker
      → 一次性执行环境
          - 只挂载本次任务需要的目录
          - 默认只读，写目录单独授权
          - 短期凭证，不挂载宿主机凭证目录
          - 网络域名白名单
          - CPU / 内存 / 进程数 / 磁盘 / 时间限制
          - 结束后销毁
```

Anthropic 官方[沙箱文档](https://code.claude.com/docs/en/sandboxing)也把权限与沙箱分成两层：权限决定工具能否调用，沙箱用操作系统机制限制 Bash 和子进程能访问的文件与网络。企业 Agent 应采用同样的纵深防御，不能把正则命令黑名单或 Prompt 中的“不要执行危险命令”当作隔离。

工具使用短期、最小权限凭证。比如查询工单的 Token 不能同时拥有删除客户和导出全库权限；高风险写工具最好由工具网关用服务身份代执行，而不是把通用云密钥交给 Agent 进程。

**完成标准**：在沙箱中执行读取宿主密钥、写工作区外目录、访问未授权域名和 Fork Bomb 等测试，必须被操作系统层阻断；沙箱不可用时生产环境应失败关闭，不能静默回退到宿主机执行。

## 十七、步骤 15：启动、停止和发布都要把任务状态考虑进去

API 与 Worker 分开部署：API 按请求量扩容，Worker 按队列深度、模型配额和工具容量扩容。启动顺序：

```text
加载并校验配置
→ 建立数据库/Redis/队列连接
→ 校验 Prompt、工具和模型注册
→ 启动后台 relay / reaper
→ API 开始就绪或 Worker 开始取任务
```

健康检查分开：

- `liveness`只说明进程事件循环没有卡死；
- `readiness`说明当前实例可以接收新流量或领取新任务；
- 模型供应商短时故障通常不应杀死进程，而应由路由、熔断和降级处理。

收到 `SIGTERM` 后：

```typescript
process.on("SIGTERM", async () => {
  readiness.set(false);          // 先摘流量
  await api.close();             // 不再接受新请求
  await worker.pause(true);      // 不再领取新任务

  await Promise.race([
    waitForInflightRuns(),
    delay(25_000),
  ]);

  await checkpointRemainingRuns();
  await telemetry.flush();
  await closeInfrastructure();
  process.exit(0);
});
```

不要收到信号就立即退出，也不要无限等待。超过退出窗口的任务保存检查点后交给新 Worker 恢复。

发布采用兼容性迁移和灰度：

1. 数据库先做向后兼容的扩展迁移，不直接删除旧字段。
2. 新旧 Worker 同时可读取旧任务状态。
3. 用租户白名单或稳定哈希把少量新任务送到新版本。
4. 比较成功率、P95、单位成功成本、工具错误和越权指标。
5. 达不到门槛就停止新流量，旧任务仍由原版本完成或按迁移规则恢复。
6. 稳定后再清理旧字段和旧 Prompt。

**完成标准**：滚动发布期间任务不丢、不重复写、不出现大面积连接中断；旧版本创建的运行可以由兼容的新版本恢复；回滚不需要手工改数据库状态。

## 十八、步骤 16：单 Agent 跑稳后，再决定是否拆多 Agent

多 Agent 不是生产化的必经步骤。只有满足下面条件才拆：

- 子任务真正独立，可以并行；
- 子任务需要隔离的大上下文或不同权限；
- 每个子任务都有明确输入、结构化输出、预算和验收器；
- 评测证明收益大于新增 Token、等待和失败面。

实现时，每个子 Agent 都是一个子 `run`，而不是内存里的一段角色对话：

```text
parent_run
  ├── child_run: 检索证据（只读工具、低成本模型）
  ├── child_run: 核对合规（无写权限）
  └── child_run: 生成草稿（无业务提交权限）
          ↓
     确定性聚合器验证 Schema、引用和完成状态
```

子任务继承 `tenant_id`，但权限做交集而不是复制父 Agent 的全部权限；取消信号从父任务传播到子任务；每个子任务单独计费、限流、超时和记录 Trace。Anthropic 官方[子 Agent 文档](https://code.claude.com/docs/en/subagents)同样把子 Agent 定义为独立上下文、独立工具与权限的执行者，而不是共享全部历史的角色名称。

**完成标准**：关闭多 Agent 分支后主流程仍可工作；子任务失败有明确降级或回滚；使用多 Agent 的线上质量收益经过同一评测集验证。

## 十九、一个人怎样按二十个工程日完成第一版

下面是单人开发的参考排期。团队可以并行，但依赖顺序不要颠倒：

| 工程日 | 只做什么 | 必须交付的代码 | 退出条件 |
| --- | --- | --- | --- |
| 1–2 | 最小垂直闭环 | Pi Agent、一个只读工具、Fake Model 测试 | 能完成一次任务，也能被轮次和超时强制停止 |
| 3–5 | 任务服务化 | `agent_runs`、API、幂等、outbox、队列 Worker | 重复提交不重复执行，API 不等待模型 |
| 6–8 | 工具控制面 | 工具协议、权限、审批、幂等步骤、审计 | 任何工具都无法绕开网关，高危写操作必须审批 |
| 9–11 | 故障恢复 | 心跳、reaper、分层超时、重试、取消、检查点 | 三个关键崩溃点注入后均能正确恢复 |
| 12–14 | 上下文与 RAG | 会话投影、摘要、混合检索、权限过滤、引用 | 100 轮会话不溢出，无权文档不进入候选集 |
| 15–17 | 观测与评测 | Trace、指标、成本、离线数据集、回归门禁 | 任意失败可定位，版本变更有可比较报告 |
| 18–20 | 上线准备 | 沙箱、压测、容量、优雅启停、灰度和回滚 | 峰值与故障演练通过，发布期间任务不丢不重 |

第一版请主动限制范围：

```text
1 个明确业务场景
1 个主 Agent
1 个模型供应商 + 1 条备用路由
不超过 3 个工具，其中写工具最多 1 个
1 套模块化 RAG
最大 12 步、5 分钟、固定 Token 预算
高风险动作必须人工审批
```

不要同时建设 Agent 商店、可视化编排器、多 Agent 群聊、GraphRAG、长期记忆和十家模型适配。它们会掩盖主链路是否真的可靠。

每天结束前回答四个问题：

1. 今天新增的状态写在哪里，进程退出后还在不在？
2. 今天新增的副作用如何去重，超时后怎样判断是否已经发生？
3. 今天新增的权限由哪段确定性代码执行，是否有跨租户测试？
4. 今天新增的复杂度改善了哪个可测指标，回退开关在哪里？

## 二十、这次从 Pi 和 Claude Code 实现中真正借鉴了什么

### 20.1 Pi：把 Agent 内核保持小，把边界开放出来

截至 2026 年 8 月 10 日，[Pi](https://github.com/earendil-works/pi)约有 8.7 万 Star，采用 MIT 许可证。它对本文最有价值的不是终端界面，而是四个实现选择：

1. `pi-ai`负责模型供应商、认证、消息和流式差异，`pi-agent-core`只负责状态与模型—工具循环，Coding Agent 再负责会话、压缩和应用工具。
2. `streamFn`、`transformContext`、`convertToLlm`和事件订阅都是注入边界，调用方可以控制模型、上下文和持久化。
3. 工具可以显式选择并行或串行，并在执行前后经过钩子；停止、取消和队列也有明确事件语义。
4. 完整会话与模型上下文投影分开；压缩不会删除原始历史。

同时必须接受它的边界：Pi 官方明确说 Coding Agent 没有内置沙箱，也不替企业提供租户身份、分布式队列、审批、模型配额和发布治理。因此本文选择“Pi 做内核，企业代码做外层控制面”，而不是把 Pi CLI 直接包装成公共服务。

### 20.2 Claude Code：学习工具管线和防御分层，不复制源码

用户提供的两个仓库分别是 [`liuup/claude-code-analysis`](https://github.com/liuup/claude-code-analysis)与 [`puletire9-leo/cchaha-miao`](https://github.com/puletire9-leo/cchaha-miao)。它们都不是 Anthropic 官方仓库，并且都声明内容来自同一份非官方源码快照。

本次核对发现，两个仓库里的 `QueryEngine.ts`、`Tool.ts`、工具执行、工具编排、会话存储和消息处理六个核心文件的 SHA-256 完全一致。因此它们不能被当作“两份来源互相证明”，只能算同一份材料的两种整理。前者没有标准开源许可证且 README 明确限制商业使用，后者也不能替代 Anthropic 的许可证与官方文档。**企业项目不应复制这些代码、Prompt、内部开关或固定阈值。**

本文只把其中能由公开行为和官方文档校正的模式，重新写成原创实现：

| 观察到的模式 | 本文怎样落地 |
| --- | --- |
| 主循环采用流式事件，工具结果继续回到模型 | Pi 适配器 + 可持久事件 + Worker 生命周期 |
| 工具先校验，再经过 Hook、权限、执行和结果处理 | 统一工具网关，失败关闭，写操作审批和幂等 |
| 并发安全由工具显式声明，未知工具默认不并发 | `parallel/sequential`元数据，写操作默认串行 |
| 会话使用追加式记录和父子关系，支持恢复与分支 | `run/step/event`权威状态 + 可重建上下文投影 |
| 上下文先清理大工具输出，再摘要旧历史 | 大结果外置 + 结构化会话摘要 + 近期消息预算 |
| 子 Agent 有独立上下文、工具和取消链 | 每个子 Agent 对应子 `run`，权限取交集 |
| 权限门与运行沙箱是两层能力 | 工具策略负责授权，操作系统沙箱负责强制隔离 |

对应的公开事实可在 Anthropic 官方的[工作原理](https://code.claude.com/docs/en/how-claude-code-works)、[权限](https://code.claude.com/docs/en/permissions)、[Hooks](https://code.claude.com/docs/en/hooks)、[沙箱](https://code.claude.com/docs/en/sandboxing)、[上下文窗口](https://code.claude.com/docs/en/context-window)和[子 Agent](https://code.claude.com/docs/en/subagents)文档中核对。

### 20.3 最终判断

Pi 与 Claude Code 走了不同路线：Pi 把核心做得很小，让使用者自己扩展；Claude Code 把权限、Hooks、上下文、工具和开发体验装配得更完整。但它们共同说明：**好用的 Agent 不是靠一个复杂总控 Prompt，而是靠稳定消息、可注入循环、标准工具协议、持久会话、取消传播和明确安全边界。**

企业服务还要再向外补上多租户、队列、幂等、审批、SLO、评测和发布治理。这些才是本文 16 步的主体。

## 二十一、上线前逐项验收

### 身份与数据

- [ ] `tenant_id`来自可信身份，不来自请求体。
- [ ] 数据库、Redis、队列、RAG 和缓存均携带租户边界。
- [ ] 跨租户、越权角色和已撤权用户测试全部通过。
- [ ] 日志、Trace、审计和对象存储的保留期与访问权限已定义。

### Agent 与工具

- [ ] 最大轮次、绝对截止时间、Token、成本和并发均由代码强制执行。
- [ ] 所有工具都有输入/输出 Schema、风险、并发、超时和输出上限。
- [ ] 写操作支持幂等；结果不确定时进入核对而不是盲目重试。
- [ ] 高风险操作需要策略校验和人工审批。
- [ ] 代码与 Shell 在操作系统级沙箱运行，凭证最小化。

### 状态与恢复

- [ ] `run`、`step`、`event`和会话消息职责清晰。
- [ ] API 提交与队列投递通过 outbox 保证不丢。
- [ ] 重复消息只会有一个 Worker 成功领取。
- [ ] Worker 心跳过期可以恢复，取消会传播到模型和工具。
- [ ] 部署新版本后，旧任务仍可继续或按明确规则迁移。

### 性能与成本

- [ ] 队列、模型、工具、数据库和全链路分别设置超时。
- [ ] 限流与 Token 预留在多副本之间共享。
- [ ] 熔断、备用模型和业务降级有明确质量边界。
- [ ] 上下文、工具输出、检索结果、缓存和队列都有容量上限。
- [ ] 观测的是每个成功任务的成本，而不是只看单次模型价格。

### 质量与发布

- [ ] 控制流测试使用脚本化模型，不依赖线上模型随机性。
- [ ] Prompt、模型、工具、知识库和摘要变更都有离线回归。
- [ ] 灰度同时比较质量、P95、成本、工具错误和安全指标。
- [ ] 启动失败不会进入就绪，停止时先摘流量再保存检查点。
- [ ] 回滚开关、值班负责人和故障手册已经演练。

如果这份清单还有大量空白，项目就仍然是 Demo。与用了几个 Agent、画了几层 Graph 无关。

## 结语：先完成一条可靠链路，再增加智能

从零写企业级 Agent 的正确顺序不是“选模型—写 Prompt—接十个工具—加多 Agent”，而是：

```text
最小循环
→ 权威任务状态
→ 租户上下文
→ 幂等提交和可靠队列
→ 统一工具网关
→ 检查点与恢复
→ 上下文和 RAG
→ 限流、缓存、观测和评测
→ 沙箱、灰度与优雅发布
→ 最后才评估多 Agent
```

做到这里，模型仍然可以犯错，但它不能越过权限，不能无限运行，不能悄悄重复写数据，不能因为进程重启丢掉长任务，也不能让一次失败变成无法解释的黑盒。这才是“企业级可用”的起点。

## 参考资料

### Pi 官方仓库与文档

- [earendil-works/pi：GitHub 仓库](https://github.com/earendil-works/pi)
- [Pi Agent Core：状态、事件、工具循环与钩子](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)
- [Pi Agent Loop 源码](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts)
- [Pi：会话与分支](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md)
- [Pi：上下文压缩](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md)
- [Pi：安全边界与沙箱要求](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)

### Anthropic 官方文档

- [Claude Code 的 Agent 循环与上下文](https://code.claude.com/docs/en/how-claude-code-works)
- [Claude Code 权限规则](https://code.claude.com/docs/en/permissions)
- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code 沙箱](https://code.claude.com/docs/en/sandboxing)
- [Claude Code 上下文窗口](https://code.claude.com/docs/en/context-window)
- [Claude Code 子 Agent](https://code.claude.com/docs/en/subagents)
- [Claude Code 成本治理](https://code.claude.com/docs/en/costs)

### 社区分析材料

- [liuup/claude-code-analysis](https://github.com/liuup/claude-code-analysis)
- [puletire9-leo/cchaha-miao](https://github.com/puletire9-leo/cchaha-miao)

以上两个社区仓库仅用于理解实现线索，不构成 Anthropic 官方说明，也不作为可复制到商业项目的源码来源。
