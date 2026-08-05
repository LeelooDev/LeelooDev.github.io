---
title: APNs Delivery Troubleshooting Checklist
group: iOS Development
---

When a notification does not arrive, repeatedly sending it is not a diagnosis. The APNs path crosses the app, the operating system, Apple services, and the business backend. The fastest approach is to identify the layer where the message stopped.

## Client checks

- The build contains the correct `aps-environment` entitlement.
- The user granted permission and did not disable the relevant presentation styles.
- `registerForRemoteNotifications()` runs at the intended point in the lifecycle.
- The backend token belongs to the current environment and application.
- A refreshed token replaces the old value immediately.

A device token is not a permanent identity. Installation, backup restoration, or system changes can refresh it, so the app should register on every launch and synchronize the latest value.

## Server checks

An accepted APNs request does not guarantee that the user saw a notification. At minimum, log:

```json
{
  "apns_id": "request-id",
  "topic": "com.example.app",
  "environment": "production",
  "status": 200
}
```

With a `.p8` authentication key, verify that Team ID, Key ID, Bundle ID, and target environment agree. For `BadDeviceToken`, inspect environment and topic before changing the payload.

## Delivered but not presented

Foreground presentation is controlled by `UNUserNotificationCenterDelegate`. Silent notifications are also subject to system scheduling, battery state, and usage frequency.

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
) async -> UNNotificationPresentationOptions {
    [.banner, .sound, .badge]
}
```

Use the same `apns-id` to connect the business request, APNs response, and client telemetry. That is how you distinguish not sent, rejected, delivered, and not presented.
