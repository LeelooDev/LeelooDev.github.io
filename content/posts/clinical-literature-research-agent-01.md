---
title: 从零构建临床文献智能研究 Agent（一）：架构设计与环境搭建
date: 2026-06-04
category: code
tags: [AI, LangGraph, FastAPI, React, 医学影像]
cover: /images/cover-forest-river.jpg
coverAlt: 秋日森林与河流的鸟瞰
excerpt: 从需求分析、技术选型到环境搭建，带你一步步构建一个能够自动检索、评估和综合生物医学文献的多智能体 AI 应用。
dek: 本系列将完整记录一个基于多智能体架构的临床文献研究系统的开发过程。第一篇先把地基打好：架构、选型与前后端环境。
---

> 本系列文章将完整记录一个基于多智能体架构的临床文献研究系统的开发过程，从需求分析、技术选型到最终实现，带你一步步构建一个能够自动检索、评估和综合生物医学文献的 AI 应用。

## 为什么要做这个项目？

在临床医学领域，医生和研究者经常面临这样的困境：面对一个复杂的临床问题，需要从 PubMed 上数百万篇文献中找到相关的高质量证据。手动检索、筛选和综合这些文献，往往需要花费数小时甚至数天的时间。

**临床文献智能研究 Agent**（Clinical Literature Research Agent）正是为了解决这个痛点而生。它是一个多智能体协同系统，能够：

-   **自动拆解复杂临床问题**：将一个宏观的临床问题拆解为 2-5 个可检索的子问题
-   **并行检索 PubMed 文献**：多个检索代理同时工作，大幅提升检索效率
-   **智能评估证据质量**：基于研究设计、发表时间等维度为每篇文献打分，划分证据等级
-   **生成结构化综述**：自动综合所有文献，生成带引用的证据摘要
-   **支持中英双语**：输入中文问题，输出中文报告；输入英文，输出英文

举个例子，你可以问它："SGLT2 抑制剂治疗射血分数保留型心衰的最新证据是什么？"，系统会自动完成检索、评估和综合，最终返回一份结构化的证据报告。

## 系统架构概览

整个系统由四个核心模块组成：

| 模块       | 技术栈                                      | 职责                    |
| ---------- | ------------------------------------------- | ----------------------- |
| 前端       | React 19 + TypeScript + Tailwind CSS + Vite | 用户交互与实时结果展示  |
| 后端       | FastAPI + Python 3.13                       | API 服务与 SSE 流式推送 |
| 智能体编排 | LangGraph                                   | 多代理协同、并行调度    |
| 外部服务   | DeepSeek API + PubMed E-utilities           | LLM 推理 + 文献数据     |

## 技术选型说明

在动手之前，简单说明一下关键技术的选型理由：

### 为什么选 LangGraph 而不是 LangChain Agent？

LangGraph 提供了**状态图（StateGraph）** 的抽象，天然支持：

-   **并行分支**：通过 Send API 实现多个检索器并行执行
-   **状态归并**：使用 `operator.add` reducer 自动合并并行结果
-   **可视化调试**：图结构清晰，便于追踪执行流程

相比 LangChain 的 Agent 模式，LangGraph 对我们这种"确定性流程 + 并行执行"的场景更加合适。

### 为什么选 DeepSeek？

-   成本极低，适合高频调用
-   中文能力优秀，契合双语需求
-   兼容 OpenAI API 格式，接入零成本

### 为什么选 FastAPI + SSE？

-   文献检索和综合是耗时操作（通常 10-30 秒）
-   SSE 可以实时推送每个步骤的进度，而不是让用户干等
-   FastAPI 原生支持异步和流式响应

## 环境要求

开始之前，请确保你的开发机器满足以下条件：

| 工具    | 最低版本 | 说明                                   |
| ------- | -------- | -------------------------------------- |
| Python  | 3.13+    | 后端运行时                             |
| Node.js | 18+      | 前端开发                               |
| uv      | 最新版   | Python 包管理器（比 pip 快 10-100 倍） |
| Git     | 2.0+     | 版本控制                               |

### 外部服务账号

你还需要准备以下 API 密钥：

1.  **DeepSeek API Key**（必需）：前往 [DeepSeek 开放平台](https://platform.deepseek.com/) 注册并获取
2.  **NCBI API Key**（可选）：前往 [NCBI](https://www.ncbi.nlm.nih.gov/account/) 注册获取，可提升 PubMed API 调用频率限制

## 第一步：安装基础工具

### 安装 Python 3.13+

**macOS（推荐使用 Homebrew）：**

```
brew install python@3.13
```

**验证安装：**

```
python3 --version
# 输出类似：Python 3.13.x
```

### 安装 Node.js 18+

**macOS：**

```
brew install node
```

**或者使用 nvm 管理多版本：**

```
nvm install 18
nvm use 18
```

**验证安装：**

```
node --version
# 输出类似：v18.x.x 或更高
```

### 安装 uv（Python 包管理器）

[uv](https://github.com/astral-sh/uv) 是 Rust 编写的 Python 包管理器，速度远超 pip，并且支持项目级虚拟环境管理。

```
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# 或通过 Homebrew
brew install uv
```

**验证安装：**

```
uv --version
```

## 第二步：初始化项目结构

```
# 创建项目根目录
mkdir Clinical-Literature-Research-Agent
cd Clinical-Literature-Research-Agent
git init
```

我们采用前后端分离的 monorepo 结构：

```
Clinical-Literature-Research-Agent/
├── backend/           # Python 后端
│   ├── api/           # FastAPI HTTP 层
│   ├── src/           # 业务逻辑层
│   │   ├── agents/    # 4 个智能体节点
│   │   └── tools/     # 工具集成（PubMed）
│   └── tests/         # 测试
├── frontend/          # React 前端
│   └── src/
│       ├── components/  # UI 组件
│       └── hooks/       # 自定义 Hooks
└── docs/              # 文档
```

## 第三步：搭建后端环境

### 初始化 Python 项目

```
cd backend
uv init
```

### 安装核心依赖

编辑 `pyproject.toml`，添加项目依赖：

```
[project]
name = "clinical-literature-agent"
version = "0.1.0"
description = "Multi-agent system for clinical literature research"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.135.1",
    "httpx>=0.28.1",
    "langchain>=1.2.12",
    "langchain-openai>=1.1.11",
    "langgraph>=1.1.2",
    "pydantic>=2.12.5",
    "pydantic-settings>=2.13.1",
    "python-dotenv>=1.2.2",
    "uvicorn>=0.41.0",
]

[dependency-groups]
dev = [
    "pytest>=9.0.2",
    "pytest-asyncio>=1.3.0",
    "pytest-httpx>=0.36.0",
]
```

安装所有依赖：

```
uv sync
```

`uv sync` 会自动创建虚拟环境（`.venv/`），安装所有依赖并生成 `uv.lock` 锁定文件。

### 配置环境变量

创建 `.env.example` 模板：

```
cat > .env.example << 'EOF'
# LLM Configuration
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# PubMed Configuration (Optional)
NCBI_API_KEY=
NCBI_EMAIL=

# Vector Database (Reserved for future)
QDRANT_HOST=localhost
QDRANT_PORT=6333
EOF
```

然后复制一份作为你的本地配置：

```
cp .env.example .env
# 编辑 .env，填入你的真实 API Key
```

> **隐私提醒**：`.env` 文件包含敏感信息，务必添加到 `.gitignore` 中，**绝对不要**提交到 Git 仓库。

### 配置 .gitignore

```
cat > .gitignore << 'EOF'
# Environment
.env
.env.local
.env.*.local

# Python
__pycache__/
*.py[cod]
.venv/
*.egg-info/

# IDE
.vscode/
.idea/

# OS
.DS_Store
EOF
```

### 验证后端环境

创建一个最小化的 FastAPI 应用来验证环境：

```
mkdir -p api
```

在 `api/main.py` 中写入：

```
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Clinical Literature Research Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
```

启动测试：

```
uv run uvicorn api.main:app --reload --port 8000
```

访问 `http://localhost:8000/api/health`，看到 `{"status":"healthy"}` 表示后端环境搭建成功。

## 第四步：搭建前端环境

### 使用 Vite 初始化 React 项目

```
cd ../frontend
npm create vite@latest . -- --template react-ts
```

### 安装依赖

```
npm install react-markdown
npm install -D tailwindcss @tailwindcss/vite
```

### 配置 Vite

编辑 `vite.config.ts`，配置 Tailwind CSS 插件和 API 代理：

```
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        headers: {
          // 移除 accept-encoding 以防止压缩缓冲影响 SSE 流
          'accept-encoding': 'identity',
        },
      },
    },
  },
})
```

这里有一个关键配置：**API 代理**。前端开发服务器运行在 3000 端口，通过代理将 `/api` 请求转发到后端的 8000 端口，避免跨域问题。同时移除 `accept-encoding` 头，防止压缩缓冲干扰 SSE 事件流的实时推送。

### 引入 Tailwind CSS

在 `src/index.css` 顶部添加：

```
@import "tailwindcss";
```

### 验证前端环境

```
npm run dev
```

浏览器访问 `http://localhost:3000`，看到 Vite + React 的默认页面即表示前端环境就绪。

## 第五步：验证完整链路

让我们做一个端到端的简单测试，确认前后端能正常通信。

**1. 启动后端**（终端 1）：

```
cd backend
uv run uvicorn api.main:app --reload --port 8000
```

**2. 启动前端**（终端 2）：

```
cd frontend
npm run dev
```

**3. 测试 API 代理**：

打开浏览器访问 `http://localhost:3000`，然后在浏览器控制台中执行：

```
fetch('/api/health').then(r => r.json()).then(console.log)
// 预期输出：{status: "healthy"}
```

如果看到健康检查响应，说明前后端已经打通，环境搭建完成。

## 项目配置管理

在正式进入开发之前，我们先建立一个配置管理类，这会贯穿整个项目。

创建 `backend/src/config.py`：

```
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # LLM 配置
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    # PubMed 配置
    ncbi_api_key: str = ""
    ncbi_email: str = ""
    pubmed_max_results: int = 20
    pubmed_retry_max: int = 3
    pubmed_min_date: str = "2020/01/01"

    # 向量数据库（预留）
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_collection: str = "clinical_guidelines"
    embedding_model: str = "all-MiniLM-L6-v2"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
```

使用 `pydantic-settings` 的好处是：

-   **类型安全**：每个配置项都有明确的类型
-   **自动加载**：从 `.env` 文件和环境变量自动读取
-   **默认值**：未设置的配置项使用合理的默认值
-   **验证**：启动时自动校验配置格式

## 隐私与安全注意事项

在开发此类项目时，以下隐私保护措施至关重要：

1.  **API 密钥保护**：所有 API 密钥通过 `.env` 管理，**严禁**硬编码在代码中或提交到版本控制
2.  **.gitignore 配置**：确保 `.env`、`.env.local` 等敏感文件已被忽略
3.  **PubMed 数据**：我们仅检索公开发表的文献摘要，不涉及患者数据
4.  **无用户数据存储**：系统不存储用户的查询历史或个人信息
5.  **医学免责声明**：系统输出自动附带免责声明，明确表示仅供参考，不构成医疗建议

## 小结

在这篇文章中，我们完成了：

-   明确了项目的目标和价值——自动化临床文献检索与证据综合
-   梳理了系统架构——前后端分离 + 多智能体协同
-   说明了关键技术选型的理由
-   搭建了 Python 后端环境（FastAPI + uv）
-   搭建了 React 前端环境（Vite + TypeScript + Tailwind CSS）
-   验证了前后端通信链路
-   建立了配置管理和隐私保护机制

**下一篇预告**：我们将深入后端核心，实现 LangGraph 多智能体状态图编排，包括 AgentState 的设计和四个智能体节点的基本框架。
