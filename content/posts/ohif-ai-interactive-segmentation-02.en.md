---
title: "OHIF-AI, Part 2: Driving 3D Segmentation with Points, Lines, Boxes and Text"
excerpt: Convert OHIF measurements into reusable model prompts and return 3D results as native Cornerstone segmentations that users can refine continuously.
tags: [OHIF, Image Segmentation, nnInteractive, SAM2, VoxTell]
coverAlt: A pedestrian passing a large insect mural
---

The core experience in OHIF-AI is interactive medical image segmentation.

Instead of uploading a study and waiting for one final mask, the user can refine a result over time. A positive point says “include this area.” A negative point says “exclude this area.” Boxes, lassos and scribbles provide larger spatial hints, while text prompts describe the target structure.

## Treat every interaction as a prompt

A normalized prompt can separate viewer tools from model-specific transport:

```ts
type SegmentationPrompt =
  | { type: 'point'; world: Point3; label: 'positive' | 'negative' }
  | { type: 'box'; min: Point3; max: Point3 }
  | { type: 'scribble'; points: Point3[]; label: 'positive' | 'negative' }
  | { type: 'text'; value: string }
```

The adapter is responsible for converting viewport measurements into world or image coordinates and preserving the referenced frame of reference.

## Coordinate systems are the real difficulty

An interaction may begin in:

- canvas coordinates;
- viewport world coordinates;
- image index coordinates;
- voxel coordinates expected by the model.

Always keep orientation, spacing, origin and direction cosines. A mask that appears rotated or shifted is usually a geometry conversion problem, not a model problem.

## Build an iterative job

A useful segmentation job stores:

- study, series and frame-of-reference IDs;
- model name and version;
- accumulated prompts;
- selected segment;
- current labelmap revision;
- status and progress.

When the user adds a new prompt, send the complete prompt state or a versioned delta, depending on the model API. Reject out-of-order results.

```ts
if (result.revision !== activeJob.revision) {
  return
}
```

This prevents an older, slower inference from overwriting a newer correction.

## Apply results through the segmentation service

Do not paint model output directly into a canvas. Convert it into the viewer’s segmentation representation so opacity, visibility, segment selection, statistics and export continue to work.

The conversion path should validate:

- volume dimensions;
- scalar type;
- frame of reference;
- segment label values;
- geometry alignment.

## Design correction controls

The user needs to:

- add positive and negative prompts;
- undo the last prompt;
- clear prompts without deleting the segment;
- rerun after changing text;
- accept the current result;
- cancel an active job.

Feedback should distinguish prompt geometry from the generated segmentation. Otherwise the user cannot tell whether they are editing instructions or pixels.

## Performance and transport

Avoid uploading an entire volume for every correction. Cache model-side image embeddings or volume state behind a job/session ID. Send only prompts after initialization when the model supports it.

Compress masks or transfer them as binary data. A huge JSON array of voxel values wastes network and parsing time.

Interactive segmentation succeeds when users can correct the system cheaply. The model does not need to be perfect on the first click; the workflow needs to make every correction fast, visible and reversible.
