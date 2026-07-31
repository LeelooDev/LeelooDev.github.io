---
title: A Complete Guide to Replacing Expiring iOS Push Certificates
excerpt: Replace yearly APNs certificate renewal with an APNs authentication key and configure Apple Developer and JPush correctly for a durable setup.
tags: [iOS, JPush, APNs, Push Notifications]
coverAlt: Two swans on a blue lake
---

> A durable approach is to use an APNs authentication key (`.p8`) instead of renewing a `.p12` certificate every year.

## What actually expires?

JPush itself does not issue the Apple push credential. The expiring item is the APNs certificate uploaded for your iOS application.

Apple supports two authentication methods:

- a certificate exported as `.p12`;
- a token-signing key downloaded as `.p8`.

The certificate normally expires and is tied to application/environment configuration. A `.p8` key does not have the same annual expiration cycle and can support multiple applications under the team.

## Before creating a key

Confirm:

- Apple Developer team access;
- the application Bundle ID;
- Push Notifications capability is enabled;
- the JPush application points to the same Bundle ID;
- you know whether the target build is development or production.

Record the Team ID and prepare a secure place for the key. Apple only allows the `.p8` file to be downloaded once.

## Create the APNs key

In Apple Developer:

1. Open Certificates, Identifiers & Profiles.
2. Select **Keys**.
3. Create a new key with a descriptive internal name.
4. Enable **Apple Push Notifications service (APNs)**.
5. Register and download the `.p8` file.
6. Record the Key ID and Team ID.

Do not commit the key to Git or place it inside the iOS application bundle.

## Configure JPush

In the iOS push configuration, choose token-based authentication and provide:

- the `.p8` key file;
- Key ID;
- Team ID;
- Bundle ID;
- the correct APNs environment.

The environment must match the device token. A development token sent through the production endpoint commonly produces `BadDeviceToken`.

## Verify the application

The app target should include:

- Push Notifications capability;
- the correct signing team;
- the expected `aps-environment` entitlement;
- notification authorization;
- remote notification registration.

```swift
UNUserNotificationCenter.current()
    .requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
        guard granted, error == nil else { return }
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
```

Send the refreshed device token to your backend every time registration succeeds.

## Test the complete path

Use a physical device and verify:

1. The application uploads a current token.
2. JPush accepts the audience and payload.
3. APNs accepts the request.
4. The device receives it in background.
5. Foreground presentation works through the notification delegate.
6. Tapping the notification opens the intended route.

Record JPush message ID, APNs response and client event so failures can be traced across systems.

## Security notes

An APNs key is long-lived and powerful. Limit access, store it in a secret manager, document its owner and create a rotation/revocation procedure. Durable does not mean maintenance-free.

Once token authentication is configured and verified, annual certificate expiry disappears from the release checklist while the delivery path remains explicit and auditable.
