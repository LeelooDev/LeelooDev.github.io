---
title: "OHIF-AI, Part 1: Bringing Medical Imaging AI into the Browser"
excerpt: Connect interactive segmentation, text-prompted models and report generation to OHIF Viewer so inference becomes part of the imaging workflow.
tags: [OHIF, Medical Imaging, AI, MONAI Label]
coverAlt: A modern architectural structure with strong light and shadow
---

OHIF-AI is not a separate AI demo beside an imaging viewer. Its value comes from putting model capabilities inside the interface clinicians and researchers already use.

The frontend keeps the familiar DICOM workflow: viewports, windowing, series navigation, segmentation panels, tools and multi-layout review. The backend uses MONAI Label to expose models such as interactive segmentation, text-prompted segmentation and medical report generation.

## Three system areas

```text
OHIF Viewer extension
  ↔ AI service client
  ↔ MONAI Label applications and models
```

The viewer owns interaction and presentation. The service client translates product actions into stable requests. The model service manages inference, devices and model-specific preprocessing.

Keeping these boundaries explicit prevents the React extension from accumulating model deployment details.

## Interaction becomes model input

A user can:

- click a positive or negative point;
- draw a box or freehand region;
- select a series and slice range;
- enter a text description;
- request a report for the current study.

The extension converts those actions into coordinates, labels, image references and request metadata. A successful response must then become native Cornerstone segmentation or structured report state.

## Viewer integration

A feature usually touches:

- extension registration;
- commands;
- toolbar buttons;
- panels;
- services and events;
- viewport or segmentation state.

The command should remain small:

```ts
async function runInteractiveSegmentation(args: PromptArgs) {
  const request = promptAdapter.fromViewport(args)
  const result = await aiService.segment(request)
  segmentationAdapter.apply(result)
}
```

Adapters isolate changes in viewport representation, transport format and model output.

## Long-running inference needs product state

Model calls can take seconds or minutes. The interface should model:

- queued;
- uploading;
- running;
- applying result;
- completed;
- cancelled;
- failed.

Progress needs a cancellable job ID rather than an indefinite spinner. The user must be able to change views without leaving stale callbacks that later apply a result to the wrong viewport.

## Protect imaging data

Decide whether the service receives DICOM instances, rendered pixels, volume references or object-storage URLs. Each choice affects privacy, latency and deployment.

- Use authenticated, short-lived references.
- Minimize patient identifiers.
- Keep model logs free of protected health information.
- Record model version and input series for audit.
- Validate that results belong to the current study before applying them.

## A useful first slice

Implement one point-prompted segmentation model end to end:

1. Select a viewport and series.
2. Capture one positive point.
3. Submit a typed job.
4. Poll or stream progress.
5. Convert the returned labelmap.
6. Display it as a native segmentation.
7. Support cancellation and cleanup.

Once this slice is stable, boxes, scribbles, text prompts and report generation can reuse the same job and result boundaries.

The central design decision is simple: AI should feel like another imaging tool, not a separate destination that forces users out of their clinical context.
