---
title: DICOMweb 请求链路速查
date: 2026-07-11
group: 医学影像
groupOrder: 3
noteOrder: 1
cover: /images/project-medical-imaging-assistant-cover.webp
coverAlt: 手机与平板上的医学影像查看界面
---

DICOMweb 的三个核心服务分别解决“查什么、取什么、存什么”。遇到影像加载问题时，先确定失败发生在 QIDO、WADO 还是前端解码。

## 三类请求

- **QIDO-RS**：查询 Study、Series、Instance 元数据。
- **WADO-RS**：获取实例、帧、缩略图或渲染结果。
- **STOW-RS**：上传 DICOM 实例。

典型查看链路是：

```text
患者/检查列表
  → QIDO Studies
  → QIDO Series
  → QIDO Instances
  → WADO Frames
  → 浏览器解码与显示
```

## 元数据检查

前端布局通常至少依赖：

- Study Instance UID
- Series Instance UID
- SOP Instance UID
- Modality
- Rows / Columns
- Number of Frames
- Transfer Syntax UID

如果列表正常但图像打不开，先抓 WADO 响应头，检查 `Content-Type`、multipart boundary、transfer syntax 和跨域设置。

## 性能记录

分别记录元数据查询、首帧、首个可交互视口和完整序列加载耗时。不要只用一个“页面加载时间”覆盖所有阶段。

对大序列优先加载当前视口附近的帧，缩略图和诊断帧分开请求；同时限制并发解码任务，避免网络很快但主线程被压满。
