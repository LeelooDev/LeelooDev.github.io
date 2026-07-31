---
title: OHIF Viewer Performance Signals
group: Medical Imaging
coverAlt: A medical imaging workstation on a desktop monitor and tablet
---

Medical viewer performance is not just a first-screen metric. Clinicians notice whether stack scrolling is stable, series switching is immediate, and viewport tools keep their frame rate.

## Measure in stages

1. Study metadata is ready.
2. The Series list is visible.
3. The first frame appears.
4. Prefetch for the active stack completes.
5. Interaction tools become usable.
6. MPR or volume rendering is ready.

Instrument each stage separately and attach Study, Series, instance count, transfer syntax, and device capability as dimensions.

## Common bottlenecks

- Too many simultaneous WADO requests queue in both browser and server.
- Unbounded decoding saturates the main thread or worker queue.
- React state is too coarse, so every scroll step rerenders unrelated components.
- Viewport cleanup leaves caches and event listeners alive.
- MPR initialization copies too much volume data at once.

```ts
const marks = {
  metadataReady: performance.now(),
  firstPixel: 0,
  interactive: 0,
}
```

## Optimization order

Make request scheduling and cancellation correct before adding caches. Reduce unrelated rendering before tuning worker counts. Stabilize 2D scrolling before optimizing peak 3D throughput.

The goal is not the highest benchmark score. It is predictable interaction latency on real hospital networks and ordinary workstations.
