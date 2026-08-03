---
title: OHIF Viewer 性能观察点
date: 2026-07-06
group: 医学影像
groupOrder: 3
noteOrder: 2
cover: /images/note-ohif-viewer-performance-cover.svg
coverAlt: 手绘风格的性能仪表图标
---

医学影像 Viewer 的性能不能只看首屏。医生真正感知的是切片滚动是否稳定、切换序列是否及时，以及工具操作时视口会不会掉帧。

## 分阶段测量

1. Study 元数据完成。
2. Series 列表可见。
3. 首帧显示。
4. 当前 stack 预取完成。
5. 交互工具可用。
6. MPR 或体渲染准备完成。

每个阶段分别打点，并把 Study、Series、实例数量、传输语法和设备能力作为维度。

## 常见瓶颈

- 同时发起过多 WADO 请求，浏览器连接池和服务端都排队。
- 解码任务没有限流，主线程或 worker 队列被占满。
- React 状态粒度过大，滚动一帧导致无关组件重新渲染。
- viewport 销毁后缓存和事件监听没有释放。
- MPR 初始化时一次性复制过多体数据。

```ts
const marks = {
  metadataReady: performance.now(),
  firstPixel: 0,
  interactive: 0,
}
```

## 优化顺序

先让请求调度和取消正确，再做缓存；先减少无关渲染，再调整 worker 数；先保证 2D 滚动稳定，再优化 3D 的峰值速度。

性能优化的目标不是跑分最高，而是在真实医院网络和普通工作站上保持可预测的交互延迟。
