---
title: CoreBluetooth 连接状态排查
date: 2026-07-28
group: iOS 开发
groupOrder: 1
noteOrder: 1
cover: /images/note-corebluetooth-connection-debugging-cover.svg
coverAlt: 手绘风格的蓝牙已连接图标
---

在 iOS 蓝牙开发中，最难排查的通常不是扫描不到设备，而是连接状态在系统、业务层和界面之间不同步。这份笔记记录我处理设备连接异常时固定会走的一套顺序。

## 先把状态模型收紧

业务层不要直接依赖零散的 CoreBluetooth 回调。先把状态收敛为有限集合：

- `idle`：尚未开始扫描或已经主动停止。
- `scanning`：正在查找目标设备。
- `connecting`：已经发起连接，等待系统回调。
- `discovering`：连接完成，正在发现服务和特征值。
- `ready`：关键特征值已经订阅，可以正常收发数据。
- `reconnecting`：异常断开后进入自动重连。
- `failed`：达到重试上限，需要用户介入。

只有进入 `ready` 才能让业务层发送命令。`didConnect` 只代表链路建立，并不代表协议已经可用。

## 排查顺序

1. 确认蓝牙权限和 `CBCentralManager.state`。
2. 检查扫描过滤条件与设备广播数据。
3. 记录连接、断开和服务发现回调的顺序与时间。
4. 验证 Service UUID、Characteristic UUID 以及读写属性。
5. 检查通知订阅是否真正成功。
6. 最后再看业务协议解析。

```swift
func centralManager(
    _ central: CBCentralManager,
    didConnect peripheral: CBPeripheral
) {
    connectionState = .discovering
    peripheral.delegate = self
    peripheral.discoverServices(requiredServiceIDs)
}
```

## 自动重连要有边界

自动重连不是无限调用 `connect`。我通常使用指数退避，并在 App 进入后台、蓝牙关闭或用户主动断开时取消计划。

```text
1s → 2s → 4s → 8s → 15s → stop
```

同时保留一个明确的 `disconnectReason`，区分用户主动断开、系统链路丢失、协议超时和权限变化。否则界面只能显示一个模糊的“连接失败”。

## 最后检查

- 所有状态变化是否都在主线程驱动 UI。
- 是否错误持有了旧的 `CBPeripheral` 实例。
- 订阅通知前是否已确认特征值支持 `.notify`。
- 重连后是否重新发现服务、订阅通知并恢复业务会话。
- 日志里是否包含设备 ID、状态、回调名和耗时。

把状态机和日志打牢后，蓝牙问题通常会从“偶现”变成可以稳定复现和定位的普通工程问题。
