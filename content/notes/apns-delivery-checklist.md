---
title: APNs 推送送达排查清单
date: 2026-07-22
group: iOS 开发
groupOrder: 1
noteOrder: 2
cover: /images/note-apns-delivery-checklist-cover.svg
coverAlt: 手绘风格的推送送达图标
---

推送没有送达时，不要一开始就反复重传。APNs 链路跨越 App、系统、Apple 服务和业务后端，最有效的方法是先确定消息停在哪一层。

## 客户端检查

- 当前构建是否包含正确的 `aps-environment` entitlement。
- 用户是否授权通知，系统设置中是否关闭了提醒样式。
- `registerForRemoteNotifications()` 是否在正确时机调用。
- 后端保存的 token 是否来自当前环境与当前 App。
- token 更新后是否及时覆盖旧值。

设备 token 不是永久标识。安装、恢复备份或系统变化都可能让它更新，客户端每次启动都应该重新注册并把最新值同步给服务端。

## 服务端检查

APNs 返回成功只代表 Apple 接受了请求，不代表用户已经看到通知。至少记录：

```json
{
  "apns_id": "request-id",
  "topic": "com.example.app",
  "environment": "production",
  "status": 200
}
```

如果使用 `.p8` Auth Key，还要确认 Team ID、Key ID、Bundle ID 与目标环境一致。`BadDeviceToken` 通常先查环境和 topic，不要先怀疑 payload。

## 到达但没有展示

前台收到通知时，展示行为由 `UNUserNotificationCenterDelegate` 决定；静默推送还会受到系统调度、电量和使用频率影响。

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
) async -> UNNotificationPresentationOptions {
    [.banner, .sound, .badge]
}
```

最后用同一个 `apns-id` 串起业务请求、APNs 响应和客户端埋点，才能知道消息究竟是没发出、被拒绝、已送达还是未展示。
