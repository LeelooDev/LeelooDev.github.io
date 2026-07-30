---
title: 从零学会企业级 AI Agent 开发（二）：工具层实战——接口即性能，把 ACI 当产品来设计
date: 2026-06-12
category: code
tags: [AI, Agent, LLM, 工程实践]
cover: /images/cover-red-wall-door.jpg
coverAlt: 斑驳红墙上的一扇绿门，蓝袍白巾的身影正推门而入
excerpt: 系列第二篇进入工具层：用同一个模型换接口提升 64% 的实证，手把手把一个工单系统 agent 的工具从「能跑的烂版本」重构成生产级——粒度合并、描述防呆、返回设计、错误引导、写操作三道闸，以及 MCP 在企业里的正确打开方式。
dek: 工具是 agent 通向真实世界的那扇门。这一篇全程动手：跟着六个重构步骤，把你的工具层从 API 包装纸打磨成真正的 ACI。
---

> 这是「从零学会企业级 AI Agent 开发」系列的第二篇。[第一篇](/posts/enterprise-ai-agent-01)我们把 agent 祛魅成「一个带护栏的 while 循环」，并留下了一句话：**agent 的能力上限由工具质量决定**。这一篇就来兑现它——而且全程动手，你可以跟着每一步把代码敲出来。

## 一、接口即性能：三组让人坐不住的证据

先回答「为什么值得为工具层单独写一篇」。不是因为它玄妙，而是因为它的投入产出比高得离谱，而且有罕见的干净实证——**模型完全不变，只改接口**：

普林斯顿的 SWE-agent 论文（NeurIPS 2024）用同一个 GPT-4 Turbo 在 SWE-bench Lite 上做了三组对照：

<figure class="diagram">
<svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="同一模型在三种接口下的 SWE-bench Lite 成绩对比柱状图">
<defs>
<marker id="t2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#25262b"/></marker>
</defs>
<line x1="100" y1="250" x2="740" y2="250" stroke="#9a9da6" stroke-width="1.5"/>
<rect x="160" y="223.3" width="120" height="26.7" fill="#c4c6cd"/>
<rect x="360" y="140" width="120" height="110" fill="#9a9da6"/>
<rect x="560" y="70" width="120" height="180" fill="#25262b"/>
<g font-size="15" font-weight="600" fill="#25262b">
<text x="220" y="213" text-anchor="middle">2.67%</text>
<text x="420" y="130" text-anchor="middle">11.0%</text>
<text x="620" y="60" text-anchor="middle">18.0%</text>
</g>
<g font-size="12.5" fill="#25262b">
<text x="220" y="272" text-anchor="middle">RAG 检索拼接</text>
<text x="420" y="272" text-anchor="middle">裸 Linux Shell</text>
<text x="620" y="272" text-anchor="middle">定制 ACI（SWE-agent）</text>
</g>
<path d="M 470 120 C 510 85 530 80 552 72" fill="none" stroke="#25262b" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#t2-arrow)"/>
<text x="498" y="62" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">模型相同，只改接口：相对提升 64%</text>
<text x="420" y="294" text-anchor="middle" font-size="11" fill="#6b6e76">数据：SWE-agent 论文（arXiv 2405.15793），SWE-bench Lite，GPT-4 Turbo</text>
</svg>
<figcaption>图 1：接口即性能。给模型一个裸 shell，成绩 11%；把同样的能力重新设计成模型友好的接口，18%。论文原话：「An LM-friendly ACI's value is confirmed by SWE-agent's 64% relative increase compared to Shell-only.」</figcaption>
</figure>

另外两组证据：

- **失败大头在工具环节，不在「智能」。** τ-bench（Sierra，ICLR 2025）给客服场景 agent 的失败做了尸检：**33% 是参数填错，25% 是违反业务规则的错误决策，22% 是信息漏报错报**——加起来八成的失败发生在「会用工具」这件事上。还记得第一篇里 gpt-4o 在 retail 域 61% 的单次成功率吗？同一任务跑 8 次全对的概率（pass^8）**跌破 25%**。
- **专业团队的时间都花在哪。** Anthropic 做 SWE-bench agent 的复盘原话："we actually spent more time optimizing our tools than the overall prompt"——优化工具的时间超过优化 prompt。

这就引出本篇的核心概念。SWE-agent 论文给它起了名字：**ACI（Agent-Computer Interface，智能体-计算机接口）**。人类有 HCI——几十年的人机交互设计积累；LM agent 是一类全新的「用户」，它读不懂你的潜台词、记不住 UUID、不会自己忽略无关信息，但它不知疲倦、上下文内过目不忘。Anthropic 的建议是：**为 ACI 投入与 HCI 同等的设计精力**。

> 工具不是「给模型挂几个函数」。Anthropic《Writing effective tools for agents》的定义值得抄在墙上："Tools are a new kind of software which reflects a contract between deterministic systems and non-deterministic agents."——工具是确定性系统与非确定性 agent 之间的契约，一种新的软件形态。

## 二、实战项目：工单系统 Agent

本篇的教学载体是一个**企业客服工单 agent**：给它一个工单号或一句自然语言指令，它要能查上下文、回复客户、关闭工单、必要时退款。选这个场景是因为它五脏俱全：有读有写、有高危操作（退钱）、有业务规则，正是 τ-bench 验证过的「失败重灾区」。

### 2.0 准备：数据层与循环复用

agent 循环直接复用第一篇的 `run_agent`（把它存成 `agent.py`，这正是裸写的好处——循环是你的，想怎么接就怎么接）。数据层用标准库 sqlite3 模拟企业数据库，零依赖：

```python
# store.py —— 模拟工单数据库
import sqlite3

def init_db(path: str = "helpdesk.db") -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript("""
    CREATE TABLE IF NOT EXISTS customers(
      id TEXT PRIMARY KEY, name TEXT, tier TEXT, email TEXT);
    CREATE TABLE IF NOT EXISTS orders(
      id TEXT PRIMARY KEY, customer_id TEXT, item TEXT,
      amount_cents INTEGER, status TEXT);
    CREATE TABLE IF NOT EXISTS tickets(
      id TEXT PRIMARY KEY, customer_id TEXT, order_id TEXT,
      subject TEXT, body TEXT, status TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS replies(
      ticket_id TEXT, author TEXT, body TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS refunds(
      idempotency_key TEXT PRIMARY KEY, order_id TEXT,
      amount_cents INTEGER, status TEXT);
    """)
    seed(db)
    return db

def seed(db):
    if db.execute("SELECT COUNT(*) FROM customers").fetchone()[0]:
        return
    db.executescript("""
    INSERT INTO customers VALUES
      ('CUST-001','陈雪','gold','chenxue@example.com'),
      ('CUST-002','王磊','basic','wanglei@example.com');
    INSERT INTO orders VALUES
      ('ORD-1001','CUST-001','降噪耳机',89900,'paid'),
      ('ORD-1002','CUST-001','机械键盘',45900,'shipped'),
      ('ORD-1003','CUST-002','显示器支架',19900,'paid');
    INSERT INTO tickets VALUES
      ('TICK-1042','CUST-001','ORD-1001','重复扣款投诉',
       '我买耳机被扣了两次款，请尽快处理！','open','2026-06-10'),
      ('TICK-1043','CUST-002','ORD-1003','发货咨询',
       '支架什么时候发货？','open','2026-06-11');
    """)
    db.commit()
```

### 2.1 第一版工具：API 包装纸（反面教材）

大多数团队的第一版工具层都长一个样：把现成的 REST API 一比一包成函数。我们也先这么写——九个工具，每个三行：

```python
# tools_v1.py —— 反面教材：API 的一比一包装
def get_ticket_by_id(ticket_id): ...      # GET /tickets/{id}
def list_tickets(status): ...             # GET /tickets?status=
def get_customer_by_id(customer_id): ...  # GET /customers/{id}
def list_orders_by_customer(customer_id): ...
def get_order_by_id(order_id): ...
def list_replies(ticket_id): ...
def create_reply(ticket_id, body): ...
def update_ticket_status(ticket_id, status): ...
def create_refund(order_id, amount_cents): ...
```

跑一个真实任务：「处理 TICK-1042 这个工单」。观察 transcript（第一篇说过：永远看原始转录），模型的真实行为是：

```text
→ get_ticket_by_id("TICK-1042")        # 拿到 customer_id、order_id
→ get_customer_by_id("CUST-001")       # 拿客户信息
→ get_order_by_id("ORD-1001")          # 拿订单信息
→ list_orders_by_customer("CUST-001")  # 又查了一遍全部订单（冗余）
→ list_replies("TICK-1042")            # 拿历史回复
→ ……5 次调用、5 轮往返之后，才开始真正处理问题
```

每一轮往返都是一次完整的 LLM 调用：延迟累加、token 累加，而且根据第一篇的复合错误率数学，**链路上每多一步，端到端成功率就乘上一次单步可靠性**。这版工具没有 bug，但它把组合复杂度全部推给了模型——这正是 ACI 设计要消灭的东西。

下面六个 Step，把它一步步重构成生产级。

## 三、Step 1 工具粒度：面向工作流合并，不要包装 API

Anthropic 给出的对照表是这个主题最好的教材：

| 细粒度包装（差） | 面向工作流（好） |
| --- | --- |
| `list_contacts` + `list_events` + `create_event` | `schedule_event`（一个工具内查空闲并排会） |
| `read_logs` | `search_logs`（只返回相关行及上下文） |
| `get_customer_by_id` + `list_transactions` + `list_notes` | `get_customer_context`（一次汇编客户全貌） |

背后的根本约束："LLM agents have limited 'context'... whereas computer memory is cheap and abundant."——**模型的上下文是稀缺资源，你的内存不是**。能在工具内部用一次 SQL JOIN 解决的事，绝不让模型用五轮对话去拼。

数量上的经验值也高度收敛：OpenAI 官方建议**单轮可用工具少于 20 个**；多个 MCP 实践团队的结论是每个 server 5–15 个；GitHub Copilot 把工具从 40 个砍到 13 个，benchmark 反而提升 2–5%。而且 OpenAI 的指南特别强调：**重叠比数量更致命**——有团队 15 个边界清晰的工具运转良好，也有团队 10 个职责重叠的工具一塌糊涂，模型会在「该用哪个」的模糊地带反复横跳。

照此重构，九个工具合并成五个：

```python
# tools_v2.py —— 面向工作流的工具集
def get_ticket_context(ticket_id, response_format="concise"):
    """一次取回工单全貌：工单 + 客户 + 关联订单 + 历史回复"""

def search_tickets(query, status=None, limit=10):
    """按关键词/状态搜索工单，返回摘要列表"""

def reply_to_ticket(ticket_id, body):
    """以客服身份回复工单（追加，可重复执行）"""

def close_ticket(ticket_id, resolution):
    """关闭工单并记录处理结论"""

def refund_order(order_id, amount_cents, reason, dry_run=True):
    """为订单退款。高危操作：默认 dry_run 预览，确认后才真正执行"""
```

`get_ticket_context` 的实现就是把刚才模型用五轮做的事写成一次 JOIN：

```python
def get_ticket_context(ticket_id: str, response_format: str = "concise") -> str:
    t = db.execute("SELECT * FROM tickets WHERE id=?", (ticket_id,)).fetchone()
    if t is None:
        return err(f"工单 {ticket_id} 不存在",
                   "形如 TICK-XXXX 的工单号", "TICK-1042")
    c = db.execute("SELECT * FROM customers WHERE id=?", (t["customer_id"],)).fetchone()
    o = db.execute("SELECT * FROM orders WHERE id=?", (t["order_id"],)).fetchone()
    replies = db.execute(
        "SELECT * FROM replies WHERE ticket_id=? ORDER BY created_at", (ticket_id,)
    ).fetchall()

    tier = {"gold": "黄金会员", "basic": "普通会员"}[c["tier"]]
    lines = [
        f"工单 {t['id']}「{t['subject']}」（{t['status']}，{t['created_at']} 创建）",
        f"客户：{c['name']}（{tier}）",
        f"关联订单：{o['id']} {o['item']} ¥{o['amount_cents']/100:.2f}（{o['status']}）",
        f"客户诉求：{t['body']}",
        f"历史回复：{len(replies)} 条" + ("（无）" if not replies else ""),
    ]
    if response_format == "detailed":   # 详细模式才暴露技术字段与回复全文
        lines += [f"  [{r['created_at']}] {r['author']}: {r['body']}" for r in replies]
        lines.append(f"（技术字段：customer_id={c['id']}, order_id={o['id']}）")
    return "\n".join(lines)
```

同一个任务再跑一遍：5 轮往返变 1 轮，token 省了一半以上，而且模型再也不会「忘了查历史回复」——因为上下文是工具替它备齐的。

## 四、Step 2 工具描述：写给一位「新员工」的 prompt

工具的 JSON schema 会被原样注入模型的系统提示词，**描述就是 prompt 的一部分**。Anthropic 官方文档对此的措辞罕见地强硬：

> "Provide extremely detailed descriptions. This is by far the most important factor in tool performance."——提供极其详细的描述，这是影响工具性能**最重要的单一因素**。官方给的硬性下限：**每个工具至少 3–4 句话**。

写法心诀有两个。第一个来自 Anthropic：像「给团队新人介绍这个工具」一样写——把所有隐含知识（查询格式、术语、资源之间的关系）显式说出来。第二个来自 OpenAI，叫 **intern test**：只看你给模型的这些信息，一个实习生能正确用对这个工具吗？不能，就是描述的问题。

对照看 `refund_order` 的 schema，注意每个细节都在「替模型排雷」：

```python
{
    "type": "function",
    "function": {
        "name": "refund_order",
        "description": (
            "为指定订单创建退款。用于客户投诉成立、需要退还货款的场景。"
            "默认 dry_run=true，只返回退款预览不实际执行；"
            "预览无误后，须以 dry_run=false 再次调用才会真正退款。"
            "金额单位是【分】，不得超过订单实付金额。"
            "本工具只负责退款，不会回复客户、不会修改工单状态。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "订单号，形如 ORD-1001。来自 get_ticket_context 的返回",
                },
                "amount_cents": {
                    "type": "integer",
                    "description": "退款金额，单位为分。例：¥899.00 填 89900",
                },
                "reason": {
                    "type": "string",
                    "description": "退款原因，将写入审计日志，须具体到事实，如「重复扣款」",
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "true=仅预览（默认）；false=真正执行退款",
                },
            },
            "required": ["order_id", "amount_cents", "reason"],
        },
    },
}
```

参数层面的防呆（Anthropic 称为 *poka-yoke*，丰田生产体系里的「防错法」）有四条铁律，全部有实证背书：

1. **命名消歧**：`user_id` 而不是 `user`，`amount_cents` 而不是 `amount`——单位写进名字里，模型就很难填错。
2. **用 enum 让非法状态不可表示**（OpenAI 原话 "make invalid states unrepresentable"）：状态参数给 `"enum": ["open", "pending", "closed"]`，而不是自由字符串。
3. **已知的参数不要让模型填**：当前登录的客服 ID、租户 ID、时间戳，由代码注入，模型只填它真正需要决策的部分。
4. **结构性约束优于文字告诫**。Anthropic 做 SWE-bench 时，模型在 `cd` 之后用相对路径频繁出错，prompt 里怎么叮嘱都没用；最后把工具参数改成**强制绝对路径**，原文是 "the model used this method flawlessly"——从此零失误。改接口一次，胜过改 prompt 十次。

## 五、Step 3 返回结果设计：每个 token 都要挣到自己的位置

工具的返回值会进入上下文，跟着后面每一轮请求反复计费、反复占据模型的注意力。两条原则：

**原则一：返回语义，不返回数据库行。** Anthropic 的实测结论令人印象深刻：仅仅把返回里的 UUID 换成有语义的名称（甚至只是换成 0 起始的序号），就能 "significantly improves Claude's precision in retrieval tasks by reducing hallucinations"——显著提升检索精度、减少幻觉。

> **真实坑点 ⑤：模型会一本正经地编 ID。** τ-bench 统计过：gpt-3.5 级别的模型平均**每个任务幻觉出 6.34 个不存在的 user/product/order ID**（gpt-4o 也有 0.46 个）。你返回的 UUID 越多、技术字段越密，模型越容易在后续调用里「记错」然后把编出来的 ID 传给下一个工具——而第一篇说过，畸形参数会静默污染后面所有步骤。

<figure class="diagram">
<svg viewBox="0 0 800 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="工具返回结果的反模式与正确设计对比">
<text x="210" y="34" text-anchor="middle" font-size="14" font-weight="600" fill="#25262b">反模式：数据库行原样倒出</text>
<rect x="40" y="48" width="340" height="216" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<g font-family="monospace" font-size="11" fill="#25262b">
<text x="56" y="74">{</text>
<text x="56" y="94">  "id": "f81d4fae-7dec-11d0-a765-...",</text>
<text x="56" y="114">  "customer_ref": "c9a646d3-9c61-...",</text>
<text x="56" y="134">  "order_ref": "ddfa1d6e-0bc4-...",</text>
<text x="56" y="154">  "created_ts": 1718064000,</text>
<text x="56" y="174">  "mime_type": "application/json",</text>
<text x="56" y="194">  "_links": { "self": "/api/v2/..." },</text>
<text x="56" y="214">  ……共 38 个字段</text>
<text x="56" y="234">}</text>
</g>
<text x="210" y="284" text-anchor="middle" font-size="12" fill="#6b6e76">≈ 2,100 tokens，UUID 是幻觉温床</text>
<text x="590" y="34" text-anchor="middle" font-size="14" font-weight="600" fill="#25262b">面向 agent：语义化 + 详略可选</text>
<rect x="420" y="48" width="340" height="216" rx="10" fill="#ffffff" stroke="#25262b" stroke-width="2"/>
<g font-family="monospace" font-size="11" fill="#25262b">
<text x="436" y="80">工单 TICK-1042「重复扣款投诉」(open)</text>
<text x="436" y="106">客户：陈雪（黄金会员）</text>
<text x="436" y="132">关联订单：ORD-1001 降噪耳机</text>
<text x="436" y="158">　　　　　¥899.00（paid）</text>
<text x="436" y="184">客户诉求：被扣了两次款……</text>
<text x="436" y="210">历史回复：0 条</text>
<text x="436" y="236">需要回复全文时用 detailed 模式</text>
</g>
<text x="590" y="284" text-anchor="middle" font-size="12" fill="#6b6e76">≈ 70 tokens，模型可直接引用</text>
<text x="400" y="330" text-anchor="middle" font-size="12" fill="#6b6e76">Anthropic 对 Slack 工具的实测：detailed 响应 206 tokens，concise 响应 72 tokens——差 3 倍</text>
</svg>
<figcaption>图 2：同一份数据的两种返回。右边不是「偷工减料」，而是把模型不需要的技术字段藏进 detailed 模式，按需暴露。</figcaption>
</figure>

**原则二：给详略开关，给截断装方向盘。** `get_ticket_context` 里那个 `response_format` 参数就是 Anthropic 推荐的模式：`concise` 给日常流程（剔除 `thread_ts`、`channel_id` 这类技术 ID），`detailed` 给确实需要下游调用串联的场景。他们对 Slack 工具的实测：206 vs 72 tokens，三倍之差。

大结果必须截断 + 分页，但**截断不是一刀切断，而是附上引导**。Claude Code 的默认值是单个工具响应不超过 25,000 tokens，截断时附一句「建议做多次小而精准的搜索，而不是一次大而全的搜索」。我们的 `search_tickets` 照此办理：

```python
def search_tickets(query: str, status: str | None = None, limit: int = 10) -> str:
    limit = min(limit, 20)
    sql = "SELECT id, subject, status FROM tickets WHERE subject LIKE ?"
    args = [f"%{query}%"]
    if status:
        sql += " AND status=?"
        args.append(status)
    rows = db.execute(sql + " LIMIT ?", (*args, limit + 1)).fetchall()

    if not rows:
        return f"没有找到匹配「{query}」的工单。可尝试更换关键词或去掉 status 过滤。"
    more = len(rows) > limit
    rows = rows[:limit]
    out = "\n".join(f"{r['id']}「{r['subject']}」({r['status']})" for r in rows)
    if more:
        out += f"\n（结果超过 {limit} 条，已截断。建议用更具体的关键词缩小范围）"
    return out
```

> **真实坑点 ⑥：分页式「下一页」工具比没有搜索更糟。** SWE-agent 的消融实验里有个反直觉结果：给模型一个逐条翻页的 iterative search，成绩反而**比完全不提供搜索工具还低**（12.0% vs 15.7%）。原因是模型会老老实实把每一页都翻完，把上下文和预算耗尽在 `next、next、next` 上。他们的解法写进了接口：搜索结果**超过 50 条直接拒绝返回**，并提示「请写一个更具体的查询」。约束不是限制模型，是保护它。

还有一个容易忽略的细节：**空结果和静默成功必须显式确认**。SWE-agent 给所有无输出的命令统一返回 "Your command ran successfully and did not produce any output"——否则模型面对空字符串会自我怀疑，开始无意义地重试。我们的写工具同理，成功就明说：`"已回复工单 TICK-1042（第 1 条回复）"`。

## 六、Step 4 错误设计：报错也是 prompt

第一篇讲过「错误要压回上下文」（Manus：错误恢复能力是真 agentic 行为最清晰的指标）。这一篇更进一步：**错误信息的措辞直接决定模型下一步的质量**。Anthropic 原话："prompt-engineer your error responses... rather than opaque error codes or tracebacks."

实操模板是三段式：**出了什么错 + 期望什么 + 给一个正确示例**：

```python
def err(what: str, expect: str, example: str) -> str:
    return f"ERROR: {what}。期望：{expect}。示例：{example}"

# 差：模型只能瞎猜
"ERROR: invalid input"
# 差：模型读不懂，还浪费 500 个 token
"Traceback (most recent call last): File 'tools.py', line 42, in ..."
# 好：模型下一步就能修对
err("日期格式无效：'15/06/2026'", "ISO 8601 格式（YYYY-MM-DD）", "2026-06-15")
```

两个细节：

- **最多建议一两个修复方向。** 来自 MCP 工具设计实践的原话："Multiple options force the LLM to guess, and guessing is what we're trying to eliminate."——你列五个可能原因，模型就会挑一个最顺眼的猜。
- **为什么防呆比纠错优先级高**：SWE-agent 统计过，模型单次编辑成功率 90.5%，但**一旦失败过一次，后续恢复的概率掉到 57.2%**——失败会传染。所以他们在 edit 工具里内置 lint 检查，语法错误的编辑直接拒绝落盘（"Your changes have NOT been applied. Fix your edit command & try again."），把这道护栏拆掉，整体成绩掉 3 个百分点。

## 七、Step 5 写操作：分级、预览、幂等，三道闸缺一不可

读工具设计错了浪费 token，写工具设计错了上新闻（第一篇的 Replit 删库还记得吧）。生产级写工具有三道闸：

<figure class="diagram">
<svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="写操作的三道闸：风险分级、预览确认、幂等执行">
<defs>
<marker id="w2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<text x="400" y="36" text-anchor="middle" font-size="13" font-weight="600" fill="#25262b">写操作必经的三道闸（在你的执行器里实现，不依赖模型自觉）</text>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#w2-arrow)">
<line x1="232" y1="140" x2="276" y2="140"/>
<line x1="468" y1="140" x2="512" y2="140"/>
</g>
<rect x="52" y="100" width="180" height="80" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="142" y="128" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">① 风险分级</text>
<text x="142" y="148" text-anchor="middle" font-size="11" fill="#6b6e76">只读 → 自动放行</text>
<text x="142" y="164" text-anchor="middle" font-size="11" fill="#6b6e76">可逆写 / 破坏性写 → 下一闸</text>
<rect x="288" y="100" width="180" height="80" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="378" y="128" text-anchor="middle" font-size="13" fill="#25262b" font-weight="600">② dry-run 预览</text>
<text x="378" y="148" text-anchor="middle" font-size="11" fill="#6b6e76">默认只生成「将要做什么」</text>
<text x="378" y="164" text-anchor="middle" font-size="11" fill="#6b6e76">高危操作 → 人工审批</text>
<rect x="524" y="100" width="180" height="80" rx="10" fill="#25262b"/>
<text x="614" y="128" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="600">③ 幂等执行</text>
<text x="614" y="148" text-anchor="middle" font-size="11" fill="#c4c6cd">幂等键由代码生成</text>
<text x="614" y="164" text-anchor="middle" font-size="11" fill="#c4c6cd">同键重试返回原结果</text>
<g font-size="11.5" fill="#6b6e76">
<text x="142" y="216" text-anchor="middle">MCP ToolAnnotations 的</text>
<text x="142" y="232" text-anchor="middle">readOnly/destructive 只是 hint</text>
<text x="378" y="216" text-anchor="middle">与 Terraform plan→apply 同构</text>
<text x="378" y="232" text-anchor="middle">plan 的产物就是 apply 的入参</text>
<text x="614" y="216" text-anchor="middle">把重试从 LLM 手里拿走</text>
<text x="614" y="232" text-anchor="middle">交给确定性代码</text>
</g>
<text x="400" y="276" text-anchor="middle" font-size="12" fill="#6b6e76">MCP 规范原文：客户端必须把 annotations 当作不可信信息——声称 readOnly 的工具仍可能删文件</text>
</svg>
<figcaption>图 3：三道闸全部实现在确定性代码里。模型负责「决定做什么」，代码负责「确保做得安全」。</figcaption>
</figure>

**第一道闸：风险分级。** MCP 规范为此定义了 `ToolAnnotations`：`readOnlyHint`（不修改环境）、`destructiveHint`（破坏性修改，默认按危险处理）、`idempotentHint`（同参重复调用安全）、`openWorldHint`（触达外部世界，输出可能携带不可信内容）。客户端的推荐策略：只读自动放行、破坏性弹确认、幂等可安全重试。但规范同时用 MUST 级别警告：**annotations 是 hint 不是契约**——"An untrusted server claiming `readOnlyHint: true` may still delete files."。分级要落在你自己的执行器白名单里，不能信工具的自我申报。OpenAI 的同类机制是 GPT Actions 的 `x-openai-isConsequential`：GET 默认无害，其他 HTTP 方法默认要人工确认。

**第二道闸：dry-run / plan-apply。** 和 Terraform 的 plan→apply 同构：写操作默认只产出「我将要做什么」的预览，确认后才执行。

**第三道闸：幂等。** 先看事故：

> **真实坑点 ⑦：超时重试 = 双重退款。** 这是 agent 写操作最经典的事故模式（Airbyte 工程博客的原始描述）："the tool times out, the agent retries assuming the original call failed. But the first call completed... Now you have two tool executions, two side effects, one confused state machine."——工具超时，agent 以为没成功就重试了一次，但第一次其实已经执行完了。两次退款、两个副作用、一个精神错乱的状态机。
>
> 解法的核心是一条铁律：**"Never derive the idempotency key from LLM output."**——幂等键绝不能来自模型输出。模型是非确定性的，重试时把 reason 换个措辞，键就变了，幂等就破了。键必须由代码从结构性上下文生成：`(运行 ID, 步骤号, 工具名, 业务主键)`。

三道闸合在一起，就是完整的 `refund_order`：

```python
import os, uuid

RUN_ID = uuid.uuid4().hex[:8]   # 本次 agent 运行的标识，启动时生成一次

def refund_order(order_id: str, amount_cents: int, reason: str,
                 dry_run: bool = True, _step: int = 0) -> str:
    o = db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    if o is None:
        return err(f"订单 {order_id} 不存在", "形如 ORD-XXXX 的订单号", "ORD-1001")
    if not 0 < amount_cents <= o["amount_cents"]:
        return err(f"退款金额 {amount_cents} 分超出订单实付 {o['amount_cents']} 分",
                   "不超过实付金额的正整数（单位：分）", str(o["amount_cents"]))

    preview = (f"退款预览：订单 {order_id}（{o['item']}）"
               f"退 ¥{amount_cents/100:.2f}，原因：{reason}")
    if dry_run:                                  # 第二道闸：默认只预览
        return preview + "。确认无误后以 dry_run=false 重新调用。"

    if os.environ.get("AGENT_AUTO_APPROVE") != "1":   # 高危：人工审批
        print(f"\n[需要审批] {preview}")
        if input("批准执行？(y/N) ").strip().lower() != "y":
            return "退款被人工驳回。请回复客户说明将转人工处理，不要再次尝试退款。"

    # 第三道闸：幂等键由代码生成，与模型的措辞无关
    key = f"{RUN_ID}:{_step}:refund:{order_id}"
    done = db.execute("SELECT status FROM refunds WHERE idempotency_key=?",
                      (key,)).fetchone()
    if done:                                     # 同键重试：返回原结果，不重复执行
        return f"该退款已执行过（状态：{done['status']}），无需重复操作。"
    db.execute("INSERT INTO refunds VALUES (?,?,?,?)",
               (key, order_id, amount_cents, "succeeded"))
    db.commit()
    return f"退款成功：订单 {order_id} 已退 ¥{amount_cents/100:.2f}。"
```

`_step` 由执行器注入（不在 schema 里，模型看不见也填不了）。在第一篇 `run_agent` 的工具执行处加一行即可：

```python
# agent.py 的执行器里：
if call.function.name == "refund_order":
    args["_step"] = step          # 当前循环步数，代码注入，模型无权决定
```

这个 `input()` 审批当然是教学简化——生产里它会是一条发往审批系统/IM 的消息加一个可恢复的暂停（这正是第五篇「可靠性工程」的主题），但**结构是一样的**：高危动作的最后一公里永远不交给模型。

## 八、Step 6 用 eval 打磨工具：让模型自己当产品经理

工具好不好，不是你说了算，是 transcript 说了算。Anthropic 打磨内部工具的流程值得照抄：

1. **写「强任务」评测集**，拒绝玩具任务。弱任务：「搜一下 `customer_id=9182` 的支付日志」；强任务：「客户 9182 反馈一次购买被扣三次款，找出所有相关日志，并判断是否还有其他客户受同一问题影响」——后者才会逼出真实的工具使用策略。
2. **程序化跑评测**，收集准确率、调用次数、token 消耗、错误率。
3. **通读 transcript**。原话："what agents omit in their feedback and responses can often be more important than what they include"——模型没说的，往往比说了的更重要。
4. **把 transcript 喂回模型，让它自己重构工具**。Anthropic 把评测转录拼接起来交给 Claude Code 分析改进，优化后的工具在保留测试集上**超过了专家手写版本**。一个真实修复案例：他们发现 Claude 的 web 搜索工具总是在 query 后面画蛇添足地拼上「2025」，污染搜索结果——靠改工具描述解决。

这一步先点到为止，评测体系是第六篇的完整主题。现阶段你只需要养成一个习惯：**每次改完工具，跑同一组任务，对比调用次数和 token**——本篇从 v1 到 v2 的重构，这两个数字就是验收标准。

## 九、MCP 在企业里的正确打开方式

终于到 MCP（Model Context Protocol）。2024 年 11 月由 Anthropic 发布，现在 OpenAI、Google、Microsoft 全部接入，SDK 月下载量接近一亿——它已经是工具接入的事实标准。但「标准」不等于「无脑用」，企业里 MCP 有两类大坑，都有实测数据。

### 坑一：工具定义塞爆上下文

LLM API 是无状态的，每次请求都要重传全部工具 schema。MCP 让接入工具变得太容易，于是：

> **真实坑点 ⑧：还没干活，上下文先没了 72%。** 实测数据：GitHub 官方 MCP server 有 93 个工具，定义约 **55,000 tokens**——还没读用户请求，先吃掉 200K 窗口的 21%。同时挂 GitHub + Slack + Sentry 三个 server，约 **143,000 tokens，72% 的窗口在空转状态被烧掉**。更糟的是这不只是钱的问题：Anthropic 自家评测显示，把 50+ 工具全量前置时 Opus 4 的工具选择准确率只有 49%，按需加载后升到 74%——**工具太多会直接让模型变笨**（还记得 Step 1 的「重叠比数量更致命」吗）。

解法已经收敛成三层，按需取用：

<figure class="diagram">
<svg viewBox="0 0 800 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="三种工具接入形态的上下文占用对比">
<text x="400" y="30" text-anchor="middle" font-size="13" font-weight="600" fill="#25262b">200K 上下文窗口被工具定义占用的部分（深色）</text>
<g font-size="12.5" fill="#25262b" font-weight="600">
<text x="130" y="76" text-anchor="end">全量前置加载</text>
<text x="130" y="156" text-anchor="end">按需检索加载</text>
<text x="130" y="236" text-anchor="end">代码执行编排</text>
</g>
<g fill="#ffffff" stroke="#c4c6cd" stroke-width="1.5">
<rect x="140" y="56" width="600" height="34" rx="6"/>
<rect x="140" y="136" width="600" height="34" rx="6"/>
<rect x="140" y="216" width="600" height="34" rx="6"/>
</g>
<rect x="140" y="56" width="432" height="34" rx="6" fill="#25262b"/>
<rect x="140" y="136" width="27" height="34" rx="6" fill="#25262b"/>
<rect x="140" y="216" width="8" height="34" rx="6" fill="#25262b"/>
<g font-size="11.5" fill="#6b6e76">
<text x="148" y="104">GitHub + Slack + Sentry 三个 MCP server ≈ 143K tokens（72%），空转烧掉</text>
<text x="148" y="184">defer loading + 工具搜索：Anthropic 实测 −85%，Opus 4 工具选择准确率 49% → 74%</text>
<text x="148" y="264">MCP 呈现为代码 API，沙箱内编排：示例任务 150K → 2K tokens（−98.7%），代价是要管沙箱</text>
</g>
<text x="582" y="78" font-size="12" fill="#ffffff" font-weight="600" text-anchor="start" dx="-72">≈143K</text>
<text x="175" y="158" font-size="12" fill="#25262b" font-weight="600">≈8.7K</text>
<text x="156" y="238" font-size="12" fill="#25262b" font-weight="600">≈2K</text>
<text x="400" y="312" text-anchor="middle" font-size="11" fill="#6b6e76">数据来源各不相同（社区实测 / Anthropic Advanced tool use / Code execution with MCP），用于量级对比</text>
</svg>
<figcaption>图 4：三种接入形态。第一层是默认现状；第二层（按需加载）多数企业够用；第三层（code execution）token 最省，但引入沙箱运维成本，Anthropic 原文明确提醒了这笔账。</figcaption>
</figure>

第三层值得多说一句：Anthropic 在《Code execution with MCP》里给出的方案是把 MCP server 呈现为**代码 API 文件树**，让 agent 写代码去调用——工具定义按需读取，中间数据（比如 5 万 token 的会议记录）在沙箱内直接流转，不再两次经过模型上下文，示例任务从 150K token 降到 2K。金句是 "Models are great at navigating filesystems"。但原文同样明说了代价：需要安全沙箱、资源限制和监控，这是直接工具调用没有的运维负担。

### 坑二：MCP 的信任边界

> **真实坑点 ⑨：工具描述本身就是攻击面。** Invariant Labs 演示过三类真实攻击：**Tool Poisoning**——恶意指令藏在工具的 docstring 里（用户看不见，模型看得见），一个被投毒的 `add(a, b, sidenote)` 计算器在描述里要求模型读取 `~/.ssh/id_rsa` 塞进 `sidenote` 参数，在 Cursor 中实测外泄成功；**Rug Pull**——MCP 允许 server 事后推送工具定义变更且无需重新审批，WhatsApp MCP 的攻击演示就是第二次启动才换上恶意描述，把整个聊天历史外泄；**Toxic Agent Flows**——第一篇提过的 GitHub MCP 事故，工具本身无辜，被污染的是公共 issue 里的数据。

企业接入 MCP 的安全底线，浓缩成四条：

1. **server 白名单 + 版本锁定**——工具定义变更必须重新走审批，防 rug pull；
2. **annotations 当 UX 参考，不当安全依据**——分级和拦截在自己的执行器里做（Step 5 的三道闸）；
3. **凑不齐「致命三要素」**——私有数据访问、不可信内容暴露、对外通信通道，三者去其一（Simon Willison 的 lethal trifecta，第七篇展开）；
4. **最小权限**——给 agent 的凭证只开它任务所需的最小范围，GitHub MCP 事故的放大器就是那个全仓库权限的 token。

### 自己写工具还是接 MCP？

决策其实很简单：

- **核心业务工具（本篇的工单五件套）：自己写。** 这是你的 ACI，是需要用 eval 反复打磨的核心资产，隔一层协议只会碍事。
- **通用外设（GitHub、Slack、数据库、监控）：接成熟 MCP server**，但要按需加载、做白名单、砍掉用不上的工具（Block 团队的经验："Most teams end up keeping 10 to 15 percent of what they started with."——最后留下的通常只有开始时的 10–15%）。
- **判断标准只有一个**：这个工具需不需要为你的业务场景做 ACI 级打磨？需要，就必须 own 它。

## 十、小结：工具设计自查清单

把全篇压缩成一张上线前的 checklist，每条都有本文对应的实证：

1. 单轮可用工具 **< 20 个**，职责零重叠（OpenAI；GitHub Copilot 40→13 反升 2–5%）
2. 面向工作流合并，一次 JOIN 替代五轮往返（Anthropic consolidate）
3. 每个描述 **≥ 3–4 句**，通过 intern test（官方文档「最重要的单一因素」）
4. 参数：单位进名字、enum 锁状态、已知值代码注入、结构防呆优于文字告诫（poka-yoke）
5. 返回语义化名称，**杜绝裸 UUID**（显著减少幻觉）
6. 提供 `response_format` 详略开关（206 vs 72 tokens）
7. 大结果：截断 + 分页 + 引导语；空结果显式确认（SWE-agent 50 条上限）
8. 错误三段式：出了什么错 + 期望什么 + 正确示例；最多给一两个修复建议
9. 写操作三道闸：执行器侧风险分级、dry-run 预览 + 人工审批、**代码生成的幂等键**
10. MCP：按需加载、白名单锁版本、annotations 不当安全依据、最小权限

下一篇进入很多人觉得最「玄」、实则最值钱的一层——**上下文工程**：为什么 token 越多模型越笨（context rot 的实测曲线）、KV-cache 如何决定你 90% 的账单、压缩与记忆的工程实现，以及 Manus「重写四次框架」换来的全部经验。

## 参考资料

- Anthropic, [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- Anthropic, [Building Effective Agents — Appendix 2: Prompt engineering your tools](https://www.anthropic.com/engineering/building-effective-agents)
- Anthropic, [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)（2025-11）
- Anthropic, [Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)
- Claude Docs, [Define tools / Handle tool calls](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/define-tools)
- Yang et al., [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793)（NeurIPS 2024）
- Yao et al. (Sierra), [τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains](https://arxiv.org/abs/2406.12045)（ICLR 2025）
- Sierra, [τ²-bench](https://arxiv.org/abs/2506.07982)
- OpenAI, [Function calling — Best practices](https://platform.openai.com/docs/guides/function-calling)
- Model Context Protocol, [Tools 规范与 ToolAnnotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[Security Best Practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)
- Invariant Labs, [Tool Poisoning Attacks](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks)、[GitHub MCP Vulnerability](https://invariantlabs.ai/blog/mcp-github-vulnerability)
- Simon Willison, [The Lethal Trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
- Airbyte, [Designing Idempotent Write Operations for Business Agents](https://airbyte.com/blog/designing-idempotent-write-operations)
- Unblocked, [GitHub MCP token cost 实测](https://getunblocked.com/blog/github-mcp-token-cost/)
- Manus, [Context Engineering for AI Agents](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
