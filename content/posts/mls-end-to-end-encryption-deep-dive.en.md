---
title: "MLS Explained: End-to-End Encryption for Groups of 100,000"
excerpt: Understand how Messaging Layer Security uses a ratchet tree, epochs and a key schedule to reduce group key updates from O(n) to O(log n).
tags: [Security, End-to-End Encryption, MLS, Cryptography, Protocol Design]
coverAlt: A black-and-white photograph of a seated person holding a wired telephone
---

Most end-to-end encryption introductions focus on the Signal protocol: X3DH, the Double Ratchet and forward secrecy. That design is elegant for two participants. Large groups create a different systems problem.

How can every message remain readable only to current members? How does a removed member lose access to future messages? How can a group recover after one device is compromised without sending a separate update to everyone?

MLS, or Messaging Layer Security, is the IETF answer standardized in RFC 9420.

## Why pairwise encryption does not scale

With pairwise sessions, a sender may need to encrypt or distribute key material separately to every participant. Membership changes create work proportional to group size.

For small groups this can be acceptable. At thousands of members, bandwidth, state and consistency become difficult.

MLS organizes members in a balanced binary **ratchet tree**. A member updates secrets along its path to the root, so the amount of new key material grows logarithmically with group size.

## The ratchet tree

Leaves represent members. Parent nodes contain secrets derived from their children. Each member knows the private secrets needed for its own path and enough public information to process other updates.

When one member updates:

1. Generate a fresh leaf secret.
2. Derive new secrets on the direct path to the root.
3. Encrypt path secrets to the relevant sibling subtrees.
4. Commit the new group state.

For `n` members, the path length is approximately `log₂(n)`.

## Epochs make state explicit

An MLS group advances through epochs. Every accepted commit creates a new epoch with fresh keys and membership.

```text
epoch 41
  + Proposal(Add Alice)
  + Proposal(Remove Bob)
  + Proposal(Update Carol)
  → Commit
epoch 42
```

Messages are bound to an epoch. Clients must process proposals and commits consistently before using the new application keys.

## Proposals and commits

Common proposals include:

- `Add`;
- `Update`;
- `Remove`;
- pre-shared key proposals;
- group context extensions.

A committer gathers proposals, creates a new tree path when needed and signs the commit. Other members validate the signature, tree math, confirmation tag and transcript state.

The protocol needs careful handling of concurrent proposals and commits. Delivery services may order messages, but they are not trusted with plaintext or group secrets.

## Key schedule

MLS derives separate secrets for purposes such as:

- application encryption;
- membership authentication;
- confirmation;
- exporter APIs;
- resumption.

Domain separation prevents one class of key material from being reused accidentally in another context.

## Security properties

**Forward secrecy** means later compromise should not reveal old messages after keys are deleted.

**Post-compromise security** means an honest update can restore confidentiality after an attacker temporarily learns one member’s state.

These properties depend on implementation behavior: secure randomness, erasing old secrets, validating commits and advancing state correctly.

## Delivery and authentication services

MLS separates:

- a delivery service that transports group messages;
- an authentication service that binds credentials to identities.

Neither should learn application plaintext. However, metadata such as group size, timing and traffic patterns may remain visible.

## Implementation checklist

- Use a reviewed MLS library rather than implementing cryptography from scratch.
- Persist group state atomically with epoch changes.
- Handle offline clients and missing commits.
- Protect identity credentials and signature keys.
- Enforce key deletion.
- Test membership races, replays and malformed trees.
- Design backup and multi-device behavior deliberately.

MLS does not make large-group encryption simple, but it gives the problem a scalable state machine and a precise security model.
