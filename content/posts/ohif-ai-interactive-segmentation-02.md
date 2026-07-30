---
title: OHIF-AI（二）：点、线、框和文字提示如何驱动 3D 分割
date: 2026-06-08
category: code
tags: [OHIF, 图像分割, nnInteractive, SAM2, VoxTell]
cover: /images/cover-street-art.jpg
coverAlt: 行人走过巨幅昆虫街头壁画
excerpt: OHIF-AI 的分割体验不是简单点击一次按钮，而是把点、负点、框、套索、涂鸦和文本提示都转成模型交互，让用户可以在浏览器里持续修正 3D 医学影像分割结果。
dek: 分割功能的关键，是把 OHIF 里的 measurement 变成可复用的 AI prompt，再把模型输出重新变成 Cornerstone segmentation。
---

OHIF-AI 最核心的功能，是交互式医学影像分割。

和传统"上传影像，等待模型输出"不同，这个项目把分割做成了一个可以持续互动的过程。用户可以在影像上点一个正点，告诉模型"我要这里"；也可以点负点，告诉模型"不要这里"；可以画框、画套索、画涂鸦；如果不想手动画，也可以输入自然语言，让 VoxTell 根据文本提示给出分割。

这些交互看起来像普通标注工具，但在 OHIF-AI 里，它们其实都是 AI prompt。

## 分割工具箱做了什么

项目在 OHIF longitudinal 模式里加入了 AI 工具箱。这个工具箱不是只放了一个按钮，而是组织了一整套状态：

- 当前使用 `nnInteractive`、`SAM2`、`MedSAM2` 还是 `SAM3`
- 是否开启 Live Mode
- 当前提示是正向还是负向
- 当前操作是在 Refine 旧 segment，还是创建 New segment
- 文本提示分割是替换当前 segment，还是新增 segment
- 工具箱是否锁定

这些状态决定了同一次点击在后端代表什么含义。比如同样是在影像上点一下，如果 Pos/Neg 是正向，它会进入 `pos_points`；如果切到负向，它就会进入 `neg_points`。如果当前是 Refine，新的提示会继续修正 active segment；如果切到 New，就会创建一个新的 segment number。

这也是交互式分割比普通自动分割复杂的地方：用户的每一次操作都不是孤立输入，而是和当前分割状态绑定在一起。

## nnInteractive：支持更丰富的提示

在 OHIF-AI 里，nnInteractive 是最完整的交互分割路径。

后端 `basic_infer.py` 初始化了 `nnInteractiveInferenceSession`，并维护当前序列的 session image、target buffer 和已经使用过的交互提示。当前端传来点、框、套索、涂鸦时，后端会判断这些 prompt 是否已经使用过，避免重复加入同一个交互。

点提示会调用 point interaction，框提示会调用 bbox interaction，套索会先通过扫描线填充成 3D mask，涂鸦会被清理、加密采样并膨胀成小球形区域，再加入 scribble interaction。

这说明 OHIF-AI 并不是简单把鼠标坐标扔给模型。它做了医学影像方向和切片顺序处理，也会在 DICOM InstanceNumber 方向反转时修正 z 轴坐标，保证用户看到的切片和模型处理的体数据方向一致。

## SAM2、MedSAM2、SAM3：更聚焦点和框

SAM 系列模型在项目里的路径相对克制。

前端会明确提示：SAM2、MedSAM2、SAM3 目前主要接受正负点和正向 bounding box。也就是说，如果用户画了套索或涂鸦，这些交互不会作为 SAM 系列模型的有效 prompt。

后端会根据前端传来的 `medsam2` 字段选择 predictor：

- `sam2` 使用 SAM2 predictor
- `medsam2` 使用 MedSAM2 predictor
- `sam3` 使用 SAM3 tracker，如果 checkpoint 不存在，就返回 `sam3_not_found` 提示

这套逻辑让用户可以在同一个工具箱里切换模型，但每个模型仍然保留自己的能力边界。nnInteractive 适合更丰富、更连续的交互；SAM 系列模型适合点和框驱动的快速分割。

## VoxTell：用自然语言做分割

OHIF-AI 还支持文本提示分割，使用的是 VoxTell。

用户点击 Text Prompt 后，前端会弹出输入框。输入内容会作为 `texts` 参数传给同一条 MONAI Label 推理接口。后端检测到 `texts` 不为空且不是 MedGemma 请求时，会进入 VoxTell 路径。

这里有一个重要细节：后端会先记录原始 DICOM 方向，把影像转成 RAS 方向送入 VoxTell，得到分割后再把结果转回原始方向。这一步对医学影像非常重要，因为模型内部方向和 DICOM 显示方向如果不一致，mask 就可能出现在错误切片或错误位置。

VoxTell 的优势是交互门槛低。用户不用先画点或框，只需要输入类似器官、病灶或区域描述，就可以获得初始分割。它更适合快速生成候选结果，再通过其他工具继续检查和修正。

## Live Mode 为什么重要

Live Mode 让整个分割体验更接近"边画边出结果"。

前端命令模块订阅了 measurement added 事件。当用户新增 Probe、Freehand、Rectangle 等 AI prompt 工具，并且 Live Mode 开启时，系统会自动触发分割命令。这样用户不需要每次画完都手动点 run segmentation。

但 Live Mode 也带来状态管理压力。项目里加入了 locked 状态，锁定后会强制切回 Pan，并关闭 live 推理，避免用户无意中继续触发 GPU 推理。对于医学影像 AI 这类高成本推理任务，这种控制很有必要。

## 从模型结果回到影像视图

分割成功后，前端不会只显示"完成"。

命令模块会解析后端响应，创建或更新 Cornerstone segmentation，把返回的 labelmap 绑定到当前 display set，并更新 segment、active segment、统计信息和多视口显示。对于 3D viewport，还会更新 labelmap image references，触发表面或体渲染相关刷新。

这一步决定了用户是否真的能使用 AI 结果。医学影像分割不是只要一张 mask，而是要能在原始 DICOM 视口里显示、隐藏、切换、修正、测量和继续管理。

## 总结

OHIF-AI 的交互式分割设计，核心是把"标注工具"升级成"模型提示工具"。

点、负点、框、套索、涂鸦和文本输入，都被整理成后端模型可消费的 prompt；后端模型输出又被重新放回 OHIF 的 segmentation 体系。

这让分割不再是一次性的自动推理，而是一个持续的、人机协同的影像处理过程：用户给提示，模型生成结果，用户继续修正，系统把结果保留在可管理的医学影像视图里。
