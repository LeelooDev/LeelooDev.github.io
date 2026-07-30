---
title: OHIF-AI（一）：把医学影像 AI 放进浏览器
date: 2026-06-08
category: code
tags: [OHIF, 医学影像, AI, MONAI Label]
cover: /images/cover-architecture.jpg
coverAlt: 光影交错的现代建筑结构
excerpt: OHIF-AI 不是单独做一个 AI Demo，而是把交互式分割、文本提示分割和报告生成接进 OHIF Viewer，让医生或研究人员在浏览器里完成影像查看、提示、推理和结果回填。
dek: 从项目结构看，OHIF-AI 的核心价值是把医学影像阅片界面和后端基础模型推理服务接成一个完整工作流。
---

OHIF-AI 这个项目的重点，不是重新造一个影像浏览器，也不是只封装一个模型接口，而是把 AI 能力放进一个医生和研究人员已经熟悉的工作界面里。

项目基于 OHIF Viewer，前端仍然是浏览器里的 DICOM 影像查看、窗宽窗位、分割面板、工具栏和多视图布局；后端则通过 MONAI Label 承接 nnInteractive、SAM2、MedSAM2、SAM3、VoxTell 和 MedGemma 1.5 4B 等模型。用户看到的是一个普通影像工作站式界面，但点击点、画框、画线、输入文本之后，背后会把这些交互转换成模型可理解的提示，再把结果作为分割体或文本报告返回。

这就是 OHIF-AI 最值得关注的地方：它没有把 AI 做成一个孤立页面，而是把 AI 变成了阅片工作流的一部分。

## 项目由三块组成

从目录结构看，OHIF-AI 主要由三部分组成。

第一部分是 `Viewers`，也就是 OHIF Viewer 前端。这里保留了 OHIF 原有的模式、扩展、工具栏和 Cornerstone 渲染体系，同时在 longitudinal 模式里加入了新的 AI 工具箱。用户可以在右侧分割面板中选择模型、开启 Live Mode、切换正负提示、选择 Refine 或 New，并触发 AI 分割或报告生成。

第二部分是 `monai-label`，它是后端推理服务的核心。项目在 MONAI Label 的基础推理任务里初始化多个模型，并通过 `/monai/infer/segmentation` 这条链路接收前端传来的点、框、套索、涂鸦、文本提示、切片范围等参数。

第三部分是 `sam2`、`sam3` 和模型 checkpoint 相关内容。这些不是普通依赖，而是项目能力边界的一部分。SAM2、MedSAM2、SAM3 负责点和框类提示的分割能力；nnInteractive 支持点、框、套索和涂鸦；VoxTell 支持自然语言文本提示；MedGemma 则面向 CT/MRI 切片生成放射学风格报告。

## 为什么要接在 OHIF 里

医学影像 AI 的难点，不只是模型能不能分割出目标，而是结果能不能被真正放进影像工作流。

如果模型只输出一张 mask 图片，用户还要自己对齐 DICOM、判断切片顺序、导入分割结果、调整标签显示，这个工具就很难进入真实使用场景。OHIF-AI 的前端命令模块会把后端返回的 labelmap 重新注入 Cornerstone segmentation 状态，保留 active segment、segment number、可见性、统计信息和多视口显示。

也就是说，模型结果不是停留在"推理成功"这一步，而是回到了用户正在看的影像视口中。

这对医学影像工具非常关键。医生或研究人员真正需要的是：在影像上点一下，模型给出结果；结果不满意，再加一个负点或涂鸦继续修；需要新结构，就切到 New；需要报告，就指定切片范围并让模型生成文本。这个过程必须连贯，不能频繁跳出浏览器或切换工具。

## 前端和后端怎么连起来

前端的 AI 工具箱保存了一组全局状态：当前模型、Live Mode、正负提示、Refine/New、锁定状态、MedGemma 的 instruction、query 和切片范围。用户的点击、框选和自由线不会直接发给模型，而是先作为 OHIF measurement 存在。

当用户点击 run segmentation，或者 Live Mode 检测到新 measurement 后，命令模块会读取当前序列、当前视口、当前 active segment 和所有相关 measurement，然后整理成 MONAI Label 表单参数。

例如点提示会变成 `pos_points` 或 `neg_points`，矩形会变成 `pos_boxes`，自由线和套索会进入 nnInteractive 的交互参数。前端把这些数据 POST 到 `/monai/infer/segmentation?image=...&output=dicom_seg`，后端完成推理后返回结果，前端再完成分割回填。

这种结构的好处是清晰：OHIF 负责影像交互和结果展示，MONAI Label 负责模型推理和医学影像数据处理，中间通过 DICOM SeriesInstanceUID 和表单参数连接。

## 它适合什么场景

OHIF-AI 更适合研究、原型验证和医学影像 AI 工作流探索，而不是一个拿来就能直接进入临床生产的系统。

原因很直接：项目依赖 GPU、CUDA、NVIDIA Container Toolkit 和多个大模型 checkpoint，MedGemma 还需要较高显存；同时，医学报告生成和自动分割都需要严格验证，不能把模型输出直接等同于诊断结论。

但作为技术方案，它展示了一个很重要的方向：影像 AI 不应该只停留在 notebook 或离线脚本里，而应该进入医生真实操作的影像界面。提示、推理、修正、保存、显示和报告生成，应该在同一个工作流中完成。

## 总结

OHIF-AI 的价值不在于某一个模型，而在于把多个模型放进了一个可操作的医学影像前端。

它把 OHIF Viewer、Cornerstone segmentation、MONAI Label、nnInteractive、SAM 系列模型、VoxTell 和 MedGemma 串成一条工作流：用户在浏览器里操作影像，后端模型根据提示推理，结果再回到原来的影像视图。

这类项目代表了医学影像 AI 一个更实用的方向：不是让 AI 替代影像工作站，而是让 AI 成为影像工作站里可调用、可修正、可追踪的一组工具。
