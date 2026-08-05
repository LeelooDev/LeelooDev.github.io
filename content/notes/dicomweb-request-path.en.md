---
title: DICOMweb Request Path Quick Reference
group: Medical Imaging
---

The three core DICOMweb services answer different questions: what exists, what should be retrieved, and what should be stored. When image loading fails, first determine whether the failure is in QIDO, WADO, or client-side decoding.

## Three request families

- **QIDO-RS** queries Study, Series, and Instance metadata.
- **WADO-RS** retrieves instances, frames, thumbnails, or rendered output.
- **STOW-RS** uploads DICOM instances.

A typical viewing path is:

```text
patient / study list
  → QIDO Studies
  → QIDO Series
  → QIDO Instances
  → WADO Frames
  → browser decode and display
```

## Metadata checks

Viewer layout commonly depends on:

- Study Instance UID
- Series Instance UID
- SOP Instance UID
- Modality
- Rows / Columns
- Number of Frames
- Transfer Syntax UID

If the list works but pixels do not render, inspect WADO response headers first. Check `Content-Type`, multipart boundaries, transfer syntax, and CORS.

## Performance notes

Measure metadata query, first frame, first interactive viewport, and complete series load separately. One generic page-load number hides the actual bottleneck.

For large series, prioritize frames near the current viewport and request thumbnails separately from diagnostic pixels. Limit concurrent decoding so a fast network does not simply saturate the main thread.
