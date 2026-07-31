---
title: AI 放疗勾画工作台设计笔记
date: 2026-07-30
group: 医学影像
groupOrder: 3
noteOrder: 3
cover: /images/note-rt-contouring-workbench-cover.jpg
coverAlt: AI 辅助放疗勾画与医学影像复核工作台
---

这是一套六份文档的设计资料集（编号 RTC-00 到 RTC-05），从产品方案、需求、系统设计、前端指南，到部署合规与竞品分析。这里把它整理成一篇笔记，按「为什么做、做成什么样、边界在哪」的顺序展开。

整套资料只围绕一句话展开，可以先记住它：

> **AI 提建议，医生审阅、修正、做最终决定；系统只让过程更快、更清楚、可追溯，永不替医生拍板。剂量计算与计划优化交还 TPS。**

这句话是产品红线。它同时是三件事：产品定位、差异化卖点、合规策略。任何功能设计与它冲突，以它为准。

## 放疗勾画是个什么活

放疗和手术、化疗并列为三大肿瘤治疗手段，覆盖近 95% 的癌症类型、约 50% 的癌症患者。治疗前，医生要在定位 CT 上逐层画出两类结构：

- **靶区**（GTV / CTV / PTV）：要照射的肿瘤区域及其外扩范围。
- **危及器官**（OAR，Organ At Risk）：要保护、要控制受量的正常器官，比如脊髓、肺、心脏。

画得准不准，直接决定剂量往哪里落，进而决定疗效和副作用。这是放疗计划的第一道工序，也是最耗人力的一道。

痛点很集中：

- **极度耗时**。一个病人治疗前要拍 300 到 400 张定位 CT，医生逐层手画。放疗医生每天约一半工作时间花在勾画上。
- **人才稀缺**。放疗医师和物理师严重不足，不少基层医院设备装了，因为缺人用不起来。
- **一致性差**。勾画高度依赖个人经验，不同医生、不同中心对同一结构画出来差异明显。
- **自适应放疗把矛盾放大**。在线自适应放疗（oART）要求病人躺在治疗床上时当场重新勾画、重新做计划，时间以分钟计，手工勾画根本来不及。

## 为什么是现在

**设备在铺开，软件需求跟着来。** 按 WHO 标准中国约需 11000 台医用直线加速器，2022 年底保有量约 3000 台，每百万人口约 1.5 台，低于 WHO 的 2 到 4 台标准。「十四五」规划新增加速器近 994 台（增幅约 46.5%），MR 定位机增幅达 351.7%。每多一台加速器，背后就是一套勾画、计划、复核软件的需求。

**政策强制国产化。** 2021 年财政部与工信部联合发文，明确三维放射治疗计划系统（TPS）、肿瘤信息系统、图像引导加速器系统要求 100% 国产化，直线加速器要求 75%。进口放疗软件在采购上必须让位。

**赛道空旷。** 与诊断侧 AI（肺结节、眼底、心血管）扎堆不同，放疗勾画玩家很少，且大多算法优先、编辑与复核体验偏弱。

市场侧：国内肿瘤放疗市场从 2016 年的 272 亿元增长到 2021 年的 517 亿元，年复合约 13.7%。

## 竞争格局与我们的位置

| 层次 | 代表 | 优势 | 可乘之机 |
|------|------|------|----------|
| 勾画专业玩家 | 连心、柏视、视见、商汤 SenseCare | 算法成熟、有临床数据、部分持证 | 围绕算法配界面，编辑与复核体验弱，模型封闭 |
| 进口 TPS / 勾画 | Varian、Elekta、RayStation、MIM | 全流程成熟、临床认可 | 贵、封闭、桌面为主，政策强制国产替代 |
| 开源模型 | TotalSegmentator、MONAI、nnU-Net | 免费、精度不差 | 只有模型，没有临床工作流与编辑产品 |
| 设备厂自带 | 联影 uRT、大医 | 与自家加速器绑定，装机即用 | 绑死自家生态，不开放、不中立 |

结论是一句话：**不做又一个勾画算法，做模型中立的「勾画修正 + 复核驾驶舱」工作台。** 护城河放在编辑与复核界面上，而不是模型精度上。

## 一次勾画是怎么跑完的

<figure class="diagram">
<svg viewBox="0 0 800 336" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="放疗勾画端到端流程图：从定位 CT 取影像、请求 AI 建议、编排网关调用外接模型推理、产出勾画建议、医师修正与电子签名审定，到导出 RTStruct 交接 TPS">
<defs>
<marker id="rtc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="30" y="40" width="155" height="46" rx="9"/>
<rect x="225" y="40" width="155" height="46" rx="9"/>
<rect x="615" y="40" width="155" height="46" rx="9"/>
<rect x="615" y="150" width="155" height="46" rx="9"/>
<rect x="225" y="150" width="155" height="46" rx="9"/>
<rect x="225" y="260" width="155" height="46" rx="9"/>
<rect x="420" y="260" width="155" height="46" rx="9"/>
</g>
<g fill="#ffffff" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 4">
<rect x="420" y="150" width="155" height="46" rx="9"/>
<rect x="615" y="260" width="155" height="46" rx="9"/>
</g>
<g fill="#25262b">
<rect x="420" y="40" width="155" height="46" rx="9"/>
<rect x="30" y="150" width="155" height="46" rx="9"/>
<rect x="30" y="260" width="155" height="46" rx="9"/>
</g>
<g text-anchor="middle" font-size="12.5" fill="#25262b">
<text x="107" y="61">定位 CT / CBCT / MR</text>
<text x="302" y="61">PACS 放疗影像库</text>
<text x="692" y="61">后台鉴权 + 留痕</text>
<text x="692" y="173">勾画编排网关</text>
<text x="497" y="173">外接模型 GPU 推理</text>
<text x="302" y="173">产出勾画建议 SEG</text>
<text x="302" y="281">SEG → RTStruct</text>
<text x="497" y="281">推送 TPS / 回写 PACS</text>
<text x="692" y="281">TPS 剂量与计划</text>
</g>
<g text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">
<text x="497" y="61">医师点「取 AI 建议」</text>
<text x="107" y="173">医师三维笔刷修正</text>
<text x="107" y="281">医师电子签名审定</text>
</g>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="107" y="77">模拟定位 / 加速器</text>
<text x="302" y="77">DICOMweb</text>
<text x="692" y="77">事件 AI_SUGGEST</text>
<text x="692" y="189">模型中立，只出建议</text>
<text x="497" y="189">连心 / 柏视 / 开源 / 自研</text>
<text x="302" y="189">标注「待医师审定」</text>
<text x="302" y="297">TG-263 命名映射</text>
<text x="497" y="297">审定后才允许</text>
<text x="692" y="297">外部系统，我方不碰</text>
</g>
<g text-anchor="middle" font-size="10.5" fill="#ffffff" opacity="0.72">
<text x="497" y="77">选模型与结构集</text>
<text x="107" y="189">每次修改留痕 EDIT</text>
<text x="107" y="297">事件 SIGN_OFF</text>
</g>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#rtc-arrow)" fill="none">
<line x1="185" y1="63" x2="223" y2="63"/>
<line x1="380" y1="63" x2="418" y2="63"/>
<line x1="575" y1="63" x2="613" y2="63"/>
<line x1="692" y1="86" x2="692" y2="148"/>
<line x1="615" y1="173" x2="577" y2="173"/>
<line x1="420" y1="173" x2="382" y2="173"/>
<line x1="225" y1="173" x2="187" y2="173"/>
<line x1="107" y1="196" x2="107" y2="258"/>
<line x1="185" y1="283" x2="223" y2="283"/>
<line x1="380" y1="283" x2="418" y2="283"/>
<line x1="575" y1="283" x2="613" y2="283"/>
</g>
<text x="30" y="24" font-size="11" fill="#6b6e76">深色块 = 医师亲自动手的环节，虚线块 = 外部系统</text>
</svg>
<figcaption>一次常规勾画的端到端流程</figcaption>
</figure>

技术选型：前端 OHIF v3 扩展；业务后台 Spring Boot 或 ASP.NET Core；编排网关 FastAPI；数据库 PostgreSQL；缓存与队列 Redis 或 RabbitMQ；影像走 DICOMweb；AI 建议用 DICOM SEG；交接给 TPS 用 DICOM-RT RTStruct。

有几个设计取舍值得单独记：

**前端不直连网关，也不直连 TPS。** 所有请求经业务后台，后台负责鉴权、代理、留痕。这样责任链有唯一入口，不会有绕过留痕的路径。

**编排网关模型中立。** 每家模型（连心、柏视、开源引擎、医院自研）各写一个适配器，归一到同一个接口。新增一个模型只需要写适配器 + 注册表加一条记录 + 配结构集，前端与流程零改动。

**「建议」这件事写进数据结构。** 创建任务的响应里有一个恒为 `suggestion` 的字段，取回的每个结构都带 `origin: "ai"` 和 `status: "suggested"`：

```json
{
  "taskId": "rtc-20260712-3f9a",
  "status": "QUEUED",
  "kind": "suggestion"
}
```

红线不能只写在文案里，要写在字段里，让越权的用法在数据层就说不通。

模型注册表里还有一个字段值得注意 —— `contains_target`，标记该模型是否涉及靶区。这个布尔值直接关联注册路径，后面讲合规时会用到：

```sql
CREATE TABLE rt_model (
  model           VARCHAR(64) PRIMARY KEY,
  display_name    VARCHAR(128) NOT NULL,
  vendor          VARCHAR(64),          -- 外部厂商标识，用于责任归属
  modality        JSONB NOT NULL,       -- ["CT","CBCT","MR"]
  structure_set   JSONB NOT NULL,
  contains_target BOOLEAN NOT NULL DEFAULT false, -- 是否含靶区，影响注册边界
  default_version VARCHAR(32),
  status          VARCHAR(16) NOT NULL DEFAULT 'DISABLED'
);
```

## 状态机与责任链

责任链是整个产品的合规核心，也是最硬的差异化。它回答的是一个法律问题：**这次勾画到底是谁做的决定。**

<figure class="diagram">
<svg viewBox="0 0 800 286" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="勾画状态机与责任链事件图：AI 建议、编辑中、已审定、已导出四个状态及弃用分支，下方为四类审计事件">
<defs>
<marker id="rtc2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<path d="M 300 50 V 26 H 110 V 48" stroke="#9a9da6" stroke-width="1.3" stroke-dasharray="4 4" fill="none" marker-end="url(#rtc2-arrow)"/>
<text x="205" y="20" text-anchor="middle" font-size="10.5" fill="#6b6e76">放弃修改，重新取建议</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="40" y="50" width="140" height="40" rx="9"/>
<rect x="610" y="50" width="140" height="40" rx="9"/>
<rect x="40" y="124" width="140" height="34" rx="8" stroke-dasharray="5 4"/>
</g>
<g fill="#25262b">
<rect x="230" y="50" width="140" height="40" rx="9"/>
<rect x="420" y="50" width="140" height="40" rx="9"/>
</g>
<g text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12">
<text x="110" y="75" fill="#25262b">AI_SUGGESTED</text>
<text x="680" y="75" fill="#25262b">EXPORTED</text>
<text x="110" y="146" fill="#6b6e76">DISCARDED</text>
<text x="300" y="75" fill="#ffffff">EDITING</text>
<text x="490" y="75" fill="#ffffff">SIGNED_OFF</text>
</g>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="110" y="108">系统生成，待审阅</text>
<text x="300" y="108">医师正在修正</text>
<text x="490" y="108">医师电子签名</text>
<text x="680" y="108">系统导出交接</text>
</g>
<text x="194" y="145" font-size="10.5" fill="#6b6e76">医师弃用建议，从零手勾</text>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#rtc2-arrow)">
<line x1="180" y1="70" x2="228" y2="70"/>
<line x1="370" y1="70" x2="418" y2="70"/>
<line x1="560" y1="70" x2="608" y2="70"/>
<line x1="110" y1="90" x2="110" y2="122"/>
</g>
<text x="400" y="184" text-anchor="middle" font-size="11.5" fill="#25262b">每一次迁移都追加写入责任链，只增不改，长期留存</text>
<rect x="40" y="198" width="710" height="62" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<g stroke="#d6d8de" stroke-width="1">
<line x1="217" y1="198" x2="217" y2="260"/>
<line x1="395" y1="198" x2="395" y2="260"/>
<line x1="572" y1="198" x2="572" y2="260"/>
</g>
<g text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11.5" fill="#25262b">
<text x="128" y="222">AI_SUGGEST</text>
<text x="306" y="222">EDIT</text>
<text x="483" y="222">SIGN_OFF</text>
<text x="661" y="222">EXPORT</text>
</g>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="128" y="243">哪个模型、哪个版本</text>
<text x="306" y="243">谁、何时、改了哪个结构</text>
<text x="483" y="243">审定人 + 签名 + 时间戳</text>
<text x="661" y="243">导出记录与交接目标</text>
</g>
</svg>
<figcaption>勾画状态机与四类责任链事件</figcaption>
</figure>

关键约束只有一条但很硬：**只有 `SIGNED_OFF` 之后才能进入 `EXPORTED`。** 未审定的导出一律标注「草稿 / 未审定」，界面和文件里都要标。

审计表设计成追加写、不可篡改、定期归档到独立存储，保留期与放疗病历一致（建议 ≥ 10 年，以医院规定为准）：

```sql
CREATE TABLE rt_contour_audit (
  id            BIGSERIAL PRIMARY KEY,
  case_id       VARCHAR(64) NOT NULL,
  series_uid    VARCHAR(128) NOT NULL,
  structure     VARCHAR(64) NOT NULL,
  -- 事件类型：AI_SUGGEST / EDIT / SIGN_OFF / DISCARD / EXPORT
  event_type    VARCHAR(24) NOT NULL,
  origin        VARCHAR(8),             -- ai / human
  model         VARCHAR(64),            -- 若来自 AI，记录模型与版本
  model_version VARCHAR(32),
  user_id       VARCHAR(64),
  detail        JSONB,                  -- 修改摘要：结构、层面、体积变化
  signature     VARCHAR(256),           -- 审定签名，SIGN_OFF 事件专用
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

这样任意一次审定都能完整还原：AI 建议来自哪个厂商的哪个模型版本 → 医师逐次改了什么 → 谁在什么时候签的字。

监管逻辑上，这套留痕对应的是「AI 仅辅助，最终判定由岗位责任人负责」。系统的价值是让「人的决定」可证明、可追溯、可辩护。

## 前端：在 OHIF 上怎么做

以自定义 Extension + Mode 接入，**不 fork OHIF 核心**，这样能跟着上游版本升级。复用 OHIF 的分割渲染扩展（`@ohif/extension-cornerstone-dicom-seg`）和三维能力，在上面叠放疗需要的编辑、审定、复核界面。

```
extensions/rt-contouring/
├── src/
│   ├── index.tsx                 # 注册 command / panel / toolbar / mode
│   ├── api/backendClient.ts      # 调后台：建议 / 任务 / 审定 / 导出
│   ├── ws/taskSocket.ts          # 任务状态推送
│   ├── panels/
│   │   ├── StructurePanel.tsx    # 结构列表：显隐、改色、状态
│   │   ├── ReviewPanel.tsx       # 复核驾驶舱：多版本并排 + 剂量只读
│   │   └── SignOffPanel.tsx      # 审定与电子签名
│   ├── tools/
│   │   ├── brush3d.ts            # 三维笔刷
│   │   ├── interpolate.ts        # 层间插值
│   │   └── snap.ts               # 边界吸附
│   └── utils/
│       ├── loadSuggestion.ts     # 加载 AI 建议 SEG
│       └── exportRTStruct.ts     # 触发后台导出
```

加载建议时，务必在元数据里把来源和状态标死，界面据此显示醒目的「建议」标识（虚线边界或角标），不能和已审定的结构长得一样：

```ts
segmentationService.setSegmentationMeta(segDS.SeriesInstanceUID, {
  origin: 'ai',
  status: 'suggested',
  banner: 'AI 建议，待医师审定',
})
```

编辑器的三件核心工具，都是为了把「改 AI 的图」这件事做快：

- **三维笔刷**：增 / 擦、可调半径、轴位冠状矢状三视图联动。每次落笔是一次可撤销操作，保存时汇总成一条 EDIT 留痕。
- **层间插值**：医师勾几个关键层，中间层自动插值。注意插值结果同样标为「待审定」，不自动成为最终值。
- **边界吸附**：在梯度明显的器官边缘把笔刷路径吸到边界上，省掉描边。它是辅助手段，医师可以随时关掉。

**复核驾驶舱**是 oART 场景的关键，四联呈现：今日影像 | 原计划勾画 | AI 新建议 | 历史分次。叠加形变差异高亮，侧栏放从 TPS 只读拉来的 DVH 和关键剂量指标。

这里有个反复强调的措辞纪律：**差异高亮只回答「哪里不一样」，不回答「哪个对」。** 所有一致性检查的输出都是「提示」，文案要避开「合格 / 不合格 / 正确 / 错误」这类判定性表述。这不是文字游戏，判定性表述会把产品推向更高的注册风险类别。

前端还要处理几种降级：AI 建议不可用时提示「可手工勾画」，不阻断流程；建议与影像几何不对齐直接拦截，不允许错误建议进入编辑；剂量拉取失败时驾驶舱降级为无剂量呈现，提示去 TPS 侧查看。

## 私有化部署

四条部署原则：数据不出院、只辅助不决策、责任可追溯、模型解耦。

最小部署两台机器就能跑：一台应用节点（前端 + 后台 + 数据库 + 影像网关），一台 GPU 节点（编排网关 + 外接勾画模型）。生产环境按需拆分横向扩展，GPU 节点独立，数据库不与推理混布。

<figure class="diagram">
<svg viewBox="0 0 800 322" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="私有化部署网络分区图：接入区、业务区、数据区、影像区、AI 区、推理区与放疗区，全部位于医院内网无外网连接">
<defs>
<marker id="rtc3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<rect x="16" y="40" width="768" height="268" rx="14" fill="none" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="7 5"/>
<text x="400" y="30" text-anchor="middle" font-size="12" fill="#25262b" font-weight="600">医院内网 · 全链路无外网连接</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="44" y="76" width="196" height="48" rx="9"/>
<rect x="302" y="76" width="196" height="48" rx="9"/>
<rect x="560" y="76" width="196" height="48" rx="9"/>
<rect x="44" y="176" width="196" height="48" rx="9"/>
<rect x="302" y="176" width="196" height="48" rx="9"/>
</g>
<g fill="#ffffff" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 4">
<rect x="560" y="176" width="196" height="48" rx="9"/>
<rect x="44" y="252" width="196" height="44" rx="9"/>
</g>
<g text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">
<text x="142" y="97">接入区</text>
<text x="400" y="97">业务区</text>
<text x="658" y="97">数据区</text>
<text x="142" y="197">影像区</text>
<text x="400" y="197">AI 区</text>
<text x="658" y="197">推理区</text>
<text x="142" y="271">放疗区</text>
</g>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="142" y="114">Nginx + OHIF 工作台</text>
<text x="400" y="114">Backend 认证 · 留痕 · 审计</text>
<text x="658" y="114">PostgreSQL + Redis</text>
<text x="142" y="214">PACS / Orthanc</text>
<text x="400" y="214">勾画编排网关</text>
<text x="658" y="214">GPU + 外接模型</text>
<text x="142" y="288">TPS（医院既有系统）</text>
</g>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#rtc3-arrow)">
<line x1="240" y1="100" x2="300" y2="100"/>
<line x1="498" y1="100" x2="558" y2="100"/>
<line x1="142" y1="124" x2="142" y2="174"/>
<line x1="400" y1="124" x2="400" y2="174"/>
<line x1="498" y1="200" x2="558" y2="200"/>
</g>
<path d="M 302 112 H 270 V 274 H 242" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#rtc3-arrow)"/>
<g font-size="10.5" fill="#6b6e76">
<text x="270" y="94" text-anchor="middle">HTTPS</text>
<text x="528" y="94" text-anchor="middle">加密连接</text>
<text x="150" y="152">DICOMweb</text>
<text x="408" y="152">Service Token</text>
<text x="528" y="194" text-anchor="middle">mTLS</text>
<text x="262" y="240" text-anchor="end">DICOM-RT · RTStruct</text>
<text x="658" y="242" text-anchor="middle">不对工作站开放端口</text>
</g>
</svg>
<figcaption>网络分区：推理区与数据区不允许从接入区直达</figcaption>
</figure>

安全要点：

- 全链路 HTTPS / WSS，走内部 CA 证书；后台与网关、网关与模型之间用 Service Token 或 mTLS。
- 用户认证对接医院统一身份（LDAP / OAuth2 / CAS）。RBAC 要把**勾画权限和审定权限分开** —— 能改不等于能签字。
- 患者影像的临时缓存放加密卷，任务结束即清理。
- 禁止任何组件把影像或患者信息写到外网可达的位置。
- 参照等保 2.0 三级做基线加固，符合《个人信息保护法》对患者数据的处理要求。

## 注册与合规的那条线

这部分是方向判断，不是结论 —— 具体分类和收费要由放疗器械注册与医保顾问按确切功能边界最终确认。

NMPA 的监管逻辑里有一条清晰的分界：

- 只做图像常规处理（三维重建、拼接、基本测量）或流程辅助、**不输出诊断结论**的软件，一般归第二类。
- 用于病变识别、病变诊断、治疗决策辅助，**输出结果直接影响诊疗方案**的软件，风险高，几乎全按第三类管理。目前已获批的 AI 医用软件注册证里，绝大多数是三类。

映射到这个产品上：

| 能力 | 距离「病变识别」的位置 | 注册负担 |
|------|---------------------|----------|
| 正常器官（OAR）勾画 | 更接近图像处理与流程辅助 | 相对轻 |
| 靶区（GTV / CTV）勾画 | 靠近病变识别 | 明显加重，更可能落三类 |
| 剂量计算与计划判定 | 直接决定诊疗方案 | 最高，**主动不做** |

于是合规策略就很清楚了：一期以正常器官勾画 + 编辑 + 复核呈现 + 责任留痕为主，控制在较轻的注册路径；靶区勾画作为独立能力、独立评估、分期开放；全线坚持「建议 / 呈现」而不是「判定 / 结论」的输出定性；模型为外接，明确「建议来自外部持证或备案的模型」，把责任主体厘清。

**主动不碰剂量，是把最重的监管挡在门外。** 这也是为什么红线里那句「剂量交还 TPS」不是妥协，而是设计。

## 边界：做什么，不做什么

该做：

- 勾画修正编辑器（三维笔刷、层间插值、边界吸附、健患对比）
- 模型中立的勾画编排（外接任意勾画 AI，只取建议）
- 复核驾驶舱（今日解剖 vs 原计划、AI 建议、历史分次、TPS 剂量呈现）
- 提示式一致性检查（漏勾、差异、几何异常，仅提请注意）
- 责任链留痕（AI 建议 → 医师修改 → 审定签名的全链路记录）
- RTStruct 输出与 TPS 交接

必须交还：

- 剂量计算与计划优化 → 留在 TPS
- 「计划是否合格」的判定 → 医师结合 TPS 判断，系统只呈现
- 勾画正确与否的最终认定 → 医师审定，系统只提示

## 路线图与几个关键指标

| 阶段 | 目标 | 交付 |
|------|------|------|
| 一期 | 常规放疗勾画工作台 | 编辑器 + 单一外接模型 + RTStruct 输出 + 责任留痕 |
| 二期 | 模型中立编排 + 质控提示 | 多模型编排 + 一致性提示 + 审计报表 |
| 三期 | oART 复核驾驶舱 | 今日 / 原计划 / 历史对比 + 剂量呈现 + 分钟级复核 |
| 四期 | 多中心与科研 | 一致性分析、模板库、科研数据导出 |

非功能指标里几个关键项：AI 建议返回 < 120 秒（胸腹部危及器官，标准分辨率）；编辑器三维交互 ≥ 30 fps；复核驾驶舱首屏 < 5 秒；RTStruct 导出与 TPS 读取成功率 ≥ 99.9%；责任链日志保留 ≥ 10 年。

一期就要锁定一个放疗中心做临床共创 —— 这是入场券，不是可选项。

## 记下来的几个判断

- 这个赛道的护城河在**编辑与复核界面**，不在模型精度。算法公司的软肋恰好是查看器公司的强项。
- 红线不是限制，是产品设计。「只辅助、人拍板、剂量交 TPS」同时解决了定位、卖点和合规三个问题。
- 卖点不是「勾得快」，是「更快做出、并且能证明是医生自己做出的决定」。卖的是合规与可辩护性。
- 红线要落到字段、状态机和审计表里。写在文案里的红线，工程上守不住。

还有几个开放项没定：后台技术栈（Spring Boot 还是 ASP.NET Core）、首个临床共创中心与目标癌种、一期是否只做正常器官勾画、对接哪家 TPS（Varian / Elekta / 联影 / 大医）、以及注册分类与收费路径 —— 最后这一项必须由专业顾问按确切功能边界定，不能自己拍。
