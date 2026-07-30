---
title: OHIF-AI（三）：MedGemma 报告生成与 Docker 部署链路
date: 2026-06-08
category: code
tags: [OHIF, MedGemma, Docker, 医学影像]
cover: /images/cover-tennis-court.jpg
coverAlt: 深蓝球场上的网球运动员与球拍
excerpt: OHIF-AI 不只做分割，还把 MedGemma 1.5 4B 接进影像浏览器，让用户指定 instruction、query 和切片范围，从 CT/MRI 体数据中生成放射学风格报告。
dek: 报告生成和部署链路说明了 OHIF-AI 的另一面：它既是前端影像工具，也是依赖 GPU、大模型和容器编排的推理系统。
---

OHIF-AI 除了交互式分割，还有一个很有意思的能力：用 MedGemma 1.5 4B 生成放射学风格报告。

这部分功能和分割不同。分割返回的是 labelmap，最终要落回影像视图；报告生成返回的是文本，重点是让模型读取指定范围内的 CT 或 MRI 切片，再根据用户的 instruction 和 query 输出描述、发现或教学式分析。

换句话说，OHIF-AI 不只是"帮我把结构圈出来"，也开始接近"帮我理解这组影像"。

## 前端如何发起报告生成

项目在 longitudinal 模式里加入了 `testMedgemma` 工具入口，并在工具箱里提供 MedGemma 相关状态：

- instruction：定义模型角色和回答风格
- query：用户真正想问的问题
- startSlice 和 endSlice：限制模型要看的切片范围
- medgemmaResult：保存模型返回文本

如果用户没有填写 instruction，前端会给出默认指令，大意是让模型作为医学教学助手，仔细分析给定 CT 切片。query 可以通过弹窗输入，也可以由工具箱表单传入。

最终前端调用 `medGemma` 命令，把参数提交到同一条 `/monai/infer/segmentation` 接口，只是这次 `nninter` 字段会被设置成 `medGemma`，响应类型也从分割用的 arraybuffer 变成文本。

这说明 OHIF-AI 复用了 MONAI Label 的推理接口，把不同任务通过参数分流：同一条入口既能跑分割，也能跑报告生成。

## 后端如何处理 CT/MRI 切片

后端收到 `nnInter == "medGemma"` 后，会进入 MedGemma 分支。

它会先读取 3D 体数据，并根据用户传入的起止切片选择范围。这里用户输入的是 1-indexed 的切片编号，后端会转换成 0-indexed 内部索引，并做边界裁剪。如果 DICOM InstanceNumber 表明切片顺序反向，还会对 slice indices 做反转。

随后后端会按模态做归一化：

- CT 使用窗宽窗位函数，把像素值 window 到 8-bit 图像
- MRI 使用 MRI window 函数，如果有 contrast center/window 就按影像元数据处理

处理后的每张切片会被编码成图片内容，并在图片后追加 `SLICE N` 文本，让模型知道每张图对应的实际切片编号。最后再附上用户 query，组成一个多模态 chat message 交给 MedGemma。

这套处理很重要。医学影像不是普通图片，CT/MRI 原始像素值需要 window 后才适合视觉模型理解；切片编号也必须显式告诉模型，否则报告里的定位会变得模糊。

## MedGemma 的硬件成本

README 里明确提到，MedGemma 大约需要 35GB VRAM。项目代码中也把 MedGemma 的 `device_map` 设置到 `cuda:1`，这意味着作者预期它可以和其他分割模型分配到不同 GPU 上运行。

这点对部署很关键。

如果只是一张小显存 GPU，同时跑 nnInteractive、SAM2、VoxTell、MedSAM2、SAM3 和 MedGemma，很容易遇到显存不足。更合理的方式是把报告生成模型放到独立 GPU，或者根据实际使用场景决定是否启用 MedGemma。

也因此，OHIF-AI 更像是一个 GPU 工作站或实验室服务器上的系统，而不是普通电脑一键运行的小工具。

## Docker Compose 部署结构

项目的 `docker-compose.yml` 编排了三个主要服务。

第一个是 `ohif_viewer`，构建 OHIF Viewer，并通过 Nginx-Orthanc recipe 提供 Web 入口。它暴露 `1026` 作为普通 Web 访问端口，README 里也要求用户打开 `http://localhost:1026`。

第二个是 `orthanc`，使用 `jodogne/orthanc-plugins` 镜像作为 PACS 和 DICOMWeb 支撑。它暴露 `4242` 和 `8042`，并挂载 Orthanc 配置和本地数据库目录。

第三个是 `monai_sam2`，从项目根目录构建 `monai-label/Dockerfile`，启用 NVIDIA runtime，并把 `8002` 暴露出来。这个服务负责模型下载、模型初始化和推理。

`start.sh` 很简单，只有一条命令：`docker compose -f ./docker-compose.yml up --build`。这也说明项目希望通过容器把前端、PACS、推理服务一次性拉起来。

## 模型 checkpoint 和 Hugging Face

OHIF-AI 的模型并不是全部静态打包在仓库里。

README 说明 nnInteractive、SAM2、MedSAM2、VoxTell 和 MedGemma 通常会自动下载；SAM3 则需要用户申请 Hugging Face 权限，并把 checkpoint 放到 `monai-label/checkpoints/sam3.pt`。

代码里也能看到类似逻辑：如果 `sam3.pt` 不存在，后端不会让整个应用崩掉，而是跳过 SAM3 初始化；当前端选择 SAM3 时，后端会返回 `sam3_not_found`，前端再提示用户检查 checkpoint。

这种降级方式比较务实。医学影像 AI 项目依赖多个模型，某一个模型缺失时，其他能力仍然应该可用。

## 使用时要注意什么

OHIF-AI 的部署门槛主要在三个方面。

第一是 GPU 和 CUDA。README 要求 Docker、Docker Compose、NVIDIA Container Toolkit、CUDA 12.6 或兼容版本，以及合适的 NVIDIA 驱动。没有 GPU，这个项目很难发挥实际价值。

第二是模型访问权限。MedGemma 需要 Hugging Face token，SAM3 也需要申请访问并手动放置 checkpoint。部署前要先确认模型权限和下载路径。

第三是医学安全边界。MedGemma 生成的是 AI 辅助文本，不能直接当作临床诊断结论。无论是报告生成还是分割输出，都需要专业人员审核。

## 总结

OHIF-AI 的报告生成和部署链路，展示了医学影像 AI 系统的另一面。

前端看起来只是多了一个 MedGemma 工具箱，但背后涉及 3D 体数据切片选择、CT/MRI window、图片编码、多模态消息构造、大模型推理、GPU 分配和容器编排。

如果说交互式分割解决的是"如何把目标结构圈出来"，那么 MedGemma 解决的是"如何让模型基于影像生成可读的医学文本"。两者合在一起，才让 OHIF-AI 更接近一个完整的浏览器端医学影像 AI 工作流。
