---
title: Debugging CoreBluetooth Connection State
group: iOS Development
coverAlt: A Bluetooth monitoring app beside an indoor sensor
---

In iOS Bluetooth work, the hardest bugs are rarely about discovering a device. They usually come from the system connection, business state, and interface disagreeing with one another. This is the sequence I use whenever a connection becomes unreliable.

## Tighten the state model first

Do not let the business layer depend directly on scattered CoreBluetooth callbacks. Collapse them into a finite set:

- `idle`: scanning has not started or was stopped intentionally.
- `scanning`: looking for the target peripheral.
- `connecting`: a connection request has been sent.
- `discovering`: connected and discovering services and characteristics.
- `ready`: required characteristics are subscribed and data can flow.
- `reconnecting`: recovering after an unexpected disconnect.
- `failed`: the retry limit was reached and user action is required.

Only the `ready` state should allow business commands. `didConnect` confirms the transport link, not that the application protocol is usable.

## Debugging order

1. Confirm permission and `CBCentralManager.state`.
2. Check scan filters and advertised data.
3. Record the order and timing of connect, disconnect, and discovery callbacks.
4. Verify service IDs, characteristic IDs, and read/write properties.
5. Confirm that notification subscription actually succeeded.
6. Inspect protocol parsing last.

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

## Reconnection needs boundaries

Automatic recovery should not call `connect` forever. I normally use exponential backoff and cancel it when the app enters the background, Bluetooth becomes unavailable, or the user disconnects intentionally.

```text
1s → 2s → 4s → 8s → 15s → stop
```

Keep an explicit `disconnectReason` that distinguishes user action, link loss, protocol timeout, and permission changes. Otherwise the interface can only show a vague connection failure.

## Final checks

- All UI state changes happen on the main thread.
- No stale `CBPeripheral` instance is retained.
- A characteristic supports `.notify` before subscribing.
- Reconnection repeats service discovery, subscription, and session recovery.
- Logs include device ID, state, callback name, and elapsed time.

Once the state machine and logs are reliable, an “intermittent” Bluetooth problem usually becomes an ordinary reproducible engineering issue.
