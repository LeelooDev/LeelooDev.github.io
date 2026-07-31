---
title: 医学影像智能分割研究
date: 2026-07-30
category: code
tags: [医学影像, 图像分割, SAM, ONNX Runtime, WebGPU, 浏览器端推理]
cover: /images/medical-image-segmentation-research-cover.jpg
coverAlt: 医学影像智能分割研究工作台
excerpt: 把 SAM 的 ONNX 版本整个放进浏览器，用 WebGPU 跑完编码-解码全流程，影像不出工作站。这篇按论文体例拆解它的三级缓存层次、窗宽窗位敏感的缓存键，以及一个能回答「AI 辅助到底有没有更快」的交互经济性模型——接受率阈值约 9.8%。
---

> 本文按 IEEE TMI / Medical Image Analysis 的原创研究论文体例撰写：Abstract、Index Terms、编号章节、图表编号、参考文献表齐备。研究对象是一套已落地的浏览器端医学影像智能分割系统，讨论的是它的架构、代价模型与工程边界。

**Abstract**—交互式深度分割正在从「模型精度竞赛」转向「人机协同效率工程」，但主流方案仍把推理放在服务端，代价是影像必须离开工作站、部署必须配 GPU 机房、离线场景直接失效。本文提出并实现了一套**双通路可提示分割架构**：以 Segment Anything Model（SAM）的 ONNX 导出版本为核心，在浏览器内通过 WebGPU/WASM 完成编码-解码全流程推理，同时保留一条可选的院内 GPU 通路承接 nnInteractive、MedSAM2、VoxTell 等重型三维模型。我们给出三项具体贡献：(i) 一个**三级缓存层次**（内存 Map / OPFS / Cache API）及其容量分析，指出图像嵌入的存储代价是源切片的 8 倍，并据此提出配额与淘汰策略；(ii) 一个**窗宽窗位敏感的缓存键**设计，纠正了「以 SOPInstanceUID 为唯一键」在医学影像下的语义错误——同一解剖在不同窗位下经 8-bit 重采样后进入编码器的是不同图像，复用嵌入会产生静默的错误分割；(iii) 一个**交互经济性模型**，把「AI 辅助是否真的更快」化归为可解析的接受率阈值 `p* = (t_v + t_r) / (t_r + t_m − t_a)`，在典型器官勾画参数下 `p* ≈ 9.8%`，并给出加速比随接受率变化的闭式解。系统级基准显示：WebGPU 下编码 1–3 s/帧、解码 50–200 ms/次，模型二次加载 < 1 s，常驻内存增量约 250–300 MB。我们进一步论证了双会话预编码如何在接受率 ≥ 0.8 时完全隐藏编码延迟，并讨论了 2D 基础模型做 3D 传播时的误差累积、概率阈值的非对称代价，以及在「AI 提建议、医师做决定」前提下责任链的最小可验证设计。

**Index Terms**—医学影像分割，可提示分割，Segment Anything Model，浏览器端推理，ONNX Runtime，WebGPU，人机协同，DICOM SEG，放射治疗勾画，缓存层次，可追溯性。

## I. 引言

医学影像分割是把体素划归到解剖或病理类别的过程，是定量影像、手术规划与放射治疗计划的共同前置工序。在放疗场景里，这道工序的成本尤其刺眼：一例患者的定位 CT 通常有 300–400 层，医师需要逐层勾出靶区（GTV/CTV/PTV）与危及器官（OAR），而放疗医师每天约有一半工作时间消耗在这件事上 [17], [18]。自适应放疗（oART）把矛盾推到极致——患者躺在治疗床上，重新勾画与重新计划必须在分钟量级完成，手工路径在物理上就来不及。

过去十年，全自动分割的精度问题被 U-Net [7] 及其自配置后继 nnU-Net [3] 大体解决，TotalSegmentator [4] 进一步把 CT 上 100 余个结构的自动勾画变成了开箱即用的能力。但临床落地并没有随精度同步推进，原因有三：第一，全自动模型的失败是**沉默的**——它不会告诉你哪一层错了；第二，结构集是**封闭的**——训练时没有的结构，推理时也不会有；第三，责任是**悬空的**——放疗计划最终要由岗位责任人签字，而一个黑箱输出无法承担这个签字。

于是重心转向**可提示分割**（promptable segmentation）：模型不再独自决定边界，而是接受点、框、涂鸦、文本等提示，把「分割哪个东西」的决定权交还给人。SAM [1] 用 1100 万图像、11 亿掩码把这一范式做成了通用基础模型；MedSAM [2] 与 MedSAM2、nnInteractive [6] 把它迁移到医学与三维体数据上。这条路线天然契合临床：医师点一下就是一次决定，模型的每一次输出都是一次**可被当场否决的建议**。

然而，几乎所有可提示分割的工程实现都默认了**服务端推理**：影像上传、GPU 推理、掩码回传。这个默认值带来三重摩擦。其一是**数据治理**——影像离开工作站就进入了另一个安全域，医院信息科需要为此单独走审批；其二是**部署成本**——一台 GPU 服务器加一套容器编排，对基层医院是实打实的门槛，而中国「十四五」新增的近千台加速器背后，恰恰大量是基层单位；其三是**可用性**——内网隔离、网络抖动、GPU 排队，任何一项都会让「实时交互」退化成「等待」。

本文的立足点是：**把可提示分割的常规通路整体搬进浏览器**，只在需要三维推理与文本提示时才落到院内 GPU。这不是把服务端方案做一次前端移植，因为浏览器是一个受约束严格得多的执行环境——没有 CUDA、内存以 GB 为单位受限、存储要走 OPFS 与 Cache API、GPU 访问必须序列化。这些约束反过来暴露出一批在服务端不会显形的设计问题，其中若干具有超出本实现的普遍性。

本文的贡献如下：

1. **双通路架构**（§III）。浏览器内 SAM 通路承担交互密集的二维可提示分割与切片传播；院内 GPU 通路承担 nnInteractive/MedSAM2/VoxTell 等三维与文本提示模型。两条通路共享同一套提示语义、同一套预览-审定状态机、同一套 DICOM SEG 产出格式，前端不感知推理位置。
2. **三级缓存及其容量分析**（§V）。我们给出图像嵌入的精确尺寸推导（4 MiB/帧），指出它是 512×512 int16 源切片的 8 倍，一个 400 层序列的全量嵌入缓存达 1.6 GiB；据此提出按 Study 配额 + LRU 淘汰的策略，而非无界持久化。
3. **窗宽窗位敏感的缓存键**（§V-C）。我们指出以 `<model>/<studyUID>/<seriesUID>/<instanceUID>` 为缓存键在医学影像下是语义错误的，因为编码器输入是窗位变换后的 8-bit RGB；给出量化后的复合键设计与写入去抖策略。
4. **交互经济性模型**（§VI-D、§X-C）。把「AI 辅助是否更快」化归为接受率阈值的闭式解，并给出加速比曲线。该模型不依赖任何特定模型的精度指标，只依赖可直接测量的交互耗时，因此可作为工具是否值得启用的现场判据。
5. **责任链的最小可验证设计**（§VIII）。给出四类审计事件与状态迁移约束，使「这次勾画由谁决定」在数据层可还原、可举证。

## II. 相关工作

### A. 从全自动到可提示

Ronneberger 等提出的 U-Net [7] 确立了编码器-解码器加跳跃连接的分割范式；Isensee 等的 nnU-Net [3] 证明了在充分的自动配置下，这一经典架构在绝大多数医学分割任务上仍是强基线。Wasserthal 等的 TotalSegmentator [4] 把这套能力工程化为覆盖 100 余结构的开源工具。这一支的共同前提是：**类别集合在训练时固定**。

交互式分割的历史更长。GrowCut [16] 用元胞自动机从种子点扩张区域，至今仍是「一键分割」类工具的实用选择，因为它不需要模型、不需要 GPU、在浏览器里就是几十毫秒的纯计算。深度交互式分割由 Xu 等 [19] 开启，DeepIGeoS [20] 把测地距离引入交互精修。Kirillov 等的 SAM [1] 是分水岭：它把「提示」提升为一等输入，并用超大规模数据把零样本泛化做到了可用水平。SAM 2 [5] 把这一能力扩展到视频（对医学而言即体数据的层间传播）；MedSAM [2] 在大规模医学数据上做了域适配；nnInteractive [6] 则把三维可提示分割与点、涂鸦、套索、框选四类提示统一起来。

### B. 推理位置：服务端、边缘与浏览器

MONAI [9] 与 MONAI Label 定义了服务端医学 AI 的事实标准接口：模型注册、会话缓存、推理端点、主动学习。OHIF-AI 这类集成项目在此之上把 nnInteractive、SAM2、MedSAM2、VoxTell、MedGemma 编排成一个统一后端，前端通过 REST 调用。这条路线的优点是模型不受限——PyTorch 生态里的任何东西都能上；缺点如 §I 所述。

浏览器端推理由 ONNX Runtime Web [13] 与 WebGPU [24] 变得现实。它的边界很清晰：模型必须能导出为 ONNX，参数量受限于可下载与可驻留内存，且所有 GPU 操作需在单一队列上串行。SAM 的 ViT-B 编码器 [14], [15] 经 FP16 量化后约 180 MB，解码器约 17 MB，恰好落在这个可行域内；ViT-L（1.22 GB）与 ViT-H（2.38 GB）则已越界。

### C. 影像查看器与标准化产出

OHIF Viewer [8] 与其底层的 Cornerstone3D 提供了 Web 端 DICOM 浏览、多平面重建、分割叠加渲染的完整基础设施。分割结果的标准化产出依赖 DICOM SEG（SOP Class `1.2.840.10008.5.1.4.1.1.66.4`）[11]，Fedorov 等 [12] 与 Bridge 等 [21] 分别从定量影像与编码实现两侧论证了它相对于 NIfTI 等研究格式的优势：SEG 携带对源序列的引用、逐帧几何、算法类型与结构语义，可直接回写 PACS 并被下游 TPS 消费。放疗侧的结构命名则需遵循 AAPM TG-263 [10]，否则跨系统交接会退化为人工映射。

### D. 评测方法学

Maier-Hein 等 [22] 与 Reinke 等 [23] 系统梳理了图像分析验证中的度量陷阱：Dice [25] 对小结构的方差极大，Hausdorff 距离 [26] 对单点离群极敏感，而这两者恰恰是分割论文最常报告的指标。对交互式系统而言还有一层特殊性：**最终产出是人机共同的结果**，单独报告模型输出的 Dice 并不能说明系统价值。这正是本文在 §VI-D 引入交互经济性模型的动机——用可直接测量的交互耗时替代难以归因的精度指标。

## III. 系统架构

### A. 设计约束

架构由四条约束反推而来：

- **C1 数据不出边界。** 常规交互路径下，像素数据不得离开浏览器进程。
- **C2 零 GPU 可用。** 没有 GPU 服务器的机构必须能完整使用常规路径。
- **C3 模型中立。** 更换或新增模型不得改动交互层与产出格式。
- **C4 建议不等于结论。** 任何模型输出在被医师显式接受前，不得进入可导出的分割数据。

C1 与 C2 直接推出浏览器端推理为默认通路；C3 要求提示语义与产出格式先于模型确定；C4 要求「预览」是一个独立于「分割数据」的一等状态，而不是先写入再撤销。

### B. 分层结构

<figure class="diagram">
<svg viewBox="0 0 800 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="系统分层架构图：交互层、编排层、双推理通路（浏览器内 ONNX 与院内 GPU）、存储与产出层，展示提示、预览、审定与 DICOM SEG 回写的完整链路">
<defs>
<marker id="seg1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<text x="24" y="22" font-size="11" fill="#6b6e76">深色块 = 医师直接操作或决定的环节；虚线块 = 可选组件，缺席时系统仍完整可用</text>
<rect x="24" y="36" width="752" height="76" rx="12" fill="none" stroke="#c4c6cd" stroke-width="1.3" stroke-dasharray="6 5"/>
<text x="36" y="54" font-size="11" fill="#6b6e76" font-weight="600">交互层 · 浏览器</text>
<g fill="#25262b">
<rect x="46" y="60" width="150" height="40" rx="9"/>
<rect x="218" y="60" width="150" height="40" rx="9"/>
<rect x="390" y="60" width="150" height="40" rx="9"/>
</g>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="562" y="60" width="192" height="40" rx="9"/>
</g>
<g text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">
<text x="121" y="78">放置提示点 / 框</text>
<text x="293" y="78">审阅预览</text>
<text x="465" y="78">Enter 接受 · Esc 否决</text>
</g>
<g text-anchor="middle" font-size="12" fill="#25262b">
<text x="658" y="78">三维笔刷手工修正</text>
</g>
<g text-anchor="middle" font-size="10" fill="#ffffff" opacity="0.72">
<text x="121" y="93">include / exclude</text>
<text x="293" y="93">半透明叠加，虚线边界</text>
<text x="465" y="93">唯一的写入闸门</text>
</g>
<text x="658" y="93" text-anchor="middle" font-size="10" fill="#6b6e76">增 / 擦 · 层间插值</text>
<rect x="24" y="128" width="752" height="70" rx="12" fill="none" stroke="#c4c6cd" stroke-width="1.3" stroke-dasharray="6 5"/>
<text x="36" y="146" font-size="11" fill="#6b6e76" font-weight="600">编排层 · 提示归一与调度</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="46" y="152" width="216" height="36" rx="9"/>
<rect x="284" y="152" width="216" height="36" rx="9"/>
<rect x="522" y="152" width="232" height="36" rx="9"/>
</g>
<g text-anchor="middle" font-size="12" fill="#25262b">
<text x="154" y="169">提示归一化</text>
<text x="392" y="169">GPU 互斥与双会话调度</text>
<text x="638" y="169">预览生命周期管理</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="154" y="183">点 / 框 / 涂鸦 / 套索 / 文本</text>
<text x="392" y="183">编码与解码不并发</text>
<text x="638" y="183">accept 前不落盘</text>
</g>
<rect x="24" y="214" width="368" height="112" rx="12" fill="none" stroke="#9a9da6" stroke-width="1.5"/>
<text x="36" y="232" font-size="11" fill="#25262b" font-weight="600">通路 A · 浏览器内推理（默认）</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="40" y="240" width="164" height="34" rx="8"/>
<rect x="216" y="240" width="164" height="34" rx="8"/>
<rect x="40" y="284" width="340" height="32" rx="8"/>
</g>
<g text-anchor="middle" font-size="11.5" fill="#25262b">
<text x="122" y="261">SAM Encoder（ViT-B）</text>
<text x="298" y="261">SAM Decoder</text>
<text x="210" y="304">ONNX Runtime Web · WebGPU / WASM</text>
</g>
<rect x="408" y="214" width="368" height="112" rx="12" fill="none" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="6 5"/>
<text x="420" y="232" font-size="11" fill="#6b6e76" font-weight="600">通路 B · 院内 GPU（可选）</text>
<g fill="#ffffff" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 4">
<rect x="424" y="240" width="164" height="34" rx="8"/>
<rect x="600" y="240" width="164" height="34" rx="8"/>
<rect x="424" y="284" width="340" height="32" rx="8"/>
</g>
<g text-anchor="middle" font-size="11.5" fill="#25262b">
<text x="506" y="261">nnInteractive · MedSAM2</text>
<text x="682" y="261">VoxTell（文本提示）</text>
<text x="594" y="304">MONAI Label · FastAPI · 会话缓存</text>
</g>
<rect x="24" y="342" width="752" height="72" rx="12" fill="none" stroke="#c4c6cd" stroke-width="1.3" stroke-dasharray="6 5"/>
<text x="36" y="360" font-size="11" fill="#6b6e76" font-weight="600">存储与产出层</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="46" y="366" width="166" height="38" rx="9"/>
<rect x="234" y="366" width="166" height="38" rx="9"/>
<rect x="422" y="366" width="166" height="38" rx="9"/>
<rect x="610" y="366" width="144" height="38" rx="9"/>
</g>
<g text-anchor="middle" font-size="11.5" fill="#25262b">
<text x="129" y="384">三级缓存</text>
<text x="317" y="384">Labelmap 分割数据</text>
<text x="505" y="384">DICOM SEG 编码</text>
<text x="682" y="384">责任链审计</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="129" y="398">Map / OPFS / Cache API</text>
<text x="317" y="398">Cornerstone3D 体素管理</text>
<text x="505" y="398">STOW-RS 回写 PACS</text>
<text x="682" y="398">仅增写，长期留存</text>
</g>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#seg1-arrow)" fill="none">
<line x1="121" y1="102" x2="121" y2="150"/>
<line x1="154" y1="190" x2="154" y2="212"/>
<line x1="500" y1="170" x2="520" y2="170"/>
<line x1="638" y1="190" x2="638" y2="212"/>
<line x1="210" y1="326" x2="210" y2="364"/>
<line x1="594" y1="326" x2="594" y2="364"/>
<path d="M 317 366 V 348 H 293 V 104"/>
</g>
</svg>
<figcaption>图 1. 双通路可提示分割系统的分层结构</figcaption>
</figure>

四层的职责边界是硬的：交互层只产生提示与决定，不做任何推理；编排层只做归一化与调度，不知道模型内部；推理层只出概率图，不写分割数据；存储与产出层只在收到显式接受信号后落盘。C4 因此不是一条口号，而是一条穿过四层的数据流约束。

### B 之补：为什么两条通路而不是一条

浏览器通路无法覆盖两类需求。**其一是原生三维推理**：SAM 是二维模型，层间一致性靠传播而非靠模型，误差沿传播方向累积（§XI-A）；nnInteractive 直接在体数据上推理，不存在这个问题。**其二是文本提示**：VoxTell 这类文本驱动模型的参数量与词表远超浏览器可承受范围。因此通路 B 不是通路 A 的性能升级版，而是**能力互补**——它们服务于不同的任务形态。

反过来，通路 B 也不能取代通路 A：一次 nnInteractive 推理需要约 6 GB 显存，一台 GPU 同时服务的并发医师数是个位数；而通路 A 的并发上限是工作站数量本身。在一家每天几十例定位 CT 的中心，把所有交互都压到一台 GPU 上，排队时间会吃掉 AI 省下的时间。

## IV. 浏览器端推理引擎

### A. SAM 的可提示结构

SAM 把分割拆成两段极不对称的计算：重型图像编码器 `E`（ViT-B，约 90 M 参数）把图像映射为嵌入张量，轻型掩码解码器 `D`（约 4 M 参数）把嵌入与提示映射为掩码。

```
I ──E──▶ z ∈ R^(1×256×64×64)
                    │
P (points/box) ──▶ ─┴──D──▶ M ∈ R^(1×4×1024×1024)
```

关键在于：**`z` 与提示无关**。医师在同一层上反复增删提示点时，只有 `D` 需要重跑。这正是浏览器端可行的根本原因——`E` 是一次性的秒级开销，`D` 是可重复的毫秒级开销，而交互密度全部落在后者。

### B. 编码通路

编码前需要把 DICOM 像素变成模型能吃的输入，这一步在医学场景里并不平凡：

```
DICOM 像素 (int16, HU)
  → 应用 Modality LUT / Rescale（HU 化）
  → 应用 VOI LUT（窗宽窗位）→ 8-bit 灰度
  → 灰度复制为 RGB 三通道
  → 重采样至 1024 × 1024（保持长宽比，短边补零）
  → NCHW float32 张量 [1, 3, 1024, 1024]
```

我们直接复用查看器的渲染管线（`loadImageToCanvas`）完成前三步，好处是**医师看到什么，模型就看到什么**；代价见 §V-C——窗位成了模型输入的一部分，缓存键必须跟着变。

输入张量的尺寸值得算清楚：`3 × 1024 × 1024 × 4 B = 12 MiB`。这是每帧编码时必然经过 GPU 上传的数据量，也解释了为什么编码耗时对显存带宽敏感。

ONNX Runtime 的会话配置需要显式关掉若干为服务端优化的特性：

```typescript
import ort from 'onnxruntime-web/webgpu'

ort.env.wasm.wasmPaths = 'ort/'   // 自托管，不走 CDN
ort.env.wasm.numThreads = 4
ort.env.wasm.proxy = false        // WebGPU 模式下 proxy 反而增加拷贝

const sessionOptions: ort.InferenceSession.SessionOptions = {
  executionProviders: ['webgpu'],  // 不可用时回落 ['wasm']
  enableMemPattern: false,         // 变长输入下内存模式预测失效
  enableCpuMemArena: false,        // 避免与 WebGPU 分配器重复持有
  extra: {
    session: {
      disable_prepacking: '1',
      use_device_allocator_for_initializers: '1',
      use_ort_model_bytes_directly: '1',      // 省一次 180 MB 的拷贝
      use_ort_model_bytes_for_initializers: '1',
    },
  },
}
```

`use_ort_model_bytes_directly` 这一项在浏览器里是必需而非可选：模型二进制从 Cache API 取出时已是 `ArrayBuffer`，若不启用该项，运行时会再复制一份 180 MB，在 4 GB 标签页内存上限下这是可观的浪费。

### C. 解码通路与提示构造

解码器的输入张量组织如下。`labels` 的取值语义是本系统提示归一化的落点——点、框、传播采样三种来源在这里统一：

```typescript
type PromptLabel = 0 | 1 | 2 | 3
// 0 = exclude 点，1 = include 点，2 = 框左上角，3 = 框右下角

function feedForSam(
  imageEmbeddings: Float32Array,  // 编码器输出，1×256×64×64
  points: number[],               // [x1, y1, x2, y2, ...]，1024² 画布坐标
  labels: PromptLabel[],
  modelSize = 1024,
): Record<string, ort.Tensor> {
  const n = labels.length
  return {
    image_embeddings: new ort.Tensor('float32', imageEmbeddings, [1, 256, 64, 64]),
    point_coords:     new ort.Tensor('float32', Float32Array.from(points), [1, n, 2]),
    point_labels:     new ort.Tensor('float32', Float32Array.from(labels), [1, n]),
    // 不做掩码迭代精修时，mask_input 必须给全零占位而非省略
    mask_input:       new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input:   new ort.Tensor('float32', [0], [1]),
    orig_im_size:     new ort.Tensor('float32', [modelSize, modelSize], [2]),
  }
}
```

解码输出是 `[1, 4, 1024, 1024]` 的四个候选掩码（`4 × 1024 × 1024 × 4 B = 16 MiB`）。SAM 用多候选来消解「点在肝脏上」这类提示的固有歧义——它可能指肝段、整个肝、或包含肝的腹部区域。在医学勾画里我们不向医师暴露这种歧义：结构集已经确定了目标的解剖层级，因此固定取模型自评分最高的候选，把歧义消解交给「再点一个 exclude 点」这个更符合临床直觉的动作。

### D. 概率阈值与后处理

解码输出经 sigmoid 后是逐像素前景概率。实现中以 8-bit alpha 通道承载概率，阈值 `pCutoff = 64`（即 25%）。这个取值明显低于常规的 0.5，效果是**偏向过分割**。

我们认为单一全局阈值在放疗场景下是错的，因为代价是非对称且方向相反的：

- **靶区（GTV/CTV）**：欠分割意味着几何漏照（geographic miss），后果严重且不可逆；过分割则被后续外扩与计划优化部分吸收。此处宜取低阈值。
- **危及器官（OAR）**：过分割会把正常组织算进受量约束，过度收紧计划、降低靶区覆盖；欠分割则低估风险。此处宜取接近 0.5 的阈值。

因此阈值应随结构语义配置，而非全局常量：

```typescript
interface StructureProfile {
  code: string              // TG-263 标准名，如 'Lung_L' / 'GTVp'
  category: 'target' | 'oar'
  pCutoff: number           // 0–255 alpha 阈值
  islandRemoval: { maxInternalRemove: number; fillInternalEdge: boolean }
}

const PROFILES: Record<string, StructureProfile> = {
  GTVp:    { code: 'GTVp',    category: 'target',
             pCutoff: 56, islandRemoval: { maxInternalRemove: 8,  fillInternalEdge: true  } },
  Lung_L:  { code: 'Lung_L',  category: 'oar',
             // 肺内含气腔与血管断面是真实结构，不能当孤岛填掉
             pCutoff: 128, islandRemoval: { maxInternalRemove: 0, fillInternalEdge: false } },
  SpinalCord: { code: 'SpinalCord', category: 'oar',
             pCutoff: 140, islandRemoval: { maxInternalRemove: 4,  fillInternalEdge: true  } },
}
```

同样的道理适用于孤岛移除。默认配置 `maxInternalRemove: 16, fillInternalEdge: true` 对实质器官是合理的去噪，但对肺、肠道、气管这类**内部真实存在空腔**的结构，它会把解剖结构当噪声抹掉。这类默认值在自然图像上无害，在医学影像上是缺陷。

### E. 掩码到体素的几何映射

解码得到的掩码位于 1024² 的画布坐标系，必须映射回体数据的 IJK 索引。映射链是：

```
canvas(u, v) ──▶ world = origin + u·rightVector + v·downVector ──▶ worldToIndex ──▶ (i, j, k)
```

三处需要留意。**其一是各向异性体素**：定位 CT 常见层厚 3 mm、层内 1 mm，`downVector` 的模长与 `rightVector` 不等，直接按像素比例缩放会产生系统性偏移。**其二是非轴位平面**：在 MPR 的冠状或斜位视图上做提示时，`rightVector`/`downVector` 不与体数据轴对齐，映射后会出现阶梯状锯齿，需要在体素侧做一次形态学闭运算。**其三是重采样的不可逆性**：1024² 画布对 512² 源图是上采样，掩码边界的亚像素信息是插值产生的，回映时应做最近邻而非线性插值，否则会在边界引入本不存在的中间值。

## V. 三级缓存与调度

### A. 层次结构

<figure class="diagram">
<svg viewBox="0 0 800 372" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="三级缓存层次图：L1 内存 Map、L2 OPFS 图像嵌入缓存、L3 Cache API 模型二进制缓存，以及自上而下的查找与回填路径">
<defs>
<marker id="seg2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<rect x="24" y="30" width="248" height="44" rx="9" fill="#25262b"/>
<text x="148" y="52" text-anchor="middle" font-size="12.5" fill="#ffffff" font-weight="600">restoreImageEncoding(key)</text>
<text x="148" y="67" text-anchor="middle" font-size="10" fill="#ffffff" opacity="0.72">编码前的唯一入口</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="24" y="110" width="248" height="56" rx="9"/>
<rect x="24" y="196" width="248" height="56" rx="9"/>
<rect x="24" y="282" width="248" height="56" rx="9"/>
</g>
<g text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">
<text x="148" y="132">L1 · 内存 Map</text>
<text x="148" y="218">L2 · OPFS</text>
<text x="148" y="304">L3 · Cache API</text>
</g>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="148" y="150">key → Float32Array · 亚毫秒</text>
<text x="148" y="160">页面生命周期</text>
<text x="148" y="236">图像嵌入持久化 · 十毫秒级</text>
<text x="148" y="246">跨会话，需配额与淘汰</text>
<text x="148" y="322">模型二进制 · 约 197 MB</text>
<text x="148" y="332">跨会话，浏览器托管</text>
</g>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#seg2-arrow)" fill="none">
<line x1="148" y1="76" x2="148" y2="108"/>
<line x1="148" y1="168" x2="148" y2="194"/>
</g>
<text x="160" y="186" font-size="10" fill="#6b6e76">未命中</text>
<text x="160" y="100" font-size="10" fill="#6b6e76">查</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="336" y="110" width="200" height="56" rx="9"/>
<rect x="336" y="196" width="200" height="56" rx="9"/>
</g>
<g fill="#25262b">
<rect x="336" y="282" width="200" height="56" rx="9"/>
</g>
<g text-anchor="middle" font-size="12" fill="#25262b">
<text x="436" y="134">命中 → 直接解码</text>
<text x="436" y="220">命中 → 回填 L1</text>
</g>
<text x="436" y="306" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">全未命中 → 运行编码器</text>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="436" y="152">省去 1–3 s 编码</text>
<text x="436" y="238">一次 4 MiB 读取</text>
</g>
<text x="436" y="322" text-anchor="middle" font-size="10.5" fill="#ffffff" opacity="0.72">异步写回 L1 与 L2</text>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#seg2-arrow)" fill="none">
<line x1="274" y1="138" x2="334" y2="138"/>
<line x1="274" y1="224" x2="334" y2="224"/>
<line x1="274" y1="310" x2="334" y2="310"/>
<path d="M 536 310 H 600 V 138 H 540" stroke-dasharray="5 4"/>
</g>
<rect x="576" y="176" width="200" height="110" rx="10" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="676" y="198" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="600">容量事实</text>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="676" y="219">嵌入 256×64×64×4 B = 4 MiB/帧</text>
<text x="676" y="236">源切片 512×512×2 B = 512 KiB</text>
<text x="676" y="253">缓存代价 = 源数据的 8 倍</text>
<text x="676" y="273">400 层序列 ⇒ 1.6 GiB</text>
</g>
</svg>
<figcaption>图 2. 三级缓存的查找路径与容量代价</figcaption>
</figure>

### B. 容量分析

图像嵌入的尺寸是确定的：`1 × 256 × 64 × 64` 个 float32，即 `1,048,576 × 4 B = 4 MiB`，与图像内容无关。把它与源数据对比会得到一个反直觉的结论：一张 512×512 的 int16 CT 切片是 512 KiB，**嵌入比源切片大 8 倍**。

这个比例决定了缓存策略不能是「无界持久化」。一个 400 层的胸部薄层 CT 序列，全量嵌入是 1.6 GiB；一个工作站上医师一天翻阅十几个序列，OPFS 会在数天内涨到几十 GB，最终触发浏览器的存储回收——而回收是不可预测的，可能在医师正在使用的序列上发生。

我们采用的策略是**按 Study 配额 + LRU 淘汰**：

```typescript
const QUOTA_PER_STUDY = 512 * 1024 * 1024   // 512 MiB ≈ 128 帧
const QUOTA_TOTAL     = 4 * 1024 * 1024 * 1024

async function admitEmbedding(key: EmbeddingKey, bytes: ArrayBuffer): Promise<void> {
  // 传播场景下访问是局部的：医师在当前层附近上下滚动，
  // 远端切片的嵌入几乎不会被复用，按 LRU 淘汰即可
  await evictUntil(key.studyUID, QUOTA_PER_STUDY - bytes.byteLength)
  await evictGlobalUntil(QUOTA_TOTAL - bytes.byteLength)
  await opfsWrite(serializeKey(key), bytes)
}
```

配额取 512 MiB 是从访问局部性反推的：切片传播的搜索半径默认为 10 层，加上医师往返审阅的范围，热点窗口很少超过 100 帧。给到 128 帧配额，命中率与无界缓存几乎无差，存储占用却降低一个数量级。

### C. 窗宽窗位敏感的缓存键

这是本文认为最具普遍性的一条发现。

参考实现把 OPFS 路径定为 `<modelName>/<studyUID>/<seriesUID>/<instanceUID>`。在自然图像语境下这是对的——一个图像 ID 唯一确定一张图像。但在医学影像里**不成立**，因为进入编码器的不是原始像素，而是经过 VOI LUT 变换后的 8-bit RGB（§IV-B）。同一层 CT 在肺窗（WW 1500 / WC −600）与纵隔窗（WW 400 / WC 40）下，重采样后是两张视觉上截然不同的图像，编码器输出的嵌入自然也不同。

后果是**静默的**：医师在肺窗下编码了某层，切到纵隔窗再放提示点，系统从缓存取回肺窗的嵌入，解码器基于错误的图像特征给出掩码。分割结果看起来"像那么回事"，但它对应的是另一个窗位下的图像语义。没有报错，没有告警，只有一个偏了的边界。

修正是把窗位纳入键，并做量化以避免拖动窗宽时的键爆炸：

```typescript
interface EmbeddingKey {
  modelName: string
  studyUID: string
  seriesUID: string
  instanceUID: string
  ww: number      // 量化后的窗宽
  wc: number      // 量化后的窗位
  voiLutId: string // 非线性 VOI LUT 的标识；线性变换时为 'linear'
}

// 量化步长取 5 HU：小于该幅度的窗位变化不改变 8-bit 量化后的像素分布，
// 复用嵌入是安全的；大于该幅度则必须重编码。
const WL_STEP = 5
const quantize = (v: number) => Math.round(v / WL_STEP) * WL_STEP

function serializeKey(k: EmbeddingKey): string {
  return [k.modelName, k.studyUID, k.seriesUID, k.instanceUID,
          `ww${quantize(k.ww)}`, `wc${quantize(k.wc)}`, k.voiLutId].join('/')
}
```

还需要一条**写入去抖**：医师拖动窗宽时窗位连续变化，若每个中间值都触发编码，GPU 会被无意义的工作填满。实现上只在窗位稳定超过 500 ms 后才发起编码，且拖动过程中直接禁用预览。

推广地说，任何以「渲染后图像」为模型输入的医学影像 AI，其缓存键都必须包含完整的渲染参数；只用 SOPInstanceUID 做键，是把 DICOM 的「像素数据」与「呈现状态」混为一谈。

### D. 双会话与 GPU 互斥

浏览器只有一个 GPU 队列，编码与解码不能真正并行。系统用两个会话共享同一个编码器实例（避免 180 MB 的双份驻留），但各自持有独立的画布与嵌入缓存：

```
sessions[0]  当前层
  ├─ encoder: 共享实例
  ├─ decoder: 独立实例
  └─ embeddings: 当前层嵌入

sessions[1]  预取层
  ├─ encoder: 与 sessions[0] 同一实例
  ├─ decoder: null（预取不解码）
  └─ embeddings: 下一层嵌入
```

调度上，`isGpuInUse` 是一把互斥锁：解码请求（交互路径，用户在等）优先，预编码（预取路径，用户不知情）让路。这个优先级不能反——一次让路只损失一点预取进度，一次抢占会让医师看到 200 ms 的卡顿。

预编码的方向选择也有讲究：不是简单地取「下一层」，而是**沿医师最近的滚动方向**。滚轮方向是一个强意图信号，按它预取能把命中率从约 50%（盲取一侧）提到接近 90%。

## VI. 人机协同交互模型

### A. 三种交互形态

| 工具 | 推理方式 | 提示来源 | 适用场景 | 每层交互成本 |
|------|---------|---------|---------|------------|
| 切片传播 | SAM encoder + decoder | 从邻层已确认标注中随机采样 | 顺序逐层勾画连续结构 | 一次按键（接受/否决） |
| 标记引导 | SAM decoder（嵌入复用） | 医师手动放置 include/exclude 点 | 边界复杂、需精确控制 | 2–5 次点击 + 一次按键 |
| 一键分割 | GrowCut（非神经网络） | 悬停位置自动推导正负种子 | 对比度良好的单一区域 | 一次点击 + 一次按键 |

表 I. 三种交互形态的对比

值得注意的是第三种：一键分割用的是 GrowCut [16]，不涉及任何模型。把它与两种 SAM 工具并列在同一个「接受/否决」框架下，是 C3（模型中立）的直接体现——交互层不知道背后是 ViT 还是元胞自动机，只知道「有一个建议待审」。这也带来一个实际好处：在模型尚未下载完成的前几十秒，一键分割已经可用。

### B. 预览-审定状态机

<figure class="diagram">
<svg viewBox="0 0 800 336" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="人机协同状态机图：从空闲、已提示、预览中，经接受或否决进入已提交或回到已提示，再到已审定与已导出，下方列出四类责任链审计事件">
<defs>
<marker id="seg3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="24" y="60" width="128" height="42" rx="9"/>
<rect x="196" y="60" width="128" height="42" rx="9"/>
<rect x="368" y="60" width="128" height="42" rx="9"/>
</g>
<g fill="#25262b">
<rect x="540" y="60" width="112" height="42" rx="9"/>
<rect x="368" y="146" width="128" height="42" rx="9"/>
</g>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="672" y="60" width="104" height="42" rx="9"/>
</g>
<g text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11.5">
<text x="88" y="86" fill="#25262b">IDLE</text>
<text x="260" y="86" fill="#25262b">PROMPTED</text>
<text x="432" y="86" fill="#25262b">PREVIEW</text>
<text x="596" y="86" fill="#ffffff">COMMITTED</text>
<text x="724" y="86" fill="#25262b">SIGNED_OFF</text>
<text x="432" y="172" fill="#ffffff">REJECTED</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="88" y="118">无提示</text>
<text x="260" y="118">提示已放置</text>
<text x="432" y="118">掩码已生成，未落盘</text>
<text x="724" y="118">医师电子签名</text>
</g>
<text x="596" y="118" text-anchor="middle" font-size="10" fill="#6b6e76">写入 labelmap</text>
<text x="432" y="204" text-anchor="middle" font-size="10" fill="#6b6e76">丢弃，不留分割数据</text>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#seg3-arrow)" fill="none">
<line x1="152" y1="81" x2="194" y2="81"/>
<line x1="324" y1="81" x2="366" y2="81"/>
<line x1="496" y1="81" x2="538" y2="81"/>
<line x1="652" y1="81" x2="670" y2="81"/>
<line x1="432" y1="104" x2="432" y2="144"/>
<path d="M 368 167 H 260 V 104"/>
<path d="M 596 104 V 128 H 260 V 104" stroke-dasharray="5 4"/>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="173" y="74">放置提示</text>
<text x="345" y="74">推理完成</text>
<text x="517" y="74">Enter</text>
<text x="450" y="128">Esc</text>
<text x="314" y="163">补充提示重来</text>
</g>
<text x="430" y="142" text-anchor="middle" font-size="10" fill="#6b6e76">继续下一层</text>
<text x="400" y="238" text-anchor="middle" font-size="11.5" fill="#25262b">状态迁移全部落审计事件；仅 COMMITTED 之后的数据可参与导出</text>
<rect x="24" y="252" width="752" height="64" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<g stroke="#d6d8de" stroke-width="1">
<line x1="212" y1="252" x2="212" y2="316"/>
<line x1="400" y1="252" x2="400" y2="316"/>
<line x1="588" y1="252" x2="588" y2="316"/>
</g>
<g text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11.5" fill="#25262b">
<text x="118" y="277">AI_SUGGEST</text>
<text x="306" y="277">DECISION</text>
<text x="494" y="277">EDIT</text>
<text x="682" y="277">SIGN_OFF</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="118" y="298">模型、版本、提示内容</text>
<text x="306" y="298">接受 / 否决 + 耗时</text>
<text x="494" y="298">手工修正的体积增量</text>
<text x="682" y="298">审定人 + 签名 + 时间戳</text>
</g>
</svg>
<figcaption>图 3. 预览-审定状态机与四类责任链事件</figcaption>
</figure>

`PREVIEW` 是这套设计的关键：它是一个渲染层的临时对象，不写入 `labelmap` 的体素管理器。这意味着「否决」不需要撤销操作——没有写入就没有回滚，`Esc` 只是丢弃一个临时缓冲区。相比「先写入再 undo」的做法，这一选择消除了整类一致性 bug：撤销失败、撤销栈溢出、撤销跨层错乱。

`DECISION` 事件同时记录接受与否决，这一点常被忽略。只记录接受会让审计数据严重偏倚——它看起来像是"模型总是对的"，因为被否决的建议没有留下任何痕迹。记录否决还有实际价值：否决率按结构、按序列、按模型版本聚合后，是模型退化最灵敏的现场指标，比离线评测早得多。

### C. 传播的提示采样

切片传播的提示来自邻层已确认的标注。参考实现的做法是「在搜索半径内找到已标注层，随机采 `numRandomPoints`（默认 5）个前景像素」。这个策略在结构中段可用，在两极会失效：当结构接近顶端或底端时，邻层的前景面积迅速缩小，5 个随机点会挤在几十个体素的小块里，退化成一个重复的单点提示，解码器随即给出一个过小或过散的掩码。

我们的调整有三条：

```typescript
interface PropagationPrompt { points: number[]; labels: PromptLabel[]; confident: boolean }

function samplePrompts(neighborMask: Uint8Array, area: number): PropagationPrompt | null {
  // 1) 面积过小则停止传播，而不是硬凑点数——两极是最该交还给医师的地方
  if (area < MIN_PROPAGATE_AREA) return null

  // 2) 点数随面积对数增长：小结构少点避免过约束，大结构多点保证覆盖
  const n = clamp(Math.round(2 * Math.log2(area)), 3, 24)

  // 3) 泊松盘采样替代均匀随机，保证点之间有最小间距，避免簇聚
  const pts = poissonDiskSample(neighborMask, n, minDistance(area))

  // 4) 从邻层背景的近邻环上采若干 exclude 点，抑制向邻近器官泄漏
  const neg = sampleRing(neighborMask, RING_OFFSET_MM, Math.ceil(n / 3))

  return {
    points: [...pts.flat(), ...neg.flat()],
    labels: [...pts.map(() => 1 as const), ...neg.map(() => 0 as const)],
    confident: area > CONFIDENT_AREA,   // 供 UI 决定预览是否默认高亮
  }
}
```

第 4 条尤其重要：只给 include 点时，SAM 没有任何信息约束边界的外侧，在肝-肾、肺-胸壁这类相邻且灰度接近的界面上容易溢出。从邻层前景轮廓外推一圈取负点，等价于给了模型一个软性的边界先验。

### D. 交互经济性模型

「AI 辅助更快」是个需要证明的命题，而不是前提。我们把它形式化。

设一个序列有 `N` 层。**手工基线**下每层耗时 `t_m`（描边、微调、切层的总和），总时间：

```
T_manual = N · t_m
```

**AI 辅助**下，每层医师需要：查看预览并判断（`t_v`）；若接受（概率 `p`），按一次键（`t_a`）；若否决（概率 `1−p`），按键退出（`t_r`）后仍需手工完成该层（`t_m`）。总时间：

```
T_ai = N · [ t_v + p·t_a + (1 − p)·(t_r + t_m) ]
```

加速比：

```
S(p) = t_m / [ t_v + p·t_a + (1 − p)·(t_r + t_m) ]
```

令 `S(p) > 1` 解得**盈亏平衡接受率**：

```
p* = (t_v + t_r) / (t_r + t_m − t_a)
```

这个式子有几条直接可用的结论。**其一**，`p*` 与 `t_m` 近似成反比：手工越贵的结构，AI 越容易划算。**其二**，`t_v`（审阅耗时）与 `t_r`（否决成本）出现在分子，说明降低它们和提高模型精度是等价的产品杠杆——把预览做得一眼可判、把否决做成一个按键，其收益与提高接受率相当。**其三**，`t_a` 在分母上被 `t_m` 淹没，说明接受动作本身的耗时几乎不重要，不必为它做优化。

代入典型器官勾画参数（`t_m = 25 s`、`t_v = 1.5 s`、`t_a = 0.4 s`、`t_r = 1.0 s`）得 `p* = 2.5 / 25.6 ≈ 9.8%`。**接受率只要超过约 10%，AI 辅助就已经比纯手工快。** 这个阈值之低是反直觉的，也解释了为什么即使在模型明显不完美的结构上，医师仍普遍反馈"有用"。

数值结果见 §X-C。

## VII. 服务端通路与多模型编排

### A. 提示语义的跨通路统一

通路 B 接入 nnInteractive、SAM2/MedSAM2/SAM3、VoxTell 四类模型，它们的提示能力并不整齐：

| 提示类型 | nnInteractive | SAM2 / MedSAM2 | SAM3 | VoxTell | 浏览器 SAM |
|---------|:---:|:---:|:---:|:---:|:---:|
| 正提示点 | 支持 | 支持 | 支持 | — | 支持 |
| 负提示点 | 支持 | 支持 | 支持 | — | 支持 |
| 边界框 | 支持 | 支持 | 支持 | — | 支持 |
| 涂鸦 | 支持 | — | — | — | — |
| 套索 | 支持 | — | — | — | — |
| 文本 | — | — | — | 支持 | — |
| 原生三维传播 | 支持 | 支持 | 支持 | 支持 | 靠层间传播模拟 |
| 显存需求 | 约 6 GB | 约 4 GB | 约 6 GB | 约 3 GB | 0（GPU 由浏览器托管） |

表 II. 各模型的提示能力与资源需求

编排层的职责是让交互层不感知这些差异：医师画了套索，若当前模型不支持，编排层降级为套索的外接框加轮廓上的采样点；医师输入了文本，若无文本模型，编排层直接给出"当前模型不支持文本提示"而不是静默忽略。**降级必须显式**——静默降级会让医师以为自己的意图被理解了。

### B. 会话机制

三维模型每次推理都需要完整体数据。若每次交互都上传一遍 300 层 CT（约 150 MB），交互就无从谈起。会话机制把上传与推理解耦：

```
PUT  /session/                  上传一次 3D 体数据 → 返回 session_id
POST /infer/{model}?session=…   后续推理只传提示，毫秒级往返
DEL  /session/{session_id}      显式释放显存
```

nnInteractive 还额外支持 `init` 操作预计算编码器状态，与 §IV-A 中「嵌入与提示无关」的分解是同一个思想在三维上的体现。

会话的生命周期管理是这条通路最容易出问题的地方：一个未释放的会话占着几 GB 显存，几个就把 GPU 占满。实现上需要空闲超时（我们取 15 分钟）、页面卸载时的 `sendBeacon` 释放、以及服务端的显存水位强制回收三重保险。

### C. 产出格式的收敛

无论哪条通路，产出都必须收敛到 DICOM SEG [11], [12]。关键字段：

```python
# SEG 必须携带对源序列的完整引用，否则下游无法确定它勾的是哪套影像
ds.SOPClassUID = '1.2.840.10008.5.1.4.1.1.66.4'
ds.SegmentationType = 'BINARY'

seg = Dataset()
seg.SegmentNumber = 1
seg.SegmentLabel = 'Lung_L'                    # TG-263 标准名
seg.SegmentAlgorithmType = 'SEMIAUTOMATIC'     # 不是 AUTOMATIC —— 人在环内
seg.SegmentAlgorithmName = 'sam_b@1.17.1'      # 模型与版本，供责任链回溯
seg.SegmentedPropertyCategoryCodeSequence = [code('T-D0050', 'SRT', 'Tissue')]
seg.SegmentedPropertyTypeCodeSequence = [code('T-28300', 'SRT', 'Left lung')]
ds.SegmentSequence = [seg]

ds.ReferencedSeriesSequence = [referenced_series(source_series_uid, source_sop_uids)]
```

`SegmentAlgorithmType` 取 `SEMIAUTOMATIC` 而非 `AUTOMATIC` 不是措辞讲究，而是事实陈述：这份 SEG 的每一层都经过了人的接受动作。下游系统与审计方据此判断它的性质。

## VIII. 责任链与可追溯性

### A. 为什么留痕必须写进数据结构

C4（建议不等于结论）如果只写在文案里，工程上迟早会被绕过。我们的做法是让它在数据层就说不通：预览对象不进入体素管理器（§VI-B），未审定的分割在导出时强制带"草稿"标记，任何一次状态迁移都追加一条不可修改的审计记录。

```sql
CREATE TABLE seg_audit (
  id             BIGSERIAL PRIMARY KEY,
  case_id        VARCHAR(64)  NOT NULL,
  series_uid     VARCHAR(128) NOT NULL,
  structure      VARCHAR(64)  NOT NULL,   -- TG-263 标准名
  -- AI_SUGGEST / DECISION / EDIT / SIGN_OFF / EXPORT
  event_type     VARCHAR(16)  NOT NULL,
  origin         VARCHAR(8),              -- ai / human
  model          VARCHAR(64),             -- 通路 A: sam_b；通路 B: nninteractive 等
  model_version  VARCHAR(32),
  inference_site VARCHAR(16),             -- browser / on_prem_gpu，用于数据流向举证
  slice_index    INT,
  decision       VARCHAR(8),              -- accept / reject，DECISION 事件专用
  decision_ms    INT,                     -- 审阅耗时，即经济性模型中的 t_v
  prompt         JSONB,                   -- 提示的完整快照，供复现
  delta          JSONB,                   -- 手工修正的体积增减
  signature      VARCHAR(256),            -- SIGN_OFF 专用
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 只增不改：撤销 UPDATE / DELETE 权限，靠追加新事件表达"更正"
REVOKE UPDATE, DELETE ON seg_audit FROM app_user;
```

`inference_site` 字段是浏览器端方案特有的：它让"这次推理的像素数据是否离开了工作站"成为可举证的事实，而不是一句架构承诺。在数据出境或跨域审查时，这一列直接就是证据。

`decision_ms` 则一箭双雕——它既是责任链的一部分（医师确实看了多久），又恰好是 §VI-D 模型中的 `t_v` 的直接测量值。经济性模型的参数因此不需要单独做用户研究，生产环境的审计数据本身就在持续标定它。

### B. 可还原性

有了上述记录，任意一次审定都能完整还原：哪个模型的哪个版本、在哪台设备上、基于什么提示、给出了什么建议；医师看了多久、接受还是否决；接受后又手工改了多少体积；最后由谁在何时签字。这条链条对应的监管表述是「AI 仅辅助，最终判定由岗位责任人负责」[27], [28]，其价值不在于免责，而在于让"人的决定"可证明、可追溯、可辩护。

## IX. 实验设置

### A. 实现

前端为 React 19 + TypeScript，影像栈为 Cornerstone3D 4.15，推理为 ONNX Runtime Web 1.17.1（WebGPU 优先，WASM 回落）。模型为 SAM ViT-B 的 ONNX 导出版本：编码器 FP16 约 180 MB，解码器 FP32 约 17 MB。分割数据、统计与 SEG 编解码复用查看器既有能力，例如逐 segment 统计在 Web Worker 中执行以避免阻塞主线程：

```typescript
export async function getSegmentStatistics(
  segmentationId: string,
): Promise<Map<number, SegmentStats>> {
  const indices = getSegmentIndices(segmentationId)
  if (!indices.length) return new Map()
  if (!cstSegmentation.state.getSegmentation(segmentationId)) return new Map()

  // individual 模式：逐 segment 分别统计；底层自动区分 volume / stack labelmap
  const stats = await cstUtils.segmentation.getStatistics({
    segmentationId, segmentIndices: indices, mode: 'individual',
  })

  const result = new Map<number, SegmentStats>()
  for (const idx of indices) {
    const named = stats?.[idx]
    if (named) result.set(idx, mapNamedStats(idx, named))
  }
  return result
}
```

体积单位需要显式换算而非直接透传：底层返回 mm³（体素计数乘以 spacing 乘积），临床习惯用 ml，两者差 1000 倍。这类换算若默默透传，界面上会出现三个数量级的错误而不报错。

新建分割走 Cornerstone3D 的派生 labelmap 路径，只依赖参考影像的 metadata，不要求像素已全部加载——这一点对大序列的首屏体验很关键：

```typescript
const referenceImageIds = (viewport as coreTypes.IStackViewport).getImageIds()
const derivedImages = imageLoader.createAndCacheDerivedLabelmapImages(referenceImageIds)

cstSegmentation.addSegmentations([{
  segmentationId,
  representation: {
    type: SegmentationRepresentations.Labelmap,
    data: { imageIds: derivedImages.map((i) => i.imageId), referencedImageIds: referenceImageIds },
  },
  config: { label: options.label, segments: { 1: firstSegment } },
}])
await cstSegmentation.addSegmentationRepresentations(viewportId, [
  { type: SegmentationRepresentations.Labelmap, segmentationId },
])
```

### B. 数据

系统级测试使用 SlicerRtData [29] 放疗测试集，总计约 4.8 GB、45 个子数据集、约 6870 个 DICOM 文件，来自 Eclipse、XiO、Pinnacle3、Aria、Oncentra、TomoTherapy、Corvus、CERR、HIT 等九类计划系统。模态分布为 CT 3782、US 153、MR 125、RTDOSE 38、RTRECORD 37、RTIMAGE 33、RTSTRUCT 28、SR 23、RTPLAN 21、XA 6、REG 2。

选取的重点子集：

| 子集 | 用途 | 特征 |
|------|------|------|
| `eclipse-10.0.42-fsrt-brain` | 长序列编码与缓存 | 230+ 层脑部 CT |
| `aria-phantom-contours-*` | 复杂轮廓的几何映射 | 分支、钥匙孔、快速变化三类轮廓 |
| `eclipse-8.1.20-phantom-prostate` | 完整 RT 链路 | CT + RTSTRUCT + RTPLAN + RTDOSE |
| `xio-4.60.00-phantom-irregular-spacing` | 各向异性与不规则层距 | 非均匀层间距 |
| `plastimatch_tiny-rt-study` | 冒烟回归 | 小体量，秒级加载 |
| `oncentra-4.2.21-mri-us-fusion-4` | 跨模态窗位敏感性 | MR + US 融合数据 |

表 III. 测试子集及其针对的失效模式

`aria-phantom-contours-*` 三个子集是专门为轮廓边界情况构造的，用来验证 §IV-E 的几何映射：分支轮廓检验单层多连通域的处理，钥匙孔轮廓检验孔洞不被孤岛移除误填，快速变化轮廓检验传播在层间形态突变时是否会失控外溢。

### C. 硬件与基准口径

系统级基准在配备支持 WebGPU 的现代浏览器（Chrome 113+）的工作站上采集，同时记录 WASM 回落路径作为无 GPU 环境的下界。所有时延为端到端墙钟时间，包含张量构造、GPU 上传与结果回读，不是纯算子时间。

### D. 精度评测协议

分割精度按 [22], [23] 的建议设计：主指标为 Dice 相似系数 [25] 与 95% 分位 Hausdorff 距离 [26]，对薄壁与管状结构（脊髓、食管、视神经）额外报告表面 Dice（容差取该结构的层内像素间距）。参考标准由两名放疗医师独立勾画后经第三人仲裁形成，同时报告观察者间变异作为性能上界。评测按结构分层报告而非取全局均值——全局均值会被大体积器官（肺、肝）主导，掩盖小结构的问题，这正是 [23] 指出的典型陷阱。

### E. 评测口径声明

本文报告的是**系统级指标**：推理时延、内存占用、缓存行为、以及由交互经济性模型导出的加速比。§IX-D 描述的精度评测按上述协议独立进行，其结果不在本文报告范围内。这样切分的理由是：交互式系统的最终产出是人机共同的结果，把模型单独输出的 Dice 与系统价值混在一起报告，两边都说不清楚。

## X. 结果

### A. 推理时延

| 阶段 | WebGPU | WASM（CPU） | 说明 |
|------|--------|------------|------|
| 模型首次加载 | 3–10 s | 3–10 s | 含约 197 MB 下载；受网络主导 |
| 模型二次加载 | < 1 s | < 1 s | 从 Cache API 恢复 |
| 编码（每帧） | 1–3 s | 5–15 s | ViT-B 前向，含 12 MiB 张量上传 |
| 解码（每次） | 50–200 ms | 200–500 ms | 提示变化后重跑 |
| 掩码转体素 | < 100 ms | < 100 ms | 纯 CPU，与后端无关 |

表 IV. 推理各阶段时延

编码与解码之间约 30 倍的差距，是整套交互设计的物理基础。它意味着：**同一层内的反复调整是廉价的，跨层移动是昂贵的**。产品形态因此应当鼓励医师在一层上把边界调到满意再走，而不是快速翻页粗调——后者会把每一层都变成一次完整编码。缓存与预取（§V）存在的意义，正是把这个"昂贵"尽可能挪出关键路径。

WASM 路径下编码 5–15 s/帧，已越过交互可接受的门槛。因此在无 WebGPU 的环境里，产品应默认关闭切片传播（它每层都需要新的编码），只保留标记引导（在同一层内复用嵌入，只跑解码）与一键分割（完全不需要模型）。这是一个由性能数据反推出的功能可用性矩阵，不是降级提示。

### B. 内存与存储

| 项目 | 占用 | 生命周期 |
|------|------|---------|
| 编码器（FP16） | 约 180 MB | 会话内常驻 |
| 解码器 | 约 17 MB | 会话内常驻 |
| ONNX Runtime | 约 50 MB | 会话内常驻 |
| 单帧嵌入（L1） | 4 MiB | 受 LRU 约束 |
| 编码输入张量 | 12 MiB | 瞬时 |
| 解码输出张量 | 16 MiB | 瞬时 |
| 模型二进制（L3） | 约 197 MB | 跨会话 |
| 序列嵌入（L2，400 层全量） | 1.6 GiB | 跨会话，需配额 |

表 V. 内存与存储占用

常驻内存增量约 250–300 MB。在多标签页、多序列并行的实际使用中，这个量级要求编码器实例必须全局单例——两个标签页各持一份就是 500 MB，接近部分工作站浏览器的实用上限。共享方案是把推理放进 SharedWorker，让同源的多个标签页共用一个会话。

### C. 交互经济性的数值结果

把 §VI-D 的模型代入两组参数：复杂器官（`t_m = 25 s`）与简单结构（`t_m = 12 s`），其余参数同前。

<figure class="diagram">
<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="加速比随接受率变化的曲线图：横轴为接受率 0 到 1，纵轴为加速比 0 到 8，两条曲线分别对应手工每层 25 秒的复杂器官与 12 秒的简单结构，标注了各自的盈亏平衡接受率">
<line x1="80" y1="320" x2="756" y2="320" stroke="#25262b" stroke-width="1.4"/>
<line x1="80" y1="320" x2="80" y2="44" stroke="#25262b" stroke-width="1.4"/>
<g stroke="#e2e3e7" stroke-width="1">
<line x1="80" y1="286" x2="740" y2="286"/>
<line x1="80" y1="252" x2="740" y2="252"/>
<line x1="80" y1="219" x2="740" y2="219"/>
<line x1="80" y1="185" x2="740" y2="185"/>
<line x1="80" y1="151" x2="740" y2="151"/>
<line x1="80" y1="118" x2="740" y2="118"/>
<line x1="80" y1="84" x2="740" y2="84"/>
<line x1="80" y1="50" x2="740" y2="50"/>
</g>
<g text-anchor="end" font-size="10.5" fill="#6b6e76">
<text x="72" y="324">0</text>
<text x="72" y="290">1×</text>
<text x="72" y="256">2×</text>
<text x="72" y="223">3×</text>
<text x="72" y="189">4×</text>
<text x="72" y="155">5×</text>
<text x="72" y="122">6×</text>
<text x="72" y="88">7×</text>
<text x="72" y="54">8×</text>
</g>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="80" y="338">0</text>
<text x="212" y="338">0.2</text>
<text x="344" y="338">0.4</text>
<text x="476" y="338">0.6</text>
<text x="608" y="338">0.8</text>
<text x="740" y="338">1.0</text>
</g>
<text x="410" y="360" text-anchor="middle" font-size="11.5" fill="#25262b">接受率 p（医师直接采纳 AI 预览的比例）</text>
<text x="26" y="182" font-size="11.5" fill="#25262b" transform="rotate(-90 26 182)" text-anchor="middle">加速比 S(p)</text>
<line x1="80" y1="286" x2="740" y2="286" stroke="#25262b" stroke-width="1.2" stroke-dasharray="6 4"/>
<text x="748" y="290" font-size="10" fill="#25262b">S = 1 · 盈亏平衡</text>
<line x1="145" y1="320" x2="145" y2="60" stroke="#c4c6cd" stroke-width="1.1" stroke-dasharray="4 4"/>
<line x1="212" y1="320" x2="212" y2="60" stroke="#c4c6cd" stroke-width="1.1" stroke-dasharray="4 4"/>
<text x="150" y="72" font-size="10" fill="#6b6e76">p* = 9.8%</text>
<text x="217" y="90" font-size="10" fill="#6b6e76">p* = 19.8%</text>
<path d="M 80 289 L 146 286 L 212 282 L 278 277 L 344 271 L 410 263 L 476 250 L 542 232 L 608 200 L 641 173 L 674 131 L 707 55"
      fill="none" stroke="#25262b" stroke-width="2.2"/>
<path d="M 80 292 L 212 286 L 344 277 L 476 262 L 608 228 L 674 192 L 707 160"
      fill="none" stroke="#9a9da6" stroke-width="2.2" stroke-dasharray="7 4"/>
<g fill="#25262b">
<circle cx="608" cy="200" r="3.6"/>
<circle cx="674" cy="131" r="3.6"/>
</g>
<g fill="#9a9da6">
<circle cx="608" cy="228" r="3.6"/>
<circle cx="674" cy="192" r="3.6"/>
</g>
<g font-size="10" fill="#6b6e76">
<text x="560" y="194">3.56×</text>
<text x="626" y="125">5.61×</text>
<text x="616" y="248">2.72×</text>
<text x="682" y="186">3.80×</text>
</g>
<rect x="96" y="56" width="268" height="52" rx="8" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.2"/>
<line x1="110" y1="74" x2="140" y2="74" stroke="#25262b" stroke-width="2.2"/>
<line x1="110" y1="94" x2="140" y2="94" stroke="#9a9da6" stroke-width="2.2" stroke-dasharray="7 4"/>
<g font-size="10.5" fill="#25262b">
<text x="150" y="78">复杂器官 t_m = 25 s</text>
<text x="150" y="98">简单结构 t_m = 12 s</text>
</g>
</svg>
<figcaption>图 4. 加速比随接受率的变化（t_v = 1.5 s，t_a = 0.4 s，t_r = 1.0 s）</figcaption>
</figure>

| 接受率 p | S(p)，t_m = 25 s | S(p)，t_m = 12 s |
|---------|-----------------|-----------------|
| 0.10 | 1.00 | 0.88 |
| 0.20 | 1.12 | 1.00 |
| 0.40 | 1.45 | 1.27 |
| 0.60 | 2.06 | 1.73 |
| 0.80 | 3.56 | 2.72 |
| 0.90 | 5.61 | 3.80 |
| 0.95 | 7.86 | 4.74 |

表 VI. 加速比数值结果

三点观察。**第一，曲线是超线性的。** 从 p = 0.8 到 0.9，接受率只提高了 12.5%，加速比却从 3.56× 跳到 5.61×（提高 58%）。这说明在高接受率区间，模型精度的边际收益极大；也说明"再提高几个点 Dice 意义不大"这个直觉在交互场景下是错的。

**第二，盈亏平衡点很低但不为零。** 复杂器官 9.8%、简单结构 19.8%。对于手工只需几秒的简单结构（例如已经很规则的体表轮廓），AI 需要相当高的接受率才划算——这是不应该给所有结构都开 AI 的量化理由。

**第三，两条曲线在低接受率区间几乎重合，在高接受率区间显著分离。** 这意味着：当模型对某类结构表现好时，应优先把它用在手工最贵的结构上；当模型表现一般时，用在哪里差别不大。这为结构级的功能开关提供了排序依据。

### D. 延迟隐藏的有效性

双会话预编码能否隐藏编码延迟，取决于医师在当前层停留的时间是否覆盖下一层的编码耗时。当前层的交互时间即经济性模型的分母：

```
t_interaction(p) = t_v + p·t_a + (1 − p)·(t_r + t_m)
```

在 `t_m = 25 s` 下，p = 0.8 时 `t_interaction ≈ 7.0 s`，p = 0.9 时约 4.5 s，p = 0.95 时约 3.2 s。与 WebGPU 编码耗时 1–3 s 对比：

- **p ≤ 0.95 且 WebGPU 可用**：编码完全被隐藏，医师感知不到编码存在。
- **p → 1（模型近乎全对）**：`t_interaction → 1.9 s`，逼近编码耗时上界，开始出现可感知的等待。
- **WASM 路径**：编码 5–15 s 远超任何接受率下的交互时间，无法隐藏。

第二条是个有意思的反常识结论：**模型越准，延迟隐藏越难**。因为医师停留时间被压缩，预取窗口随之收窄。这意味着延迟优化与精度优化不是独立的两条战线——精度提高到一定程度后，瓶颈会从"模型不够准"切换到"编码不够快"。产品上的应对是把预取深度从 1 层提高到 2–3 层，代价是每多一层多占 4 MiB 内存与一份 GPU 排队时间。

### E. 缓存行为

嵌入缓存的收益直接等于被省下的编码时间。在切片传播的典型访问模式下（沿一个方向推进，间或回退复核），按滚动方向预取的命中率约为盲取一侧的两倍。回退复核时 L1 与 L2 的命中意味着回看历史层几乎是零延迟的，这对医师的复核意愿有实质影响——如果回看要等 2 秒，医师就倾向于不回看。

模型缓存（L3）的收益更直接：首次 3–10 s 的下载在二次加载时降到 1 s 以内。这决定了产品能否把"启用 AI"做成一个随手可按的开关，而不是一次需要心理准备的等待。

## XI. 讨论

### A. 2D 基础模型做 3D 任务的固有代价

SAM 是二维模型，三维一致性靠层间传播获得。这带来两个结构性问题。

**误差沿传播方向累积。** 第 `k` 层的提示采自第 `k−1` 层的已确认标注。若第 `k−1` 层有一处轻微外溢并被医师接受（因为它看起来无伤大雅），这处外溢就成了第 `k` 层的提示来源，并可能被放大。传播链越长，漂移越大。缓解手段有三：限制连续自动接受的层数（我们取 8 层后强制一次全层复核）、以最初的人工层而非最近层作为提示锚点、以及在体积变化率超过阈值时中断传播。

**两极的退化。** 如 §VI-C 所述，结构接近顶端或底端时前景面积骤减，提示质量崩塌。我们的处理是主动停止传播而非硬撑——把最难的地方交还给医师，比给出一个需要大改的建议更省时间（这一点在经济性模型里是显然的：一个必然被否决的建议，其净贡献是 `−(t_v + t_r)`）。

原生三维模型（nnInteractive）不存在这两个问题，这也是保留通路 B 的核心理由。二者的分工可以简单表述为：**沿层连续、形态渐变的结构走通路 A；形态突变、多连通、或需要文本指定的结构走通路 B。**

### B. 窗位问题的推广

§V-C 的缓存键问题只是一个更大类问题的表现：**当模型输入是"渲染结果"而非"原始像素"时，渲染参数就是模型输入的一部分。** 这条原则的推论包括：

- 缓存键必须包含全部渲染参数（窗宽窗位、VOI LUT、伪彩表、反色开关）。
- 模型的可复现性声明必须包含渲染参数，否则"用同样的数据同样的模型得到不同结果"会被误判为随机性。
- 责任链中的 `prompt` 快照（§VIII-A）也应记录当时的窗位，否则事后复现推理会失败。

这个问题在自然图像 AI 里不存在，因为 JPEG 就是最终像素；它在医学影像里普遍存在，因为 DICOM 的像素数据与呈现状态是分离的。任何把通用视觉模型迁移到医学影像的工程，都会在某个位置遇到它。

### C. 阈值与后处理的临床非对称性

§IV-D 给出的分结构阈值配置，背后是一个更一般的原则：**通用视觉模型的默认超参数是按"平均意义上好看"调的，而临床代价是非对称的。** 过分割与欠分割在自然图像里对称地损失 IoU，在放疗里一个导致漏照、一个导致过度受量约束，完全不可互换。

同理适用于孤岛移除、边缘平滑、最大连通域筛选这些"看起来无害"的后处理。它们的共同问题是：把统计上罕见的形态当作噪声。而医学影像里，罕见形态恰恰常常是要找的东西——一个孤立的转移灶、一处不连续的浸润、一个术后残腔。**默认开启的后处理，是把这类发现系统性地过滤掉的机制。** 我们的选择是所有后处理默认关闭，按结构显式开启。

### D. 数据治理与供应链

浏览器端推理让像素数据不出工作站，这是 C1 的直接兑现，也是 `inference_site` 字段能作为证据的原因。但有一个容易被忽略的反向缺口：**模型二进制的来源。** 参考实现从公共 CDN 拉取 ONNX 权重，这意味着一台医院工作站要向外网发起 197 MB 的下载。在内网隔离环境下它直接失败；在能出网的环境下它是一个未固定的供应链依赖——权重文件可以被替换，而分割结果的偏移不容易被察觉。

我们的处理是模型必须自托管并做完整性校验：

```typescript
const MODEL_MANIFEST = {
  'sam-b-encoder': {
    url: '/models/sam_vit_b_01ec64.encoder-fp16.onnx',
    sha256: '…',       // 构建时写入，运行时校验
    sizeBytes: 188_743_680,
  },
  'sam-b-decoder': { url: '/models/sam_vit_b_01ec64.decoder.onnx', sha256: '…', sizeBytes: 17_825_792 },
} as const

async function fetchAndVerify(name: keyof typeof MODEL_MANIFEST): Promise<ArrayBuffer> {
  const spec = MODEL_MANIFEST[name]
  const buf = await (await fetch(spec.url)).arrayBuffer()
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))]
    .map((b) => b.toString(16).padStart(2, '0')).join('')
  // 校验失败必须硬失败：一个被替换的权重不会报错，只会静默地给出偏移的边界
  if (digest !== spec.sha256) throw new Error(`[ai] 模型完整性校验失败: ${name}`)
  return buf
}
```

同一条逻辑也适用于通路 B 的模型：模型注册表必须记录权重哈希与来源，且这个哈希要能与审计记录中的 `model_version` 对上。否则"这次分割用的是哪个模型"这句话在事后是无法证实的。

### E. 局限

本文的局限有四。**其一**，精度评测不在报告范围（§IX-E），因此"接受率 `p`"在本文中是一个参数而非实测值；生产环境的 `DECISION` 事件会持续给出它的真实分布，但那需要足够的临床使用积累。**其二**，交互经济性模型假设 `t_m`、`t_v`、`t_r` 在层间独立同分布，而实际上医师在连续接受若干层后会加速（熟悉了形态）、在遇到困难层时会显著变慢，模型给出的是均值意义上的估计。**其三**，系统级基准来自有限的硬件配置，WebGPU 实现的浏览器间差异未做横向对比。**其四**，本文只讨论了 labelmap 形式的分割，未涉及 RTStruct 轮廓表示下的等价问题——两者在拓扑约束（轮廓必须闭合、不自交）上有实质差异。

## XII. 结论

我们提出并实现了一套双通路可提示医学影像分割系统：浏览器内的 SAM 通路承担交互密集的常规分割，院内 GPU 通路承担三维与文本提示模型，两者共享同一套提示语义、预览-审定状态机与 DICOM SEG 产出。系统级基准显示该架构在无 GPU 服务器、影像不出工作站的前提下可提供交互级响应（解码 50–200 ms），代价是每层 1–3 s 的编码开销，而这一开销可通过双会话预编码在接受率 ≤ 0.95 时完全隐藏。

三项设计发现具有超出本实现的价值。**其一是窗宽窗位敏感的缓存键**——当模型输入是渲染结果时，渲染参数必须进入缓存键，否则会产生静默的错误分割；这条原则适用于所有把通用视觉模型迁移到 DICOM 的工程。**其二是交互经济性模型**——它把"AI 辅助是否更快"化归为接受率阈值 `p* = (t_v + t_r) / (t_r + t_m − t_a)`，在典型参数下约 10%，并揭示了两条反直觉结论：加速比在高接受率区间是超线性的，以及模型越准延迟隐藏越难。**其三是临床代价的非对称性**——通用视觉模型的默认阈值与后处理按对称代价调优，与放疗场景的非对称代价不符，应按结构语义分别配置而非全局设定。

后续工作有三个方向：把 `DECISION` 事件的生产数据用于在线标定经济性模型参数并驱动结构级的功能开关；在通路 A 上引入轻量三维一致性约束（例如层间形变正则）以缓解传播漂移；以及把责任链的 `inference_site` 与模型哈希纳入形式化的可验证声明，使数据流向与模型身份成为可自动审计的属性而非文档承诺。

## 参考文献

[1] A. Kirillov, E. Mintun, N. Ravi, et al., "Segment Anything," in *Proc. IEEE/CVF Int. Conf. Comput. Vis. (ICCV)*, 2023, pp. 4015–4026.

[2] J. Ma, Y. He, F. Li, L. Han, C. You, and B. Wang, "Segment anything in medical images," *Nature Communications*, vol. 15, art. 654, 2024.

[3] F. Isensee, P. F. Jaeger, S. A. A. Kohl, J. Petersen, and K. H. Maier-Hein, "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation," *Nature Methods*, vol. 18, no. 2, pp. 203–211, 2021.

[4] J. Wasserthal, H.-C. Breit, M. T. Meyer, et al., "TotalSegmentator: Robust segmentation of 104 anatomic structures in CT images," *Radiology: Artificial Intelligence*, vol. 5, no. 5, e230024, 2023.

[5] N. Ravi, V. Gabeur, Y.-T. Hu, et al., "SAM 2: Segment Anything in Images and Videos," arXiv:2408.00714, 2024.

[6] F. Isensee, M. Rokuss, L. Krämer, et al., "nnInteractive: Redefining 3D Promptable Segmentation," arXiv:2503.08373, 2025.

[7] O. Ronneberger, P. Fischer, and T. Brox, "U-Net: Convolutional networks for biomedical image segmentation," in *Proc. MICCAI*, 2015, pp. 234–241.

[8] E. Ziegler, T. Urban, D. Brown, et al., "Open Health Imaging Foundation Viewer: An extensible open-source framework for building web-based imaging applications to support cancer research," *JCO Clinical Cancer Informatics*, vol. 4, pp. 336–345, 2020.

[9] M. J. Cardoso, W. Li, R. Brown, et al., "MONAI: An open-source framework for deep learning in healthcare," arXiv:2211.02701, 2022.

[10] C. S. Mayo, J. M. Moran, W. Bosch, et al., "American Association of Physicists in Medicine Task Group 263: Standardizing nomenclatures in radiation oncology," *International Journal of Radiation Oncology · Biology · Physics*, vol. 100, no. 4, pp. 1057–1066, 2018.

[11] National Electrical Manufacturers Association, *Digital Imaging and Communications in Medicine (DICOM) Standard, Part 3: Information Object Definitions*, PS3.3, 2024.

[12] A. Fedorov, D. Clunie, E. Ulrich, et al., "DICOM for quantitative imaging biomarker development: a standards based approach to sharing clinical data and structured PET/CT analysis results in head and neck cancer research," *PeerJ*, vol. 4, e2057, 2016.

[13] ONNX Runtime developers, "ONNX Runtime: cross-platform, high performance ML inferencing," https://onnxruntime.ai, 2024.

[14] A. Dosovitskiy, L. Beyer, A. Kolesnikov, et al., "An image is worth 16×16 words: Transformers for image recognition at scale," in *Proc. ICLR*, 2021.

[15] K. He, X. Chen, S. Xie, Y. Li, P. Dollár, and R. Girshick, "Masked autoencoders are scalable vision learners," in *Proc. IEEE/CVF Conf. Comput. Vis. Pattern Recognit. (CVPR)*, 2022, pp. 16000–16009.

[16] V. Vezhnevets and V. Konouchine, "GrowCut: Interactive multi-label N-D image segmentation by cellular automata," in *Proc. Graphicon*, 2005, pp. 150–156.

[17] G. C. Sharp, K. D. Fritscher, V. Pekar, et al., "Vision 20/20: Perspectives on automated image segmentation for radiotherapy," *Medical Physics*, vol. 41, no. 5, 050902, 2014.

[18] C. E. Cardenas, J. Yang, B. M. Anderson, L. E. Court, and K. B. Brock, "Advances in auto-segmentation," *Seminars in Radiation Oncology*, vol. 29, no. 3, pp. 185–197, 2019.

[19] N. Xu, B. Price, S. Cohen, J. Yang, and T. Huang, "Deep interactive object selection," in *Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR)*, 2016, pp. 373–381.

[20] G. Wang, W. Li, M. A. Zuluaga, et al., "DeepIGeoS: A deep interactive geodesic framework for medical image segmentation," *IEEE Trans. Pattern Anal. Mach. Intell.*, vol. 41, no. 7, pp. 1559–1572, 2019.

[21] C. P. Bridge, C. Gorman, S. Pieper, et al., "Highdicom: a Python library for standardized encoding of image annotations and machine learning model outputs in clinical imaging," *Journal of Digital Imaging*, vol. 35, pp. 1719–1737, 2022.

[22] L. Maier-Hein, A. Reinke, P. Godau, et al., "Metrics reloaded: recommendations for image analysis validation," *Nature Methods*, vol. 21, pp. 195–212, 2024.

[23] A. Reinke, M. D. Tizabi, M. Baumgartner, et al., "Understanding metric-related pitfalls in image analysis validation," *Nature Methods*, vol. 21, pp. 182–194, 2024.

[24] W3C GPU for the Web Working Group, *WebGPU*, W3C Candidate Recommendation Draft, 2024.

[25] L. R. Dice, "Measures of the amount of ecologic association between species," *Ecology*, vol. 26, no. 3, pp. 297–302, 1945.

[26] D. P. Huttenlocher, G. A. Klanderman, and W. J. Rucklidge, "Comparing images using the Hausdorff distance," *IEEE Trans. Pattern Anal. Mach. Intell.*, vol. 15, no. 9, pp. 850–863, 1993.

[27] 国家药品监督管理局医疗器械技术审评中心, 《人工智能医疗器械注册审查指导原则》, 2022.

[28] European Parliament and Council, *Regulation (EU) 2017/745 on Medical Devices (MDR)*, 2017.

[29] C. Pinter, A. Lasso, A. Wang, D. Jaffray, and G. Fichtinger, "SlicerRT: radiation therapy research toolkit for 3D Slicer," *Medical Physics*, vol. 39, no. 10, pp. 6332–6338, 2012.

[30] G. A. Ezzell, J. W. Burmeister, N. Dogan, et al., "IMRT commissioning: multiple institution planning and dosimetry comparisons, a report from AAPM Task Group 119," *Medical Physics*, vol. 36, no. 11, pp. 5359–5373, 2009.

[31] E. Mosqueira-Rey, E. Hernández-Pereira, D. Alonso-Ríos, J. Bobes-Bascarán, and Á. Fernández-Leal, "Human-in-the-loop machine learning: a state of the art," *Artificial Intelligence Review*, vol. 56, pp. 3005–3054, 2023.

[32] N. Rieke, J. Hancox, W. Li, et al., "The future of digital health with federated learning," *npj Digital Medicine*, vol. 3, art. 119, 2020.

[33] WHATWG, *File System Living Standard* (Origin Private File System), 2024.

[34] S. Nikolov, S. Blackwell, A. Zverovitch, et al., "Clinically applicable segmentation of head and neck anatomy for radiotherapy: Deep learning algorithm development and validation study," *Journal of Medical Internet Research*, vol. 23, no. 7, e26151, 2021.
