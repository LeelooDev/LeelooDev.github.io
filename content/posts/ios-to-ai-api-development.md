---
title: 从 iOS 开发转到 AI API 开发
date: 2026-06-26T12:00:00
category: code
tags: [iOS, AI API, Python, FastAPI, LLM]
cover: /images/ios-to-ai-api-cover.jpg
coverAlt: 城市天际线与江面倒影，远处高楼在阴天中延伸
excerpt: 给 iOS 开发者的一条 AI API 入门路线：从 Python 基础、FastAPI / Flask、HTTP API 和 JSON Schema 讲到 OpenAI、DeepSeek、Anthropic 的调用方式，再落到 Streaming、Function Calling 与 Structured Outputs。
dek: 这不是一篇「背几个 prompt」的文章，而是把 iOS 工程师熟悉的 Codable、URLSession、状态机和接口契约，迁移到 AI API 后端开发里。
---

> 这篇文章写给已经会做 iOS、但刚开始转向 AI API 开发的人。目标不是让你一天变成算法工程师，而是让你能独立写出一个可靠的 AI 后端：会收请求、会调模型、会流式返回、会让模型调用工具、会把输出约束成前端敢消费的结构化 JSON。

## 一、先把误会拆掉：AI API 开发不是「会写 prompt」

很多 iOS 开发者第一次接触 AI 开发，会以为核心能力是 prompt。这个理解只对了一小半。

如果只是自己用 ChatGPT 写文案，prompt 的确重要；但只要你要把 AI 能力放进 App、管理后台、企业工作流，真正的主战场马上变成后端工程：

- **不是只写一个好 prompt**，而是设计稳定的 HTTP API，把用户输入变成明确任务。
- **不是只调一次模型接口**，而是处理鉴权、超时、重试、限流、错误码和日志。
- **不是只让模型返回 JSON**，而是用 JSON Schema / Pydantic 约束输出，失败时能重试或降级。
- **不是只做一个聊天框**，而是支持 Streaming，让用户看到边生成边返回。
- **不是让模型自己「查一下资料」**，而是用 Function Calling 暴露工具，由你的代码执行真实查询。
- **不是换个更强模型就结束**，而是做 provider adapter，不把业务绑死在某一家 SDK 上。

iOS 开发者其实有天然优势。你已经理解接口契约、状态机、异步回调、缓存、错误处理和用户体验。AI API 开发只是把这些能力从客户端搬到服务端，并额外学会一件事：**模型不是普通函数，它会生成概率性结果，所以边界必须用代码钉死。**

<figure class="diagram">
<svg viewBox="0 0 820 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="iOS 开发者转向 AI API 开发的能力迁移图">
<defs>
<marker id="ios-ai-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8b9099"/></marker>
</defs>
<text x="410" y="32" text-anchor="middle" font-size="15" font-weight="700" fill="#25262b">从 iOS 到 AI API：不是转行，是把工程边界往后端移动</text>
<rect x="42" y="68" width="210" height="240" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="147" y="98" text-anchor="middle" font-size="14" fill="#25262b" font-weight="700">你已经会的 iOS 能力</text>
<g font-size="12" fill="#25262b">
<text x="70" y="135">Swift / 类型系统</text>
<text x="70" y="170">Codable / JSON 解码</text>
<text x="70" y="205">URLSession / async await</text>
<text x="70" y="240">ViewModel / 状态管理</text>
<text x="70" y="275">错误提示 / Loading 体验</text>
</g>
<g stroke="#d6d8de" stroke-width="1">
<line x1="70" y1="148" x2="224" y2="148"/>
<line x1="70" y1="183" x2="224" y2="183"/>
<line x1="70" y1="218" x2="224" y2="218"/>
<line x1="70" y1="253" x2="224" y2="253"/>
</g>
<rect x="305" y="68" width="210" height="240" rx="12" fill="#25262b"/>
<text x="410" y="98" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="700">要补上的后端能力</text>
<g font-size="12" fill="#f4f5f7">
<text x="333" y="135">Python / 虚拟环境 / 依赖</text>
<text x="333" y="170">FastAPI / Flask 路由</text>
<text x="333" y="205">Pydantic / JSON Schema</text>
<text x="333" y="240">SSE Streaming / 后端代理</text>
<text x="333" y="275">Provider Adapter / 工具执行</text>
</g>
<g stroke="#5f646d" stroke-width="1">
<line x1="333" y1="148" x2="488" y2="148"/>
<line x1="333" y1="183" x2="488" y2="183"/>
<line x1="333" y1="218" x2="488" y2="218"/>
<line x1="333" y1="253" x2="488" y2="253"/>
</g>
<rect x="568" y="68" width="210" height="240" rx="12" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="673" y="98" text-anchor="middle" font-size="14" fill="#25262b" font-weight="700">最终产物</text>
<g font-size="12" fill="#25262b">
<text x="596" y="135">一个稳定的 AI API 服务</text>
<text x="596" y="170">App 只请求你的后端</text>
<text x="596" y="205">模型密钥不进客户端</text>
<text x="596" y="240">输出结构前端可预测</text>
<text x="596" y="275">可替换 OpenAI / DeepSeek / Anthropic</text>
</g>
<g stroke="#d6d8de" stroke-width="1">
<line x1="596" y1="148" x2="750" y2="148"/>
<line x1="596" y1="183" x2="750" y2="183"/>
<line x1="596" y1="218" x2="750" y2="218"/>
<line x1="596" y1="253" x2="750" y2="253"/>
</g>
<line x1="252" y1="188" x2="302" y2="188" stroke="#8b9099" stroke-width="1.6" marker-end="url(#ios-ai-arrow)"/>
<line x1="515" y1="188" x2="565" y2="188" stroke="#8b9099" stroke-width="1.6" marker-end="url(#ios-ai-arrow)"/>
<text x="410" y="342" text-anchor="middle" font-size="12" fill="#6b6e76">核心转变：客户端不再直连模型；后端变成安全边界、协议边界和输出契约边界。</text>
</svg>
<figcaption>图 1：iOS 转 AI API 的关键，不是抛掉过去经验，而是把「接口契约 + 异步状态 + 错误处理」搬到服务端。</figcaption>
</figure>

## 二、学习路线：先能跑，再可靠，最后可替换

不要一上来就学 LangChain、RAG、Agent 框架。小白最容易死在「概念太多、手里没有可运行系统」。更稳的路线是四层：

1. **Python 基础**：能写函数、字典、异常处理、类型标注、虚拟环境。
2. **Web API 基础**：用 FastAPI 或 Flask 暴露接口，理解 HTTP 方法、状态码、JSON 请求和响应。
3. **模型 API 基础**：分别会调 OpenAI、DeepSeek、Anthropic，知道三家的共同点和差异。
4. **AI 特有能力**：Streaming、Function Calling、Structured Outputs。

这一层一层往上学，才不会把所有问题都混在一起。你调不通接口时，能判断是 Python 包没装、HTTP 参数错、模型服务报错，还是 JSON Schema 写错。

## 三、Python 基础：给 iOS 开发者的最小够用版

你不需要先把 Python 语言大全学完。做 AI API 后端，最常用的是这些：

- `struct User: Codable` 对应 `class User(BaseModel)` 或 `@dataclass`。
- `URLSession.shared.data(for:)` 对应 `httpx.AsyncClient()` 或 SDK 调用。
- `Result<T, Error>` 对应 `try/except` 加明确错误响应。
- `async/await` 仍然存在，只是写成 Python 的 `async def` / `await`。
- `Bundle.main` / 配置文件对应 `.env` / 环境变量。
- `ViewModel` 管状态，对应 service 层 / provider adapter 管业务状态。

先建一个最小环境：

```bash
mkdir ios-ai-api-lab
cd ios-ai-api-lab
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn pydantic openai anthropic python-dotenv
```

然后写一点你马上会用到的 Python：

```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class ChatTask:
    user_id: str
    message: str
    mode: Literal["chat", "summary", "extract"] = "chat"

def build_prompt(task: ChatTask) -> str:
    if task.mode == "summary":
        return f"请总结下面内容：\n{task.message}"
    if task.mode == "extract":
        return f"请从下面内容提取结构化信息：\n{task.message}"
    return task.message

try:
    task = ChatTask(user_id="u_001", message="Swift 的 async/await 怎么理解？")
    print(build_prompt(task))
except Exception as exc:
    print(f"ERROR: {exc}")
```

这里的重点不是语法，而是后端思维：**输入先变成明确的数据结构，再进入模型调用**。不要让一段随手拼接的字符串在系统里到处传。

## 四、FastAPI / Flask：为什么新项目优先 FastAPI

Flask 很轻，适合快速写一个简单 HTTP 服务；FastAPI 对小白更友好，因为它天然拥抱类型标注、Pydantic 和 OpenAPI 文档。AI API 开发里，输入输出契约非常重要，所以我建议新项目先用 FastAPI。

一个最小 FastAPI 服务：

```python
# main.py
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="iOS AI API")

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    provider: str = Field(default="openai", pattern="^(openai|deepseek|anthropic)$")

class ChatResponse(BaseModel):
    answer: str
    provider: str

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    return ChatResponse(
        answer=f"收到：{req.message}",
        provider=req.provider,
    )
```

运行：

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

打开 `http://127.0.0.1:8000/docs`，你会看到自动生成的接口文档。这件事对 iOS 开发非常重要：它等于后端自动给你一份可测试的接口说明，和 Swift 里的 `Codable` 模型可以一一对应。

同样的接口用 Flask 也能写：

```python
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.post("/chat")
def chat():
    data = request.get_json()
    message = data.get("message", "")
    return jsonify({"answer": f"收到：{message}", "provider": "flask"})
```

Flask 的优势是简单直接；FastAPI 的优势是类型、校验和文档更强。做 AI API，我更看重后者。

## 五、HTTP API：App 不该直连模型厂商

iOS App 可以直接请求 OpenAI、DeepSeek 或 Anthropic 吗？技术上可以，工程上不该。

原因有四个：

1. **密钥不能进客户端**：App 包可以被逆向，模型 API key 一旦泄漏就可能产生真实账单。
2. **业务策略要在后端**：不同用户、不同套餐、不同功能，应该走不同模型、token 上限和风控策略。
3. **错误要统一**：OpenAI、DeepSeek、Anthropic 的错误格式不同，App 不应该理解三套错误协议。
4. **输出要稳定**：模型返回不稳定，后端必须先校验，再给前端一个稳定 JSON。

一个更健康的链路应该是这样：

<figure class="diagram">
<svg viewBox="0 0 840 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AI API 服务请求生命周期图">
<defs>
<marker id="api-flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8b9099"/></marker>
</defs>
<text x="420" y="30" text-anchor="middle" font-size="15" font-weight="700" fill="#25262b">一个靠谱 AI API 的请求生命周期</text>
<rect x="42" y="82" width="135" height="64" rx="10" fill="#25262b"/>
<text x="109.5" y="108" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700">iOS App</text>
<text x="109.5" y="128" text-anchor="middle" font-size="11" fill="#d6d8de">URLSession / SSE</text>
<rect x="226" y="82" width="135" height="64" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="293.5" y="108" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">FastAPI</text>
<text x="293.5" y="128" text-anchor="middle" font-size="11" fill="#6b6e76">鉴权 / 校验</text>
<rect x="410" y="82" width="135" height="64" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="477.5" y="108" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">Provider Adapter</text>
<text x="477.5" y="128" text-anchor="middle" font-size="11" fill="#6b6e76">OpenAI / DeepSeek / Anthropic</text>
<rect x="594" y="82" width="135" height="64" rx="10" fill="#25262b"/>
<text x="661.5" y="108" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700">LLM API</text>
<text x="661.5" y="128" text-anchor="middle" font-size="11" fill="#d6d8de">生成 / 工具调用</text>
<g stroke="#8b9099" stroke-width="1.6" marker-end="url(#api-flow-arrow)">
<line x1="177" y1="114" x2="223" y2="114"/>
<line x1="361" y1="114" x2="407" y2="114"/>
<line x1="545" y1="114" x2="591" y2="114"/>
</g>
<rect x="226" y="214" width="135" height="64" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="293.5" y="240" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">JSON Schema</text>
<text x="293.5" y="260" text-anchor="middle" font-size="11" fill="#6b6e76">输入 / 输出契约</text>
<rect x="410" y="214" width="135" height="64" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="477.5" y="240" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">Tool Executor</text>
<text x="477.5" y="260" text-anchor="middle" font-size="11" fill="#6b6e76">查库 / 调内部系统</text>
<rect x="594" y="214" width="135" height="64" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<text x="661.5" y="240" text-anchor="middle" font-size="13" fill="#25262b" font-weight="700">Observability</text>
<text x="661.5" y="260" text-anchor="middle" font-size="11" fill="#6b6e76">日志 / 成本 / trace</text>
<g stroke="#8b9099" stroke-width="1.4" fill="none" marker-end="url(#api-flow-arrow)">
<path d="M 293.5 146 L 293.5 211"/>
<path d="M 477.5 146 L 477.5 211"/>
<path d="M 661.5 146 L 661.5 211"/>
<path d="M 594 260 C 520 330 320 330 178 142"/>
</g>
<text x="356" y="356" text-anchor="middle" font-size="12" fill="#6b6e76">后端不是转发器。它是安全边界、模型抽象层、结构化输出校验器和成本控制点。</text>
</svg>
<figcaption>图 2：App 只和你的后端说话。模型厂商、工具执行、输出校验和成本控制都留在服务端。</figcaption>
</figure>

## 六、JSON Schema：把「希望模型返回 JSON」变成契约

iOS 开发者理解 JSON Schema 很容易：它就是跨语言版的 `Codable` 契约。

比如你希望模型从用户输入里提取一个任务：

```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "priority": { "type": "string", "enum": ["low", "medium", "high"] },
    "due_date": { "type": ["string", "null"], "description": "ISO 8601 日期，未知则为 null" }
  },
  "required": ["title", "priority", "due_date"],
  "additionalProperties": false
}
```

对应 Swift 里就是：

```swift
struct TaskDraft: Decodable {
    enum Priority: String, Decodable {
        case low, medium, high
    }

    let title: String
    let priority: Priority
    let dueDate: String?
}
```

区别在于：Swift 的 `Decodable` 只能在客户端解码时发现错误；JSON Schema 可以在模型生成阶段就参与约束，后端也可以据此做二次校验。AI API 开发里，结构化输出不是锦上添花，而是前端能不能放心接入的前提。

## 七、OpenAI / DeepSeek / Anthropic：先学共同层，再看差异

三家 API 的概念基本相同：

- 输入：系统指令 + 用户消息 + 可选工具 + 可选输出 schema
- 输出：文本、结构化结果、工具调用、流式事件
- 风险：超时、限流、上下文超长、内容安全拒答、schema 不匹配

差异主要在 SDK、参数名和工具调用事件格式。实际工程里，不要让业务代码到处直接调用三家 SDK，应该包一层 adapter。

### OpenAI：Responses API

OpenAI 当前主线是 Responses API，适合统一处理文本、工具调用、结构化输出和流式响应。

```python
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

response = client.responses.create(
    model=os.getenv("OPENAI_MODEL", "gpt-5.5"),
    input=[
        {
            "role": "system",
            "content": "你是一个给 iOS 开发者讲后端的老师，回答要具体。"
        },
        {
            "role": "user",
            "content": "用 URLSession 类比解释 FastAPI 是什么。"
        },
    ],
)

print(response.output_text)
```

### DeepSeek：OpenAI 兼容调用

DeepSeek 提供 OpenAI 兼容接口，所以很多时候可以继续使用 OpenAI SDK，只换 `base_url`、key 和模型名。

```python
import os
from openai import OpenAI

deepseek = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",
)

resp = deepseek.chat.completions.create(
    model=os.getenv("DEEPSEEK_MODEL", "deepseek-v4-pro"),
    messages=[
        {"role": "system", "content": "你是严谨的 API 教练。"},
        {"role": "user", "content": "解释 JSON Schema 为什么比纯 prompt 更可靠。"},
    ],
)

print(resp.choices[0].message.content)
```

### Anthropic：Messages API

Anthropic 的 Messages API 在工具使用、长上下文和流式事件上有自己的事件格式。它不是 OpenAI 兼容接口，建议单独封装 adapter。

```python
import os
from anthropic import Anthropic

anthropic = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

message = anthropic.messages.create(
    model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    max_tokens=800,
    system="你是一个后端导师，专门辅导 iOS 开发者转 AI API。",
    messages=[
        {"role": "user", "content": "用 Codable 类比解释 Structured Outputs。"}
    ],
)

print(message.content[0].text)
```

这一节的真正结论是：**不要先迷信某一家模型。先把业务层写成自己的接口，再在底下接不同 provider。**

## 八、给业务写一个 provider adapter

一个简单的 adapter 可以这样起步：

```python
from abc import ABC, abstractmethod
from pydantic import BaseModel

class ModelRequest(BaseModel):
    system: str
    user: str
    temperature: float = 0.2

class ModelResponse(BaseModel):
    text: str
    provider: str
    model: str

class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, req: ModelRequest) -> ModelResponse:
        raise NotImplementedError
```

业务代码只依赖 `LLMProvider`，不要依赖 `OpenAI()` 或 `Anthropic()`。这样未来你要做模型路由、A/B 测试、备用模型降级，才不会把整个项目拆掉。

一个 OpenAI adapter：

```python
import os
from openai import AsyncOpenAI

class OpenAIProvider(LLMProvider):
    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        self.model = os.getenv("OPENAI_MODEL", "gpt-5.5")

    async def complete(self, req: ModelRequest) -> ModelResponse:
        resp = await self.client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": req.system},
                {"role": "user", "content": req.user},
            ],
            temperature=req.temperature,
        )
        return ModelResponse(
            text=resp.output_text,
            provider="openai",
            model=self.model,
        )
```

刚开始可以只实现 OpenAI；等你跑通 `/chat`、`/chat/stream`、`/extract` 后，再补 DeepSeek 和 Anthropic。不要第一天就做大而全抽象。

## 九、Streaming：从「等十秒」变成「马上有反馈」

AI 应用和普通接口最大的体验差异是延迟。普通接口 300ms 没回来，用户就觉得慢；模型生成可能要几秒甚至几十秒。如果后端等模型完整生成后再返回，App 体验会很差。

解决方式是 Streaming。Web 里常用 Server-Sent Events（SSE）：后端一边收到模型增量，一边把文本片段推给客户端。

FastAPI 里可以这样写：

```python
import json
import os
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

app = FastAPI()
client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

class StreamRequest(BaseModel):
    message: str

async def sse_event(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

@app.post("/chat/stream")
async def chat_stream(req: StreamRequest):
    async def generate():
        async with client.responses.stream(
            model=os.getenv("OPENAI_MODEL", "gpt-5.5"),
            input=req.message,
        ) as stream:
            async for event in stream:
                if event.type == "response.output_text.delta":
                    yield await sse_event({"type": "delta", "text": event.delta})
                elif event.type == "response.completed":
                    yield await sse_event({"type": "done"})

    return StreamingResponse(generate(), media_type="text/event-stream")
```

iOS 端可以用 `URLSession.bytes(for:)` 读取流：

```swift
struct StreamPayload: Encodable {
    let message: String
}

var request = URLRequest(url: URL(string: "http://127.0.0.1:8000/chat/stream")!)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.httpBody = try JSONEncoder().encode(
    StreamPayload(message: "用 3 句话解释 FastAPI")
)

let (bytes, _) = try await URLSession.shared.bytes(for: request)

for try await line in bytes.lines {
    guard line.hasPrefix("data: ") else { continue }
    let jsonText = String(line.dropFirst(6))
    // 解码 {"type":"delta","text":"..."}，追加到界面
}
```

流式输出有三个真实坑：

1. **不要在客户端直连模型流**：密钥泄漏、供应商事件格式变化、风控都不好处理。
2. **每个事件要有类型**：`delta`、`done`、`error` 分清楚，App 才能正确结束 loading。
3. **服务端也要有超时**：用户断开连接后要停止模型请求，不能让后台继续烧 token。

## 十、Function Calling：模型决定「要调用什么」，代码负责「真的执行」

Function Calling 经常被误解成「模型会执行函数」。不是。

真实流程是：

1. 你把可用工具的名称、描述、参数 schema 发给模型；
2. 模型返回一个 tool call，里面有工具名和 JSON 参数；
3. 你的后端校验参数，并执行真实函数；
4. 把工具结果作为下一条消息发回模型；
5. 模型基于工具结果生成最终回答。

这和 iOS 里的 delegate 有点像：模型提出「我想调用这个能力」，真正的执行权仍然在你的代码手里。

```python
import json
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

TOOLS = [
    {
        "type": "function",
        "name": "get_order_status",
        "description": "查询用户订单状态。只能查询当前登录用户自己的订单。",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "订单 ID，例如 order_123"
                }
            },
            "required": ["order_id"],
            "additionalProperties": False,
        },
    }
]

def get_order_status(order_id: str) -> str:
    fake_db = {
        "order_123": "已付款，预计明天发货",
        "order_456": "已取消",
    }
    return fake_db.get(order_id, "未找到该订单")

def answer_with_tool(user_text: str) -> str:
    response = client.responses.create(
        model=os.getenv("OPENAI_MODEL", "gpt-5.5"),
        input=user_text,
        tools=TOOLS,
    )

    tool_outputs = []
    for item in response.output:
        if item.type == "function_call" and item.name == "get_order_status":
            args = json.loads(item.arguments)
            result = get_order_status(order_id=args["order_id"])
            tool_outputs.append({
                "type": "function_call_output",
                "call_id": item.call_id,
                "output": result,
            })

    if not tool_outputs:
        return response.output_text

    final = client.responses.create(
        model=os.getenv("OPENAI_MODEL", "gpt-5.5"),
        previous_response_id=response.id,
        input=tool_outputs,
    )
    return final.output_text
```

Function Calling 的工程规则比代码更重要：

- 工具名要像 API 名，不要像自然语言句子：`get_order_status` 比 `help_user_find_things` 好。
- 参数 schema 要窄：能用 enum 就不要让模型自由写字符串。
- 工具结果要短：不要把整张表、整篇文档塞回上下文。
- 写操作必须审批：退款、删除、发邮件、发通知这类操作不要让模型一步直接执行。
- 错误要回给模型：`ORDER_NOT_FOUND` 比抛异常崩掉更有用，模型可以解释或换路径。

## 十一、Structured Outputs：让 App 收到可预测结果

如果你的 App 要显示一个列表、表单、报告卡片，就不要让模型返回一段自然语言再让前端猜。让模型直接返回结构化对象。

用 Pydantic 定义输出：

```python
from typing import Literal
from pydantic import BaseModel, Field

class StudyPlanItem(BaseModel):
    title: str
    minutes: int = Field(ge=5, le=120)
    level: Literal["beginner", "intermediate", "advanced"]

class StudyPlan(BaseModel):
    goal: str
    items: list[StudyPlanItem]
```

OpenAI 支持用结构化输出让结果贴合 schema：

```python
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

plan = client.responses.parse(
    model=os.getenv("OPENAI_MODEL", "gpt-5.5"),
    input="我会 iOS，想 7 天入门 AI API 开发，请给学习计划。",
    text_format=StudyPlan,
)

study_plan: StudyPlan = plan.output_parsed
print(study_plan.items[0].title)
```

Anthropic 也提供结构化输出能力，可以让响应匹配 Pydantic 模型：

```python
import os
from anthropic import Anthropic

client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

message = client.messages.parse(
    model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    max_tokens=1200,
    system="输出必须符合给定结构，不要额外解释。",
    messages=[
        {"role": "user", "content": "给 iOS 开发者设计 7 天 AI API 学习计划。"}
    ],
    output_format=StudyPlan,
)

study_plan = message.output_parsed
print(study_plan.goal)
```

DeepSeek 提供 JSON 输出能力，适合让模型返回合法 JSON；你仍然应该在后端用 Pydantic 再校验一次：

```python
import json
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",
)

resp = client.chat.completions.create(
    model=os.getenv("DEEPSEEK_MODEL", "deepseek-v4-pro"),
    messages=[
        {"role": "system", "content": "你只返回合法 JSON，不要 Markdown。"},
        {"role": "user", "content": "给 iOS 开发者设计 3 个 AI API 练习任务。"},
    ],
    response_format={"type": "json_object"},
)

raw = resp.choices[0].message.content
data = json.loads(raw)
```

Structured Outputs 的核心价值不是「看起来整齐」，而是让前后端协作恢复到你熟悉的状态：**有字段、有类型、有错误、有回归测试。**

## 十二、一个从零练手项目：AI 学习助手 API

学这些知识最好的方式，是做一个能被 iOS App 调用的小后端。功能不要大，路线要完整。

### 目标接口

```text
POST /chat
POST /chat/stream
POST /extract/task
POST /tool/order-status
GET  /health
```

### 目录结构

```text
ios-ai-api-lab/
  app/
    main.py
    schemas.py
    providers/
      base.py
      openai_provider.py
      deepseek_provider.py
      anthropic_provider.py
    services/
      chat_service.py
      extract_service.py
      tool_service.py
  .env
  requirements.txt
```

### `schemas.py`

```python
from typing import Literal
from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    provider: Literal["openai", "deepseek", "anthropic"] = "openai"
    stream: bool = False

class ChatResponse(BaseModel):
    answer: str
    provider: str
    model: str

class ExtractTaskRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)

class ExtractedTask(BaseModel):
    title: str
    priority: Literal["low", "medium", "high"]
    due_date: str | None
```

### `main.py`

```python
from fastapi import FastAPI, HTTPException
from app.schemas import ChatRequest, ChatResponse, ExtractTaskRequest, ExtractedTask
from app.services.chat_service import complete_chat
from app.services.extract_service import extract_task

app = FastAPI(title="iOS AI API Lab")

@app.get("/health")
async def health():
    return {"ok": True}

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        return await complete_chat(req)
    except TimeoutError:
        raise HTTPException(status_code=504, detail="模型请求超时")

@app.post("/extract/task", response_model=ExtractedTask)
async def extract(req: ExtractTaskRequest):
    return await extract_task(req.text)
```

把这个项目写完，你就不是「看过 AI API 文档」了，而是真的跨过了第一道门槛：你有一个 App 可以调用的 AI 后端。

## 十三、真实坑点：小白最容易踩的十个坑

### 1. 把 API key 放进 iOS App

这是红线。模型密钥只允许在服务端环境变量里。App 只能拿你自己后端签发的用户 token。

### 2. 直接把用户输入拼进 system prompt

`system` 是规则层，`user` 是数据层。不要把用户内容拼到 system 里，否则容易让用户覆盖你的规则。

### 3. 不设置长度和预算

每个接口都应该有输入长度上限、输出 token 上限、超时和并发限制。否则一个长输入就能把成本和延迟拉爆。

### 4. 只在 prompt 里说「请返回 JSON」

这只是愿望，不是契约。能用 Structured Outputs 就用；不能用时，也要用 JSON mode + Pydantic 校验。

### 5. 把 provider 错误原样丢给前端

三家错误格式不同，前端不应该处理这些差异。后端统一成自己的错误码，例如 `MODEL_TIMEOUT`、`RATE_LIMITED`、`SCHEMA_INVALID`。

### 6. Streaming 没有结束事件

只发文本片段、不发 `done`，客户端会不知道什么时候停 loading。每条流都要有明确终止事件。

### 7. Function Calling 工具太宽

工具越像「万能搜索」，模型越容易乱用。工具应该小、清晰、参数窄、结果短。

### 8. 忽略日志里的隐私

用户输入可能包含姓名、手机号、病历、订单、公司资料。日志里不要完整记录敏感内容，至少做脱敏。

### 9. 没有回归样例

AI 接口也需要测试。保存 20 条典型输入和期望输出结构，每次换模型或改 prompt 都跑一遍。

### 10. 第一版就做 Agent

先把单次调用、结构化输出、流式输出做好。Agent 是多步系统，复杂度会成倍增加，不是入门第一站。

## 十四、七天学习计划

如果你是 iOS 开发者，可以按这个顺序练：

1. **第 1 天：Python 基础、虚拟环境、环境变量。** 产物是能运行一个 Python 脚本并读取 `.env`。
2. **第 2 天：FastAPI 路由、Pydantic 校验。** 产物是 `/health`、`/chat` 两个接口。
3. **第 3 天：OpenAI / DeepSeek / Anthropic 基础调用。** 产物是三个 provider 都能返回文本。
4. **第 4 天：Provider adapter。** 产物是业务代码不直接依赖 SDK。
5. **第 5 天：Streaming。** 产物是 `/chat/stream` 能被 iOS 端逐行消费。
6. **第 6 天：Structured Outputs。** 产物是 `/extract/task` 返回稳定 JSON。
7. **第 7 天：Function Calling。** 产物是模型能查询一个本地订单或知识库工具。

不要跳过前四天。AI API 开发的难点不是「某个 SDK 怎么写」，而是你能不能把普通后端工程打牢。

## 十五、本篇小结

从 iOS 转 AI API 开发，真正要建立的是这几个判断：

1. **AI API 后端不是模型转发器。** 它负责安全、契约、成本、错误和可替换性。
2. **Python 只要先学够用子集。** 函数、类型、异常、虚拟环境、Pydantic、async/await，足够你起步。
3. **FastAPI 更适合作为第一站。** 它把类型、校验和接口文档连接在一起，和 iOS 的模型层思维很接近。
4. **JSON Schema 是前后端协作边界。** Structured Outputs 让模型输出重新变成可测试、可解码、可演进的 API。
5. **Streaming、Function Calling、Structured Outputs 是 AI API 的三件套。** 前者解决体验，第二个连接真实世界，第三个保证前端能消费。

学完这一篇，不要急着做「全自动 Agent」。先做一个小而完整的 AI API 服务，让 iOS App 能安全地调用它、流式展示它、稳定解码它。这个基础打牢之后，RAG、Agent、工作流编排才有意义。

## 参考资料

- FastAPI, [Request Body](https://fastapi.tiangolo.com/tutorial/body/) 与 [Response Model](https://fastapi.tiangolo.com/tutorial/response-model/)
- Flask, [Quickstart: APIs with JSON](https://flask.palletsprojects.com/en/stable/quickstart/#apis-with-json)
- OpenAI, [Responses API](https://platform.openai.com/docs/api-reference/responses), [Streaming responses](https://platform.openai.com/docs/guides/streaming-responses), [Function calling](https://platform.openai.com/docs/guides/function-calling), [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- DeepSeek, [API Docs](https://api-docs.deepseek.com/), [Function Calling](https://api-docs.deepseek.com/guides/function_calling), [JSON Output](https://api-docs.deepseek.com/guides/json_mode)
- Anthropic, [Messages API](https://docs.anthropic.com/en/api/messages), [Tool use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview), [Streaming Messages](https://docs.anthropic.com/en/docs/build-with-claude/streaming), [Structured Outputs](https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs)
