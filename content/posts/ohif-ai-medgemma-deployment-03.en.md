---
title: "OHIF-AI, Part 3: MedGemma Reporting and the Docker Deployment Path"
excerpt: Add radiology-style report generation to an imaging viewer and deploy the GPU-backed model service with explicit jobs, model versions and health checks.
tags: [OHIF, MedGemma, Docker, Medical Imaging]
coverAlt: A tennis player and racket on a deep blue court
---

OHIF-AI goes beyond segmentation by adding radiology-style text generation from selected CT or MRI data.

Segmentation returns a labelmap that must align with image geometry. Report generation returns text, but its input and safety boundaries are just as important: selected series, slice range, instruction, question and model version.

## Define a typed report request

```ts
interface ReportRequest {
  studyInstanceUID: string
  seriesInstanceUID: string
  startFrame: number
  endFrame: number
  instruction: string
  query: string
  language: 'en' | 'zh'
}
```

Do not send whatever happens to be visible without showing the selected scope. The user should know which series and range the model will examine.

## Use an asynchronous job

Volume preparation and inference may be slow. Submit a job and return an ID:

```json
{
  "job_id": "report-7f31",
  "status": "queued",
  "model": "medgemma-reporting",
  "model_version": "2026-06"
}
```

The client can poll or subscribe to progress. Cancellation should remove queued work and mark running work so a late result is ignored.

## Keep output as a draft

Generated text should enter a review surface, not become a signed clinical report automatically. Preserve:

- model name and version;
- input study and series;
- slice range;
- instruction and query;
- generation time;
- reviewer edits and final disposition.

The interface should clearly label generated content and allow clinicians to accept, edit or discard it.

## Service boundaries

A practical deployment separates:

1. OHIF static assets and viewer APIs.
2. A lightweight AI gateway for authentication, jobs and validation.
3. A GPU inference service with the model and preprocessing code.
4. Object storage or DICOMweb access for image data.

The viewer should not know GPU addresses or model container details.

## Docker image

Pin CUDA, framework and model dependencies. Keep model weights outside the application layer when possible so a small code change does not rebuild a very large image.

```dockerfile
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["python", "-m", "service"]
```

Add readiness checks that verify model loading, not just that the HTTP process started.

## Operational checks

- GPU memory before and after every job.
- Queue depth and wait time.
- Preprocessing and inference duration.
- Failed input validation.
- Cancellation rate.
- Model version in every result.
- No patient identifiers in application logs.

Use representative studies for load testing. A service that handles one small sample may fail on multi-series examinations or long volumes.

The report workflow is complete only when generation, review, provenance, cancellation and deployment health are all visible. Connecting a model endpoint is the smallest part of the system.
