---
title: Intelligent Medical Image Segmentation Research
group: Medical Imaging
coverAlt: Intelligent medical image segmentation research workspace
---

> Written to the conventions of an original research article for IEEE TMI / Medical Image Analysis: abstract, index terms, numbered sections, numbered figures and tables, and a full reference list. The subject is a deployed browser-resident promptable segmentation system — its architecture, its cost model, and its engineering boundaries.

**Abstract**—Interactive deep segmentation is shifting from a contest over model accuracy toward the engineering of human–machine collaboration efficiency, yet mainstream implementations still place inference on the server. The price is that images must leave the workstation, that deployment requires a GPU room, and that offline operation simply fails. This paper presents and implements a **dual-path promptable segmentation architecture**. An ONNX export of the Segment Anything Model (SAM) runs the full encode–decode pipeline inside the browser over WebGPU/WASM, while an optional on-premise GPU path carries heavyweight volumetric models such as nnInteractive, MedSAM2, and VoxTell. We make three concrete contributions. (i) A **three-tier cache hierarchy** (in-memory Map / OPFS / Cache API) together with its capacity analysis, showing that an image embedding costs eight times its source slice in storage, and deriving a quota-plus-eviction policy from that fact. (ii) A **window-level-sensitive cache key**, correcting a semantic error in keying embeddings by SOPInstanceUID alone: what enters the encoder is an 8-bit resampling of a windowed image, so the same anatomy under a different window yields a different embedding, and reusing it produces silently wrong segmentations. (iii) An **interaction economics model** that reduces the question "is AI assistance actually faster?" to a closed-form acceptance-rate threshold, `p* = (t_v + t_r) / (t_r + t_m − t_a)`, which for typical organ-contouring parameters evaluates to roughly 9.8%, together with a closed-form speedup curve. System-level benchmarks show 1–3 s per frame for encoding and 50–200 ms per invocation for decoding under WebGPU, sub-second warm model loads, and a resident memory increment of roughly 250–300 MB. We further show that double-session pre-encoding fully hides encoding latency at acceptance rates up to 0.95, and we discuss error accumulation when a 2D foundation model performs 3D propagation, the asymmetric clinical cost of probability thresholding, and a minimal verifiable provenance design under the premise that the model proposes and the clinician decides.

**Index Terms**—Medical image segmentation, promptable segmentation, Segment Anything Model, browser-resident inference, ONNX Runtime, WebGPU, human-in-the-loop, DICOM SEG, radiotherapy contouring, cache hierarchy, provenance.

## I. Introduction

Medical image segmentation assigns voxels to anatomical or pathological classes, and it is the shared prerequisite of quantitative imaging, surgical planning, and radiotherapy treatment planning. In radiotherapy the cost of this step is particularly conspicuous: a planning CT typically contains 300–400 slices, on each of which a physician must delineate targets (GTV/CTV/PTV) and organs at risk (OARs). Roughly half of a radiation oncologist's working day goes into this activity [17], [18]. Online adaptive radiotherapy (oART) pushes the conflict to its limit — the patient lies on the treatment couch while re-contouring and re-planning must complete in minutes, a timescale the manual path cannot physically meet.

Over the past decade the accuracy problem in fully automatic segmentation has been broadly solved by U-Net [7] and its self-configuring successor nnU-Net [3], with TotalSegmentator [4] turning automatic delineation of more than a hundred CT structures into an off-the-shelf capability. Clinical adoption, however, has not followed accuracy. Three reasons stand out. First, fully automatic failure is **silent** — the model does not tell you which slice went wrong. Second, the structure set is **closed** — a structure absent at training time will be absent at inference time. Third, accountability is **unattached** — a treatment plan must ultimately be signed by a responsible clinician, and a black-box output cannot carry that signature.

Attention has therefore moved to **promptable segmentation**: rather than deciding boundaries alone, the model accepts points, boxes, scribbles, or text, returning the decision of *what to segment* to a human. SAM [1] turned this paradigm into a general foundation model using 11 million images and 1.1 billion masks; MedSAM [2], MedSAM2, and nnInteractive [6] carried it into medical and volumetric data. The fit with clinical practice is natural: every click is a decision, and every model output is **a proposal that can be overruled on the spot**.

Almost every engineering realization of promptable segmentation, however, assumes **server-side inference**: upload the image, run on the GPU, return the mask. That default introduces three frictions. The first is **data governance** — once images leave the workstation they enter a different security domain, and hospital IT must run a separate approval process. The second is **deployment cost** — a GPU server plus container orchestration is a real barrier for a primary-care hospital, and a large share of the nearly one thousand linear accelerators added under China's 14th Five-Year Plan sit precisely in such institutions. The third is **availability** — network isolation, jitter, or GPU queueing each turn "real-time interaction" into "waiting".

Our starting point is to **move the ordinary promptable-segmentation path wholesale into the browser**, falling back to an on-premise GPU only for volumetric inference and text prompting. This is not a front-end port of a server design, because the browser is a far more constrained execution environment: no CUDA, memory bounded in single-digit gigabytes, storage mediated by OPFS and the Cache API, and GPU access necessarily serialized. Those constraints in turn expose a class of design problems that never surface server-side, several of which generalize well beyond this implementation.

Our contributions are as follows.

1. **A dual-path architecture** (§III). The in-browser SAM path carries interaction-dense 2D promptable segmentation and slice propagation; the on-premise GPU path carries volumetric and text-driven models. Both share one prompt vocabulary, one preview–sign-off state machine, and one DICOM SEG output format, so the interaction layer is agnostic to where inference happens.
2. **A three-tier cache and its capacity analysis** (§V). We derive the exact embedding footprint (4 MiB per frame), show it is eight times a 512×512 int16 source slice, note that full-series caching of a 400-slice study reaches 1.6 GiB, and derive a per-study quota with LRU eviction rather than unbounded persistence.
3. **A window-level-sensitive cache key** (§V-C). We show that keying by `<model>/<studyUID>/<seriesUID>/<instanceUID>` is semantically wrong for medical images, because the encoder input is a windowed 8-bit RGB rendering, and we give a quantized composite key plus a write-debounce policy.
4. **An interaction economics model** (§VI-D, §X-C). This reduces "is AI assistance faster?" to a closed-form acceptance threshold. It depends on no model-specific accuracy metric — only on directly measurable interaction times — and can therefore serve as an on-site criterion for whether a tool is worth enabling.
5. **A minimal verifiable provenance design** (§VIII). Four audit event classes plus state-transition constraints make "who decided this contour" reconstructible and defensible at the data layer.

## II. Related Work

### A. From fully automatic to promptable

Ronneberger et al.'s U-Net [7] established the encoder–decoder-with-skip-connections paradigm; Isensee et al.'s nnU-Net [3] demonstrated that with sufficient automatic configuration this classical architecture remains a strong baseline across the great majority of medical segmentation tasks. Wasserthal et al.'s TotalSegmentator [4] engineered that capability into an open tool spanning more than a hundred structures. The shared premise of this line is that **the class set is fixed at training time**.

Interactive segmentation has a longer history. GrowCut [16] grows regions from seed points using cellular automata and remains a practical choice for "one-click" tools to this day, because it needs no model, no GPU, and runs in tens of milliseconds in the browser. Deep interactive segmentation was opened by Xu et al. [19], and DeepIGeoS [20] introduced geodesic distance into interactive refinement. Kirillov et al.'s SAM [1] was the watershed: it promoted the prompt to a first-class input and used data at unprecedented scale to make zero-shot generalization usable. SAM 2 [5] extended this to video — for medicine, effectively inter-slice propagation; MedSAM [2] performed domain adaptation on large-scale medical data; nnInteractive [6] unified volumetric promptable segmentation across point, scribble, lasso, and box prompts.

### B. Where inference lives: server, edge, browser

MONAI [9] and MONAI Label define the de facto interface for server-side medical AI: model registry, session cache, inference endpoints, active learning. Integration projects of the OHIF-AI kind orchestrate nnInteractive, SAM2, MedSAM2, VoxTell, and MedGemma behind one backend, with the front end calling over REST. The strength of this route is that models are unconstrained — anything in the PyTorch ecosystem is admissible. The weaknesses are those enumerated in §I.

Browser-resident inference became realistic with ONNX Runtime Web [13] and WebGPU [24]. Its boundary is sharp: the model must export to ONNX, its parameter count is bounded by what can be downloaded and resident in memory, and all GPU work must serialize on a single queue. SAM's ViT-B encoder [14], [15] is roughly 180 MB after FP16 quantization and its decoder roughly 17 MB, which lands inside that feasible region; ViT-L (1.22 GB) and ViT-H (2.38 GB) fall outside it.

### C. Viewers and standardized output

OHIF Viewer [8] and its underlying Cornerstone3D supply the complete web infrastructure for DICOM browsing, multiplanar reconstruction, and segmentation overlay rendering. Standardized output depends on DICOM SEG (SOP Class `1.2.840.10008.5.1.4.1.1.66.4`) [11]; Fedorov et al. [12] and Bridge et al. [21] argued its advantages over research formats such as NIfTI from the quantitative-imaging and encoding-implementation sides respectively. A SEG object carries a reference to its source series, per-frame geometry, algorithm type, and structure semantics, and can therefore be written back to PACS and consumed by a downstream TPS directly. On the radiotherapy side, structure naming must follow AAPM TG-263 [10], or cross-system handoff degrades into manual mapping.

### D. Evaluation methodology

Maier-Hein et al. [22] and Reinke et al. [23] systematically catalogued the metric pitfalls of image-analysis validation: the Dice coefficient [25] has enormous variance on small structures, and the Hausdorff distance [26] is extremely sensitive to single outliers — precisely the two metrics segmentation papers most often report. Interactive systems add a further wrinkle: **the final artifact is a joint human–machine product**, so reporting the Dice of the model's raw output says little about the value of the system. This motivates the interaction economics model of §VI-D, which substitutes directly measurable interaction times for accuracy metrics that are hard to attribute.

## III. System Architecture

### A. Design constraints

The architecture is derived backwards from four constraints.

- **C1 Data stays inside the boundary.** On the ordinary interaction path, pixel data must not leave the browser process.
- **C2 Zero GPU required.** An institution with no GPU server must be able to use the ordinary path in full.
- **C3 Model neutrality.** Replacing or adding a model must not alter the interaction layer or the output format.
- **C4 A proposal is not a conclusion.** No model output may enter exportable segmentation data before a clinician explicitly accepts it.

C1 and C2 jointly force browser-resident inference as the default path. C3 requires that prompt semantics and output format be fixed before any model is chosen. C4 requires that "preview" be a first-class state independent of segmentation data, rather than something written first and undone afterwards.

### B. Layered structure

<figure class="diagram">
<svg viewBox="0 0 800 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Layered system architecture: interaction layer, orchestration layer, dual inference paths (in-browser ONNX and on-premise GPU), and the storage and output layer, showing the full chain from prompt through preview and sign-off to DICOM SEG write-back">
<defs>
<marker id="mseg1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<text x="24" y="22" font-size="11" fill="#6b6e76">Dark blocks = steps the clinician performs or decides; dashed blocks = optional components the system works without</text>
<rect x="24" y="36" width="752" height="76" rx="12" fill="none" stroke="#c4c6cd" stroke-width="1.3" stroke-dasharray="6 5"/>
<text x="36" y="54" font-size="11" fill="#6b6e76" font-weight="600">Interaction layer · browser</text>
<g fill="#25262b">
<rect x="46" y="60" width="150" height="40" rx="9"/>
<rect x="218" y="60" width="150" height="40" rx="9"/>
<rect x="390" y="60" width="150" height="40" rx="9"/>
</g>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="562" y="60" width="192" height="40" rx="9"/>
</g>
<g text-anchor="middle" font-size="11.5" fill="#ffffff" font-weight="600">
<text x="121" y="78">Place points / box</text>
<text x="293" y="78">Review preview</text>
<text x="465" y="78">Enter accept · Esc reject</text>
</g>
<g text-anchor="middle" font-size="11.5" fill="#25262b">
<text x="658" y="78">Manual 3D brush correction</text>
</g>
<g text-anchor="middle" font-size="10" fill="#ffffff" opacity="0.72">
<text x="121" y="93">include / exclude</text>
<text x="293" y="93">translucent, dashed border</text>
<text x="465" y="93">the only write gate</text>
</g>
<text x="658" y="93" text-anchor="middle" font-size="10" fill="#6b6e76">add / erase · interpolate</text>
<rect x="24" y="128" width="752" height="70" rx="12" fill="none" stroke="#c4c6cd" stroke-width="1.3" stroke-dasharray="6 5"/>
<text x="36" y="146" font-size="11" fill="#6b6e76" font-weight="600">Orchestration layer · prompt normalization and scheduling</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="46" y="152" width="216" height="36" rx="9"/>
<rect x="284" y="152" width="216" height="36" rx="9"/>
<rect x="522" y="152" width="232" height="36" rx="9"/>
</g>
<g text-anchor="middle" font-size="11.5" fill="#25262b">
<text x="154" y="169">Prompt normalization</text>
<text x="392" y="169">GPU mutex · dual sessions</text>
<text x="638" y="169">Preview lifecycle</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="154" y="183">point / box / scribble / lasso / text</text>
<text x="392" y="183">encode and decode never overlap</text>
<text x="638" y="183">nothing persists before accept</text>
</g>
<rect x="24" y="214" width="368" height="112" rx="12" fill="none" stroke="#9a9da6" stroke-width="1.5"/>
<text x="36" y="232" font-size="11" fill="#25262b" font-weight="600">Path A · in-browser inference (default)</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="40" y="240" width="164" height="34" rx="8"/>
<rect x="216" y="240" width="164" height="34" rx="8"/>
<rect x="40" y="284" width="340" height="32" rx="8"/>
</g>
<g text-anchor="middle" font-size="11" fill="#25262b">
<text x="122" y="261">SAM encoder (ViT-B)</text>
<text x="298" y="261">SAM decoder</text>
<text x="210" y="304">ONNX Runtime Web · WebGPU / WASM</text>
</g>
<rect x="408" y="214" width="368" height="112" rx="12" fill="none" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="6 5"/>
<text x="420" y="232" font-size="11" fill="#6b6e76" font-weight="600">Path B · on-premise GPU (optional)</text>
<g fill="#ffffff" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 4">
<rect x="424" y="240" width="164" height="34" rx="8"/>
<rect x="600" y="240" width="164" height="34" rx="8"/>
<rect x="424" y="284" width="340" height="32" rx="8"/>
</g>
<g text-anchor="middle" font-size="11" fill="#25262b">
<text x="506" y="261">nnInteractive · MedSAM2</text>
<text x="682" y="261">VoxTell (text prompt)</text>
<text x="594" y="304">MONAI Label · FastAPI · session cache</text>
</g>
<rect x="24" y="342" width="752" height="72" rx="12" fill="none" stroke="#c4c6cd" stroke-width="1.3" stroke-dasharray="6 5"/>
<text x="36" y="360" font-size="11" fill="#6b6e76" font-weight="600">Storage and output layer</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="46" y="366" width="166" height="38" rx="9"/>
<rect x="234" y="366" width="166" height="38" rx="9"/>
<rect x="422" y="366" width="166" height="38" rx="9"/>
<rect x="610" y="366" width="144" height="38" rx="9"/>
</g>
<g text-anchor="middle" font-size="11" fill="#25262b">
<text x="129" y="384">Three-tier cache</text>
<text x="317" y="384">Labelmap data</text>
<text x="505" y="384">DICOM SEG encoding</text>
<text x="682" y="384">Provenance audit</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="129" y="398">Map / OPFS / Cache API</text>
<text x="317" y="398">Cornerstone3D voxel manager</text>
<text x="505" y="398">STOW-RS write-back</text>
<text x="682" y="398">append-only, long retention</text>
</g>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#mseg1-arrow)" fill="none">
<line x1="121" y1="102" x2="121" y2="150"/>
<line x1="154" y1="190" x2="154" y2="212"/>
<line x1="500" y1="170" x2="520" y2="170"/>
<line x1="638" y1="190" x2="638" y2="212"/>
<line x1="210" y1="326" x2="210" y2="364"/>
<line x1="594" y1="326" x2="594" y2="364"/>
<path d="M 317 366 V 348 H 293 V 104"/>
</g>
</svg>
<figcaption>Fig. 1. Layered structure of the dual-path promptable segmentation system</figcaption>
</figure>

The four layers have hard responsibility boundaries. The interaction layer only produces prompts and decisions, never inference. The orchestration layer only normalizes and schedules, and knows nothing of model internals. The inference layer only emits probability maps, never segmentation data. The storage and output layer only persists after an explicit acceptance signal. C4 is therefore not a slogan but a dataflow constraint cutting across all four layers.

### C. Why two paths rather than one

The browser path cannot cover two classes of need. **The first is native volumetric inference.** SAM is a 2D model; inter-slice consistency is obtained through propagation rather than from the model itself, and error accumulates along the propagation direction (§XI-A). nnInteractive infers directly on the volume and has no such problem. **The second is text prompting.** The parameter count and vocabulary of a text-driven model such as VoxTell far exceed what a browser can host. Path B is therefore not a faster version of Path A but a **complementary capability** — the two serve different task shapes.

Conversely, Path B cannot replace Path A. One nnInteractive inference needs roughly 6 GB of VRAM, so a single GPU serves a single-digit number of concurrent clinicians, whereas the concurrency ceiling of Path A is the number of workstations. In a center processing dozens of planning CTs a day, funnelling all interaction through one GPU means queueing time consumes the time the AI saved.

## IV. Browser-Resident Inference Engine

### A. SAM's promptable decomposition

SAM splits segmentation into two computations of extremely unequal cost. A heavy image encoder `E` (ViT-B, ~90 M parameters) maps the image to an embedding tensor; a light mask decoder `D` (~4 M parameters) maps embedding plus prompt to a mask.

```
I ──E──▶ z ∈ R^(1×256×64×64)
                    │
P (points/box) ──▶ ─┴──D──▶ M ∈ R^(1×4×1024×1024)
```

The essential property is that **`z` is independent of the prompt**. When a clinician repeatedly adds and removes prompt points on the same slice, only `D` reruns. This is exactly why browser residency is feasible: `E` is a one-off cost measured in seconds, `D` is a repeatable cost measured in milliseconds, and all interaction density falls on the latter.

### B. The encoding path

Before encoding, DICOM pixels must become model input — and in a medical setting this step is far from trivial:

```
DICOM pixels (int16, HU)
  → apply Modality LUT / Rescale (to HU)
  → apply VOI LUT (window width / center) → 8-bit grayscale
  → replicate grayscale into three RGB channels
  → resample to 1024 × 1024 (preserve aspect ratio, zero-pad the short side)
  → NCHW float32 tensor [1, 3, 1024, 1024]
```

We reuse the viewer's own render pipeline (`loadImageToCanvas`) for the first three steps. The benefit is that **the model sees what the clinician sees**; the cost appears in §V-C, where the window becomes part of the model input and must therefore enter the cache key.

The input tensor size is worth computing: `3 × 1024 × 1024 × 4 B = 12 MiB`. That is the payload uploaded to the GPU on every frame encode, and it explains why encoding latency tracks memory bandwidth.

The ONNX Runtime session must explicitly disable several features tuned for server deployment:

```typescript
import ort from 'onnxruntime-web/webgpu'

ort.env.wasm.wasmPaths = 'ort/'   // self-hosted, never a public CDN
ort.env.wasm.numThreads = 4
ort.env.wasm.proxy = false        // under WebGPU, the proxy only adds copies

const sessionOptions: ort.InferenceSession.SessionOptions = {
  executionProviders: ['webgpu'],  // fall back to ['wasm'] when unavailable
  enableMemPattern: false,         // memory-pattern prediction fails on variable-length input
  enableCpuMemArena: false,        // avoids double retention alongside the WebGPU allocator
  extra: {
    session: {
      disable_prepacking: '1',
      use_device_allocator_for_initializers: '1',
      use_ort_model_bytes_directly: '1',      // saves one 180 MB copy
      use_ort_model_bytes_for_initializers: '1',
    },
  },
}
```

`use_ort_model_bytes_directly` is mandatory rather than optional in a browser. The model binary already arrives from the Cache API as an `ArrayBuffer`; without this flag the runtime copies another 180 MB, which is a substantial waste against a ~4 GB per-tab memory ceiling.

### C. The decoding path and prompt construction

The decoder's input tensors are organized as follows. The semantics of `labels` are where this system's prompt normalization lands — point, box, and propagation-sampled prompts all unify here:

```typescript
type PromptLabel = 0 | 1 | 2 | 3
// 0 = exclude point, 1 = include point, 2 = box top-left, 3 = box bottom-right

function feedForSam(
  imageEmbeddings: Float32Array,  // encoder output, 1×256×64×64
  points: number[],               // [x1, y1, x2, y2, ...] in 1024² canvas coordinates
  labels: PromptLabel[],
  modelSize = 1024,
): Record<string, ort.Tensor> {
  const n = labels.length
  return {
    image_embeddings: new ort.Tensor('float32', imageEmbeddings, [1, 256, 64, 64]),
    point_coords:     new ort.Tensor('float32', Float32Array.from(points), [1, n, 2]),
    point_labels:     new ort.Tensor('float32', Float32Array.from(labels), [1, n]),
    // without iterative mask refinement, mask_input must still be a zero placeholder
    mask_input:       new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input:   new ort.Tensor('float32', [0], [1]),
    orig_im_size:     new ort.Tensor('float32', [modelSize, modelSize], [2]),
  }
}
```

The decoder emits `[1, 4, 1024, 1024]`, i.e. four candidate masks (`4 × 1024 × 1024 × 4 B = 16 MiB`). SAM uses multiple candidates to resolve the intrinsic ambiguity of a prompt such as "a point on the liver" — it might mean a liver segment, the whole liver, or the abdominal region containing it. In clinical contouring we do not expose that ambiguity: the structure set has already fixed the anatomical level of the target, so we take the candidate with the highest self-predicted IoU and let ambiguity be resolved by "place one more exclude point", an action far closer to clinical intuition.

### D. Probability threshold and post-processing

After a sigmoid, the decoder output is a per-pixel foreground probability. The implementation carries this probability in an 8-bit alpha channel with `pCutoff = 64` (i.e. 25%). That value is well below the conventional 0.5 and therefore **biases toward over-segmentation**.

We argue a single global threshold is wrong in radiotherapy, because the costs are asymmetric and point in opposite directions:

- **Targets (GTV/CTV).** Under-segmentation means geographic miss — severe and irreversible. Over-segmentation is partly absorbed by subsequent margin expansion and plan optimization. A low threshold is appropriate.
- **Organs at risk.** Over-segmentation pulls normal tissue into dose constraints, over-tightening the plan and degrading target coverage. Under-segmentation understates risk. A threshold near 0.5 is appropriate.

The threshold should therefore be configured per structure semantics rather than globally:

```typescript
interface StructureProfile {
  code: string              // TG-263 standard name, e.g. 'Lung_L' / 'GTVp'
  category: 'target' | 'oar'
  pCutoff: number           // alpha threshold, 0–255
  islandRemoval: { maxInternalRemove: number; fillInternalEdge: boolean }
}

const PROFILES: Record<string, StructureProfile> = {
  GTVp:    { code: 'GTVp',    category: 'target',
             pCutoff: 56, islandRemoval: { maxInternalRemove: 8,  fillInternalEdge: true  } },
  Lung_L:  { code: 'Lung_L',  category: 'oar',
             // air spaces and vessel cross-sections inside lung are real anatomy, not islands
             pCutoff: 128, islandRemoval: { maxInternalRemove: 0, fillInternalEdge: false } },
  SpinalCord: { code: 'SpinalCord', category: 'oar',
             pCutoff: 140, islandRemoval: { maxInternalRemove: 4,  fillInternalEdge: true  } },
}
```

The same reasoning applies to island removal. The default `maxInternalRemove: 16, fillInternalEdge: true` is sensible denoising for solid organs, but for lung, bowel, or trachea — structures with **genuine internal cavities** — it erases anatomy as though it were noise. Such defaults are harmless on natural images and defective on medical ones.

### E. Mapping masks back to voxels

The decoded mask lives in a 1024² canvas frame and must map back to volumetric IJK indices. The chain is:

```
canvas(u, v) ──▶ world = origin + u·rightVector + v·downVector ──▶ worldToIndex ──▶ (i, j, k)
```

Three points deserve care. **Anisotropic voxels**: a planning CT commonly has 3 mm slice thickness and 1 mm in-plane spacing, so `downVector` and `rightVector` differ in magnitude, and scaling by pixel ratio alone produces a systematic offset. **Off-axial planes**: when prompting on a coronal or oblique MPR view, the basis vectors are not axis-aligned with the volume, so the mapped mask shows staircase aliasing and needs a morphological closing on the voxel side. **Irreversibility of resampling**: a 1024² canvas upsamples a 512² source, so sub-pixel boundary detail is interpolated rather than real; mapping back must use nearest-neighbor rather than linear interpolation, or intermediate values that never existed are introduced at boundaries.

## V. Three-Tier Cache and Scheduling

### A. Hierarchy

<figure class="diagram">
<svg viewBox="0 0 800 372" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three-tier cache hierarchy: L1 in-memory Map, L2 OPFS image-embedding cache, L3 Cache API model-binary cache, with the top-down lookup and back-fill paths">
<defs>
<marker id="mseg2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<rect x="24" y="30" width="248" height="44" rx="9" fill="#25262b"/>
<text x="148" y="52" text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">restoreImageEncoding(key)</text>
<text x="148" y="67" text-anchor="middle" font-size="10" fill="#ffffff" opacity="0.72">the single entry point before encoding</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="24" y="110" width="248" height="56" rx="9"/>
<rect x="24" y="196" width="248" height="56" rx="9"/>
<rect x="24" y="282" width="248" height="56" rx="9"/>
</g>
<g text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">
<text x="148" y="132">L1 · in-memory Map</text>
<text x="148" y="218">L2 · OPFS</text>
<text x="148" y="304">L3 · Cache API</text>
</g>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="148" y="150">key → Float32Array · sub-millisecond</text>
<text x="148" y="160">page lifetime</text>
<text x="148" y="236">embedding persistence · tens of ms</text>
<text x="148" y="246">cross-session; needs quota and eviction</text>
<text x="148" y="322">model binaries · about 197 MB</text>
<text x="148" y="332">cross-session, browser managed</text>
</g>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#mseg2-arrow)" fill="none">
<line x1="148" y1="76" x2="148" y2="108"/>
<line x1="148" y1="168" x2="148" y2="194"/>
</g>
<text x="160" y="186" font-size="10" fill="#6b6e76">miss</text>
<text x="160" y="100" font-size="10" fill="#6b6e76">look up</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="336" y="110" width="212" height="56" rx="9"/>
<rect x="336" y="196" width="212" height="56" rx="9"/>
</g>
<g fill="#25262b">
<rect x="336" y="282" width="212" height="56" rx="9"/>
</g>
<g text-anchor="middle" font-size="11.5" fill="#25262b">
<text x="442" y="134">hit → decode directly</text>
<text x="442" y="220">hit → back-fill L1</text>
</g>
<text x="442" y="306" text-anchor="middle" font-size="11.5" fill="#ffffff" font-weight="600">all miss → run the encoder</text>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="442" y="152">saves 1–3 s of encoding</text>
<text x="442" y="238">one 4 MiB read</text>
</g>
<text x="442" y="322" text-anchor="middle" font-size="10.5" fill="#ffffff" opacity="0.72">async write-back to L1 and L2</text>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#mseg2-arrow)" fill="none">
<line x1="274" y1="138" x2="334" y2="138"/>
<line x1="274" y1="224" x2="334" y2="224"/>
<line x1="274" y1="310" x2="334" y2="310"/>
<path d="M 548 310 H 588 V 138 H 552" stroke-dasharray="5 4"/>
</g>
<rect x="600" y="176" width="176" height="110" rx="10" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="688" y="198" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="600">Capacity facts</text>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="688" y="219">embedding 256×64×64×4 B = 4 MiB</text>
<text x="688" y="236">source slice 512×512×2 B = 512 KiB</text>
<text x="688" y="253">cache costs 8× the source</text>
<text x="688" y="273">400-slice series ⇒ 1.6 GiB</text>
</g>
</svg>
<figcaption>Fig. 2. Lookup path and capacity cost of the three-tier cache</figcaption>
</figure>

### B. Capacity analysis

The embedding footprint is fixed: `1 × 256 × 64 × 64` float32 values, i.e. `1,048,576 × 4 B = 4 MiB`, independent of image content. Comparing that against the source data yields a counter-intuitive result: a 512×512 int16 CT slice is 512 KiB, so **the embedding is eight times larger than the slice it came from**.

That ratio rules out unbounded persistence. A 400-slice thin-section chest CT holds 1.6 GiB of embeddings; a clinician browsing a dozen series a day will grow OPFS by tens of gigabytes within days, eventually triggering browser storage reclamation — which is unpredictable and may strike the very series in use.

Our policy is **a per-study quota with LRU eviction**:

```typescript
const QUOTA_PER_STUDY = 512 * 1024 * 1024   // 512 MiB ≈ 128 frames
const QUOTA_TOTAL     = 4 * 1024 * 1024 * 1024

async function admitEmbedding(key: EmbeddingKey, bytes: ArrayBuffer): Promise<void> {
  // access is local during propagation: the clinician scrolls around the current slice,
  // and distant embeddings are almost never reused — LRU is sufficient
  await evictUntil(key.studyUID, QUOTA_PER_STUDY - bytes.byteLength)
  await evictGlobalUntil(QUOTA_TOTAL - bytes.byteLength)
  await opfsWrite(serializeKey(key), bytes)
}
```

The 512 MiB figure is derived from access locality: the default propagation search radius is ten slices, and even including the clinician's back-and-forth review the hot window rarely exceeds a hundred frames. At a 128-frame quota, hit rate is essentially indistinguishable from an unbounded cache while storage drops by an order of magnitude.

### C. A window-level-sensitive cache key

This is, in our view, the most broadly applicable finding in this paper.

The reference implementation defines the OPFS path as `<modelName>/<studyUID>/<seriesUID>/<instanceUID>`. In a natural-image context this is correct — an image ID uniquely determines an image. In medical imaging it **does not hold**, because what enters the encoder is not the raw pixels but an 8-bit RGB rendering produced by a VOI LUT transform (§IV-B). The same CT slice under a lung window (WW 1500 / WC −600) and a mediastinal window (WW 400 / WC 40) resamples into two visually distinct images, and the encoder naturally emits different embeddings.

The consequence is **silent**. A clinician encodes a slice in the lung window, switches to the mediastinal window and places a prompt; the system returns the lung-window embedding from cache, and the decoder produces a mask from the wrong image features. The result looks plausible, but it corresponds to a different window's image semantics. No error, no warning — just a boundary that is off.

The correction folds the window into the key, with quantization to prevent key explosion while dragging:

```typescript
interface EmbeddingKey {
  modelName: string
  studyUID: string
  seriesUID: string
  instanceUID: string
  ww: number       // quantized window width
  wc: number       // quantized window center
  voiLutId: string // identifier for a non-linear VOI LUT; 'linear' for a linear transform
}

// A 5 HU step: changes smaller than this do not alter the 8-bit quantized pixel
// distribution, so reuse is safe; larger changes must force a re-encode.
const WL_STEP = 5
const quantize = (v: number) => Math.round(v / WL_STEP) * WL_STEP

function serializeKey(k: EmbeddingKey): string {
  return [k.modelName, k.studyUID, k.seriesUID, k.instanceUID,
          `ww${quantize(k.ww)}`, `wc${quantize(k.wc)}`, k.voiLutId].join('/')
}
```

A **write debounce** is also required. While the clinician drags the window, the level varies continuously; encoding at every intermediate value would saturate the GPU with pointless work. In practice we only start encoding after the window has been stable for 500 ms, and disable previews entirely during the drag.

Generalizing: for any medical imaging AI whose model input is a *rendered* image, the cache key must contain the full set of rendering parameters. Keying on SOPInstanceUID alone conflates DICOM's pixel data with its presentation state.

### D. Dual sessions and the GPU mutex

A browser has one GPU queue, so encoding and decoding cannot genuinely run in parallel. The system uses two sessions sharing a single encoder instance (avoiding a duplicate 180 MB residency), each holding its own canvas and embedding cache:

```
sessions[0]  current slice
  ├─ encoder: shared instance
  ├─ decoder: own instance
  └─ embeddings: current slice embedding

sessions[1]  prefetch slice
  ├─ encoder: same instance as sessions[0]
  ├─ decoder: null (prefetch never decodes)
  └─ embeddings: next slice embedding
```

`isGpuInUse` acts as a mutex: decode requests (the interaction path — the user is waiting) take priority, and pre-encoding (the prefetch path — the user is unaware) yields. The priority cannot be inverted: yielding once loses a little prefetch progress, whereas preemption once shows the clinician a 200 ms stall.

Prefetch direction also matters. Rather than blindly taking "the next slice", we prefetch **along the clinician's most recent scroll direction**. Scroll direction is a strong intent signal, and following it raises hit rate from roughly 50% (blindly choosing one side) to close to 90%.

## VI. Human-in-the-Loop Interaction Model

### A. Three interaction forms

| Tool | Inference | Prompt source | Suited to | Per-slice cost |
|------|-----------|---------------|-----------|----------------|
| Slice propagation | SAM encoder + decoder | random sampling from confirmed neighboring labelmap | sequential contouring of continuous structures | one keystroke (accept/reject) |
| Marker-guided | SAM decoder (embedding reused) | clinician-placed include/exclude points | complex boundaries needing precise control | 2–5 clicks + one keystroke |
| One-click | GrowCut (no neural network) | positive/negative seeds inferred from hover position | well-contrasted single regions | one click + one keystroke |

Table I. Comparison of the three interaction forms

The third is worth noting: one-click segmentation uses GrowCut [16] and involves no model at all. Placing it alongside the two SAM tools inside the same accept/reject framework is C3 (model neutrality) made concrete — the interaction layer does not know whether a ViT or a cellular automaton produced the proposal, only that a proposal awaits review. It also brings a practical benefit: during the first few tens of seconds while the model downloads, one-click is already usable.

### B. The preview–sign-off state machine

<figure class="diagram">
<svg viewBox="0 0 800 336" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Human-in-the-loop state machine: idle, prompted, preview, then accept or reject into committed or back to prompted, then signed off and exported, with four provenance audit event classes below">
<defs>
<marker id="mseg3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="24" y="60" width="128" height="42" rx="9"/>
<rect x="196" y="60" width="128" height="42" rx="9"/>
<rect x="368" y="60" width="128" height="42" rx="9"/>
</g>
<g fill="#25262b">
<rect x="540" y="60" width="112" height="42" rx="9"/>
<rect x="368" y="146" width="128" height="42" rx="9"/>
</g>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="672" y="60" width="104" height="42" rx="9"/>
</g>
<g text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11.5">
<text x="88" y="86" fill="#25262b">IDLE</text>
<text x="260" y="86" fill="#25262b">PROMPTED</text>
<text x="432" y="86" fill="#25262b">PREVIEW</text>
<text x="596" y="86" fill="#ffffff">COMMITTED</text>
<text x="724" y="86" fill="#25262b">SIGNED_OFF</text>
<text x="432" y="172" fill="#ffffff">REJECTED</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="88" y="118">no prompt</text>
<text x="260" y="118">prompt placed</text>
<text x="432" y="118">mask generated, not persisted</text>
<text x="724" y="118">clinician e-signature</text>
</g>
<text x="596" y="118" text-anchor="middle" font-size="10" fill="#6b6e76">written to labelmap</text>
<text x="432" y="204" text-anchor="middle" font-size="10" fill="#6b6e76">discarded, nothing persisted</text>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#mseg3-arrow)" fill="none">
<line x1="152" y1="81" x2="194" y2="81"/>
<line x1="324" y1="81" x2="366" y2="81"/>
<line x1="496" y1="81" x2="538" y2="81"/>
<line x1="652" y1="81" x2="670" y2="81"/>
<line x1="432" y1="104" x2="432" y2="144"/>
<path d="M 368 167 H 260 V 104"/>
<path d="M 596 104 V 128 H 260 V 104" stroke-dasharray="5 4"/>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="173" y="74">place prompt</text>
<text x="345" y="74">inference done</text>
<text x="517" y="74">Enter</text>
<text x="450" y="128">Esc</text>
<text x="314" y="163">add prompts, retry</text>
</g>
<text x="430" y="142" text-anchor="middle" font-size="10" fill="#6b6e76">next slice</text>
<text x="400" y="238" text-anchor="middle" font-size="11.5" fill="#25262b">Every transition emits an audit event; only post-COMMITTED data may be exported</text>
<rect x="24" y="252" width="752" height="64" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<g stroke="#d6d8de" stroke-width="1">
<line x1="212" y1="252" x2="212" y2="316"/>
<line x1="400" y1="252" x2="400" y2="316"/>
<line x1="588" y1="252" x2="588" y2="316"/>
</g>
<g text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11.5" fill="#25262b">
<text x="118" y="277">AI_SUGGEST</text>
<text x="306" y="277">DECISION</text>
<text x="494" y="277">EDIT</text>
<text x="682" y="277">SIGN_OFF</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="118" y="298">model, version, prompt payload</text>
<text x="306" y="298">accept / reject + elapsed time</text>
<text x="494" y="298">volume delta of manual edits</text>
<text x="682" y="298">signer + signature + timestamp</text>
</g>
</svg>
<figcaption>Fig. 3. The preview–sign-off state machine and four provenance event classes</figcaption>
</figure>

`PREVIEW` is the pivot of this design: it is a transient render-layer object that never enters the labelmap voxel manager. Rejection therefore requires no undo — nothing was written, so nothing rolls back, and `Esc` merely discards a scratch buffer. Compared with "write then undo", this choice eliminates an entire class of consistency bugs: failed undo, undo-stack overflow, cross-slice undo confusion.

The `DECISION` event records rejections as well as acceptances, a point often overlooked. Recording only acceptances biases the audit record severely — it makes the model look infallible, because overruled proposals leave no trace. Recording rejections also has operational value: rejection rate aggregated by structure, by series, and by model version is the most sensitive on-site indicator of model degradation, and it arrives far earlier than any offline evaluation.

### C. Prompt sampling for propagation

Propagation prompts come from confirmed annotations on neighboring slices. The reference approach is "find an annotated slice inside the search radius and randomly sample `numRandomPoints` (default 5) foreground pixels". That works mid-structure and fails at the poles: as a structure approaches its superior or inferior extent, neighboring foreground area shrinks rapidly, five random points cluster within a few dozen voxels, the prompt degenerates into a repeated single point, and the decoder returns a mask that is too small or too scattered.

Our adjustments are threefold:

```typescript
interface PropagationPrompt { points: number[]; labels: PromptLabel[]; confident: boolean }

function samplePrompts(neighborMask: Uint8Array, area: number): PropagationPrompt | null {
  // 1) stop propagating when area is too small rather than forcing the point count —
  //    the poles are exactly where control should return to the clinician
  if (area < MIN_PROPAGATE_AREA) return null

  // 2) point count grows logarithmically with area: fewer points on small structures to
  //    avoid over-constraining, more on large ones to guarantee coverage
  const n = clamp(Math.round(2 * Math.log2(area)), 3, 24)

  // 3) Poisson-disk sampling instead of uniform random, enforcing a minimum spacing
  const pts = poissonDiskSample(neighborMask, n, minDistance(area))

  // 4) sample exclude points from a ring just outside the neighbor's foreground,
  //    suppressing leakage into adjacent organs
  const neg = sampleRing(neighborMask, RING_OFFSET_MM, Math.ceil(n / 3))

  return {
    points: [...pts.flat(), ...neg.flat()],
    labels: [...pts.map(() => 1 as const), ...neg.map(() => 0 as const)],
    confident: area > CONFIDENT_AREA,   // lets the UI decide whether to highlight by default
  }
}
```

The fourth item matters most. With include points only, SAM has nothing constraining the outside of the boundary, and it readily spills across low-contrast interfaces such as liver–kidney or lung–chest wall. Extrapolating a ring of negative points outward from the neighbor's foreground contour is equivalent to supplying a soft boundary prior.

### D. The interaction economics model

"AI assistance is faster" is a proposition requiring proof, not a premise. We formalize it.

Let a series contain `N` slices. Under a **manual baseline**, each slice costs `t_m` (delineation, refinement, and slice advance combined):

```
T_manual = N · t_m
```

Under **AI assistance**, each slice requires the clinician to inspect the preview and judge it (`t_v`); if accepted (probability `p`), one keystroke (`t_a`); if rejected (probability `1 − p`), a keystroke to dismiss (`t_r`) followed by completing that slice manually (`t_m`). Hence:

```
T_ai = N · [ t_v + p·t_a + (1 − p)·(t_r + t_m) ]
```

The speedup is:

```
S(p) = t_m / [ t_v + p·t_a + (1 − p)·(t_r + t_m) ]
```

Solving `S(p) > 1` gives the **break-even acceptance rate**:

```
p* = (t_v + t_r) / (t_r + t_m − t_a)
```

Several conclusions follow directly. **First**, `p*` is roughly inversely proportional to `t_m`: the more expensive a structure is to draw by hand, the more easily AI pays for itself. **Second**, `t_v` (review time) and `t_r` (rejection cost) sit in the numerator, meaning that reducing them is a product lever equivalent to raising model accuracy — making a preview judgeable at a glance and rejection a single keystroke returns as much as raising the acceptance rate. **Third**, `t_a` sits in the denominator where `t_m` dominates it, so the cost of the acceptance action itself is nearly irrelevant and does not warrant optimization.

Substituting typical organ-contouring parameters (`t_m = 25 s`, `t_v = 1.5 s`, `t_a = 0.4 s`, `t_r = 1.0 s`) gives `p* = 2.5 / 25.6 ≈ 9.8%`. **An acceptance rate above roughly 10% already makes AI assistance faster than pure manual work.** The lowness of that threshold is counter-intuitive, and it explains why clinicians consistently report the tool as "useful" even on structures where the model is visibly imperfect.

Numerical results appear in §X-C.

## VII. The Server Path and Multi-Model Orchestration

### A. Unifying prompt semantics across paths

Path B integrates four model families — nnInteractive, SAM2/MedSAM2/SAM3, and VoxTell — whose prompt capabilities are uneven:

| Prompt type | nnInteractive | SAM2 / MedSAM2 | SAM3 | VoxTell | Browser SAM |
|-------------|:---:|:---:|:---:|:---:|:---:|
| Positive point | yes | yes | yes | — | yes |
| Negative point | yes | yes | yes | — | yes |
| Bounding box | yes | yes | yes | — | yes |
| Scribble | yes | — | — | — | — |
| Lasso | yes | — | — | — | — |
| Text | — | — | — | yes | — |
| Native 3D propagation | yes | yes | yes | yes | emulated by inter-slice propagation |
| VRAM | ~6 GB | ~4 GB | ~6 GB | ~3 GB | 0 (GPU managed by browser) |

Table II. Prompt capability and resource demand by model

The orchestration layer's job is to keep the interaction layer unaware of these differences. If a clinician draws a lasso on a model that lacks lasso support, the layer degrades it to the lasso's bounding box plus points sampled along its contour. If a clinician enters text on a model without text support, the layer says so explicitly rather than silently ignoring it. **Degradation must be visible** — silent degradation leaves the clinician believing an intent was understood when it was not.

### B. The session mechanism

Volumetric models need the whole volume for every inference. Uploading 300 CT slices (about 150 MB) on every interaction makes interaction impossible. The session mechanism decouples upload from inference:

```
PUT  /session/                  upload the 3D volume once → returns session_id
POST /infer/{model}?session=…   subsequent inference sends prompts only, millisecond round-trip
DEL  /session/{session_id}      explicit VRAM release
```

nnInteractive additionally supports an `init` operation that precomputes encoder state — the same idea as §IV-A's prompt-independent embedding, realized in three dimensions.

Session lifetime is where this path most often breaks: an unreleased session holds several gigabytes of VRAM, and a handful will fill a GPU. In practice one needs triple protection: idle timeout (we use 15 minutes), `sendBeacon` release on page unload, and server-side forced reclamation at a VRAM watermark.

### C. Converging on one output format

Whichever path produced it, the output must converge on DICOM SEG [11], [12]. The critical fields:

```python
# A SEG must carry a complete reference to its source series, or downstream systems
# cannot determine which images it delineates
ds.SOPClassUID = '1.2.840.10008.5.1.4.1.1.66.4'
ds.SegmentationType = 'BINARY'

seg = Dataset()
seg.SegmentNumber = 1
seg.SegmentLabel = 'Lung_L'                    # TG-263 standard name
seg.SegmentAlgorithmType = 'SEMIAUTOMATIC'     # not AUTOMATIC — a human is in the loop
seg.SegmentAlgorithmName = 'sam_b@1.17.1'      # model and version, for provenance
seg.SegmentedPropertyCategoryCodeSequence = [code('T-D0050', 'SRT', 'Tissue')]
seg.SegmentedPropertyTypeCodeSequence = [code('T-28300', 'SRT', 'Left lung')]
ds.SegmentSequence = [seg]

ds.ReferencedSeriesSequence = [referenced_series(source_series_uid, source_sop_uids)]
```

Setting `SegmentAlgorithmType` to `SEMIAUTOMATIC` rather than `AUTOMATIC` is not diplomatic phrasing but a statement of fact: every slice of this SEG passed through a human acceptance action. Downstream systems and auditors read that field to determine its nature.

## VIII. Provenance and Accountability

### A. Why the record must live in the data structures

If C4 (a proposal is not a conclusion) exists only in copy, engineering will eventually route around it. Our approach makes it unstatable at the data layer: the preview object never enters the voxel manager (§VI-B), unsigned segmentations are force-marked "draft" on export, and every state transition appends an immutable audit record.

```sql
CREATE TABLE seg_audit (
  id             BIGSERIAL PRIMARY KEY,
  case_id        VARCHAR(64)  NOT NULL,
  series_uid     VARCHAR(128) NOT NULL,
  structure      VARCHAR(64)  NOT NULL,   -- TG-263 standard name
  -- AI_SUGGEST / DECISION / EDIT / SIGN_OFF / EXPORT
  event_type     VARCHAR(16)  NOT NULL,
  origin         VARCHAR(8),              -- ai / human
  model          VARCHAR(64),             -- path A: sam_b; path B: nninteractive, etc.
  model_version  VARCHAR(32),
  inference_site VARCHAR(16),             -- browser / on_prem_gpu, evidences data flow
  slice_index    INT,
  decision       VARCHAR(8),              -- accept / reject, DECISION events only
  decision_ms    INT,                     -- review time, i.e. t_v in the economics model
  prompt         JSONB,                   -- full prompt snapshot, for reproduction
  delta          JSONB,                   -- volume delta of manual correction
  signature      VARCHAR(256),            -- SIGN_OFF only
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only: revoke UPDATE/DELETE; "corrections" are expressed by appending new events
REVOKE UPDATE, DELETE ON seg_audit FROM app_user;
```

The `inference_site` column is specific to a browser-resident design: it turns "did the pixel data leave the workstation for this inference?" into a provable fact rather than an architectural promise. Under a data-export or cross-domain review, that column *is* the evidence.

`decision_ms` serves double duty. It is part of the provenance record (how long the clinician actually looked), and it is simultaneously a direct measurement of `t_v` in the §VI-D model. The economics model therefore needs no separate user study — production audit data continuously calibrates it.

### B. Reconstructibility

With the above records, any sign-off is fully reconstructible: which model at which version, on which device, from which prompts, produced which proposal; how long the clinician looked and whether they accepted; how much volume they subsequently edited by hand; and who signed, when. The corresponding regulatory formulation is that AI assists while the responsible clinician makes the final determination [27], [28]. Its value lies not in absolving anyone but in making the human decision provable, traceable, and defensible.

## IX. Experimental Setup

### A. Implementation

The front end is React 19 with TypeScript; the imaging stack is Cornerstone3D 4.15; inference runs on ONNX Runtime Web 1.17.1 (WebGPU preferred, WASM fallback). The model is an ONNX export of SAM ViT-B: encoder ~180 MB in FP16, decoder ~17 MB in FP32. Segmentation data, statistics, and SEG encoding reuse the viewer's existing capabilities — per-segment statistics, for instance, run in a Web Worker so the main thread never blocks:

```typescript
export async function getSegmentStatistics(
  segmentationId: string,
): Promise<Map<number, SegmentStats>> {
  const indices = getSegmentIndices(segmentationId)
  if (!indices.length) return new Map()
  if (!cstSegmentation.state.getSegmentation(segmentationId)) return new Map()

  // 'individual' mode: statistics per segment; the layer below distinguishes
  // volume-labelmap from stack-labelmap automatically
  const stats = await cstUtils.segmentation.getStatistics({
    segmentationId, segmentIndices: indices, mode: 'individual',
  })

  const result = new Map<number, SegmentStats>()
  for (const idx of indices) {
    const named = stats?.[idx]
    if (named) result.set(idx, mapNamedStats(idx, named))
  }
  return result
}
```

Volume units require explicit conversion rather than pass-through: the layer below returns mm³ (voxel count times spacing product) while clinical practice uses ml, a factor of 1000. Passing such a value through silently puts a three-order-of-magnitude error on screen with no error raised.

Creating a new segmentation goes through Cornerstone3D's derived-labelmap path, which depends only on reference-image metadata and does not require pixels to be fully loaded — important for first-paint behavior on large series:

```typescript
const referenceImageIds = (viewport as coreTypes.IStackViewport).getImageIds()
const derivedImages = imageLoader.createAndCacheDerivedLabelmapImages(referenceImageIds)

cstSegmentation.addSegmentations([{
  segmentationId,
  representation: {
    type: SegmentationRepresentations.Labelmap,
    data: { imageIds: derivedImages.map((i) => i.imageId), referencedImageIds: referenceImageIds },
  },
  config: { label: options.label, segments: { 1: firstSegment } },
}])
await cstSegmentation.addSegmentationRepresentations(viewportId, [
  { type: SegmentationRepresentations.Labelmap, segmentationId },
])
```

### B. Data

System-level testing uses the SlicerRtData [29] radiotherapy test collection: approximately 4.8 GB across 45 sub-datasets and about 6,870 DICOM files, exported from nine families of planning systems including Eclipse, XiO, Pinnacle3, Aria, Oncentra, TomoTherapy, Corvus, CERR, and HIT. Modality distribution is CT 3,782; US 153; MR 125; RTDOSE 38; RTRECORD 37; RTIMAGE 33; RTSTRUCT 28; SR 23; RTPLAN 21; XA 6; REG 2.

The subsets we exercise:

| Subset | Purpose | Characteristic |
|--------|---------|----------------|
| `eclipse-10.0.42-fsrt-brain` | long-series encoding and caching | 230+ slice brain CT |
| `aria-phantom-contours-*` | geometric mapping of complex contours | branching, keyhole, rapidly changing contours |
| `eclipse-8.1.20-phantom-prostate` | full RT chain | CT + RTSTRUCT + RTPLAN + RTDOSE |
| `xio-4.60.00-phantom-irregular-spacing` | anisotropy and irregular spacing | non-uniform slice intervals |
| `plastimatch_tiny-rt-study` | smoke regression | small volume, loads in seconds |
| `oncentra-4.2.21-mri-us-fusion-4` | cross-modality window sensitivity | fused MR + US data |

Table III. Test subsets and the failure modes they target

The three `aria-phantom-contours-*` subsets were constructed specifically for contour edge cases and validate §IV-E: branching contours exercise multiple connected components on one slice, keyhole contours check that holes survive island removal, and rapidly changing contours check whether propagation stays bounded when morphology shifts abruptly between slices.

### C. Hardware and benchmark conventions

System-level benchmarks were collected on a workstation running a WebGPU-capable modern browser (Chrome 113+), with the WASM fallback path recorded in parallel as a lower bound for GPU-less environments. All latencies are end-to-end wall-clock times including tensor construction, GPU upload, and result readback — not bare kernel time.

### D. Accuracy evaluation protocol

Accuracy evaluation follows the recommendations of [22] and [23]. Primary metrics are the Dice similarity coefficient [25] and the 95th-percentile Hausdorff distance [26]; for thin-walled and tubular structures (spinal cord, esophagus, optic nerves) we additionally report surface Dice with a tolerance set to the structure's in-plane pixel spacing. The reference standard is formed from independent delineations by two radiation oncologists arbitrated by a third, and inter-observer variability is reported alongside as a performance ceiling. Results are stratified by structure rather than averaged globally: a global mean is dominated by large organs such as lung and liver and masks problems on small structures — exactly the pitfall identified in [23].

### E. Scope of reported results

This paper reports **system-level metrics**: inference latency, memory footprint, cache behavior, and speedup derived from the interaction economics model. The accuracy evaluation described in §IX-D runs independently and its results are outside this paper's scope. The reason for the split is that the final artifact of an interactive system is a joint human–machine product; reporting the model's raw Dice alongside system value obscures both.

## X. Results

### A. Inference latency

| Stage | WebGPU | WASM (CPU) | Notes |
|-------|--------|------------|-------|
| Cold model load | 3–10 s | 3–10 s | includes ~197 MB download; network-dominated |
| Warm model load | < 1 s | < 1 s | restored from Cache API |
| Encode (per frame) | 1–3 s | 5–15 s | ViT-B forward, includes 12 MiB tensor upload |
| Decode (per call) | 50–200 ms | 200–500 ms | rerun after any prompt change |
| Mask → voxel | < 100 ms | < 100 ms | pure CPU, backend-independent |

Table IV. Latency by inference stage

The roughly 30× gap between encoding and decoding is the physical basis of the entire interaction design. It means **repeated adjustment within a slice is cheap, and moving between slices is expensive**. The product shape should therefore encourage the clinician to finish a slice before advancing, rather than paging rapidly through coarse passes — the latter turns every slice into a full encode. Caching and prefetch (§V) exist precisely to move that expense off the critical path.

Under WASM, encoding at 5–15 s per frame is past the threshold of interactive acceptability. In environments without WebGPU, the product should therefore disable slice propagation by default (it requires a fresh encode on every slice) and retain only marker-guided segmentation (which reuses the embedding within a slice and reruns only the decoder) and one-click segmentation (which needs no model at all). This is a feature-availability matrix derived from performance data, not a degradation notice.

### B. Memory and storage

| Item | Footprint | Lifetime |
|------|-----------|----------|
| Encoder (FP16) | ~180 MB | resident per session |
| Decoder | ~17 MB | resident per session |
| ONNX Runtime | ~50 MB | resident per session |
| Single-frame embedding (L1) | 4 MiB | bounded by LRU |
| Encode input tensor | 12 MiB | transient |
| Decode output tensor | 16 MiB | transient |
| Model binaries (L3) | ~197 MB | cross-session |
| Series embeddings (L2, 400 slices) | 1.6 GiB | cross-session, needs quota |

Table V. Memory and storage footprint

Resident memory increases by roughly 250–300 MB. In realistic multi-tab, multi-series use, that magnitude requires the encoder instance to be a global singleton — two tabs each holding a copy is 500 MB, close to the practical browser ceiling on some workstations. The sharing solution is to move inference into a SharedWorker so same-origin tabs share one session.

### C. Numerical results of the economics model

Substituting two parameter sets into the §VI-D model: complex organs (`t_m = 25 s`) and simple structures (`t_m = 12 s`), other parameters as before.

<figure class="diagram">
<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Speedup versus acceptance rate: x-axis acceptance rate 0 to 1, y-axis speedup 0 to 8, two curves for 25-second and 12-second manual per-slice cost, with their break-even acceptance rates annotated">
<line x1="80" y1="320" x2="756" y2="320" stroke="#25262b" stroke-width="1.4"/>
<line x1="80" y1="320" x2="80" y2="44" stroke="#25262b" stroke-width="1.4"/>
<g stroke="#e2e3e7" stroke-width="1">
<line x1="80" y1="286" x2="740" y2="286"/>
<line x1="80" y1="252" x2="740" y2="252"/>
<line x1="80" y1="219" x2="740" y2="219"/>
<line x1="80" y1="185" x2="740" y2="185"/>
<line x1="80" y1="151" x2="740" y2="151"/>
<line x1="80" y1="118" x2="740" y2="118"/>
<line x1="80" y1="84" x2="740" y2="84"/>
<line x1="80" y1="50" x2="740" y2="50"/>
</g>
<g text-anchor="end" font-size="10.5" fill="#6b6e76">
<text x="72" y="324">0</text>
<text x="72" y="290">1×</text>
<text x="72" y="256">2×</text>
<text x="72" y="223">3×</text>
<text x="72" y="189">4×</text>
<text x="72" y="155">5×</text>
<text x="72" y="122">6×</text>
<text x="72" y="88">7×</text>
<text x="72" y="54">8×</text>
</g>
<g text-anchor="middle" font-size="10.5" fill="#6b6e76">
<text x="80" y="338">0</text>
<text x="212" y="338">0.2</text>
<text x="344" y="338">0.4</text>
<text x="476" y="338">0.6</text>
<text x="608" y="338">0.8</text>
<text x="740" y="338">1.0</text>
</g>
<text x="410" y="360" text-anchor="middle" font-size="11.5" fill="#25262b">Acceptance rate p (share of AI previews adopted directly)</text>
<text x="26" y="182" font-size="11.5" fill="#25262b" transform="rotate(-90 26 182)" text-anchor="middle">Speedup S(p)</text>
<line x1="80" y1="286" x2="740" y2="286" stroke="#25262b" stroke-width="1.2" stroke-dasharray="6 4"/>
<text x="748" y="290" font-size="10" fill="#25262b">S = 1 break-even</text>
<line x1="145" y1="320" x2="145" y2="60" stroke="#c4c6cd" stroke-width="1.1" stroke-dasharray="4 4"/>
<line x1="212" y1="320" x2="212" y2="60" stroke="#c4c6cd" stroke-width="1.1" stroke-dasharray="4 4"/>
<text x="150" y="72" font-size="10" fill="#6b6e76">p* = 9.8%</text>
<text x="217" y="90" font-size="10" fill="#6b6e76">p* = 19.8%</text>
<path d="M 80 289 L 146 286 L 212 282 L 278 277 L 344 271 L 410 263 L 476 250 L 542 232 L 608 200 L 641 173 L 674 131 L 707 55" fill="none" stroke="#25262b" stroke-width="2.2"/>
<path d="M 80 292 L 212 286 L 344 277 L 476 262 L 608 228 L 674 192 L 707 160" fill="none" stroke="#9a9da6" stroke-width="2.2" stroke-dasharray="7 4"/>
<g fill="#25262b">
<circle cx="608" cy="200" r="3.6"/>
<circle cx="674" cy="131" r="3.6"/>
</g>
<g fill="#9a9da6">
<circle cx="608" cy="228" r="3.6"/>
<circle cx="674" cy="192" r="3.6"/>
</g>
<g font-size="10" fill="#6b6e76">
<text x="560" y="194">3.56×</text>
<text x="626" y="125">5.61×</text>
<text x="616" y="248">2.72×</text>
<text x="682" y="186">3.80×</text>
</g>
<rect x="96" y="56" width="256" height="52" rx="8" fill="#ffffff" stroke="#c4c6cd" stroke-width="1.2"/>
<line x1="110" y1="74" x2="140" y2="74" stroke="#25262b" stroke-width="2.2"/>
<line x1="110" y1="94" x2="140" y2="94" stroke="#9a9da6" stroke-width="2.2" stroke-dasharray="7 4"/>
<g font-size="10.5" fill="#25262b">
<text x="150" y="78">complex organ t_m = 25 s</text>
<text x="150" y="98">simple structure t_m = 12 s</text>
</g>
</svg>
<figcaption>Fig. 4. Speedup versus acceptance rate (t_v = 1.5 s, t_a = 0.4 s, t_r = 1.0 s)</figcaption>
</figure>

| Acceptance rate p | S(p), t_m = 25 s | S(p), t_m = 12 s |
|-------------------|------------------|------------------|
| 0.10 | 1.00 | 0.88 |
| 0.20 | 1.12 | 1.00 |
| 0.40 | 1.45 | 1.27 |
| 0.60 | 2.06 | 1.73 |
| 0.80 | 3.56 | 2.72 |
| 0.90 | 5.61 | 3.80 |
| 0.95 | 7.86 | 4.74 |

Table VI. Numerical speedup results

Three observations. **First, the curve is superlinear.** From p = 0.8 to 0.9, acceptance rises 12.5% while speedup jumps from 3.56× to 5.61× — a 58% gain. The marginal value of accuracy in the high-acceptance regime is therefore enormous, and the intuition that "a few more Dice points hardly matter" is wrong for interactive systems.

**Second, the break-even point is low but non-zero** — 9.8% for complex organs, 19.8% for simple ones. For structures that take only seconds by hand (an already-regular body outline, say), AI needs a substantially higher acceptance rate to pay off. This is the quantitative argument against enabling AI for every structure.

**Third, the two curves nearly coincide at low acceptance and separate sharply at high acceptance.** When a model performs well on a class of structures, it should be applied to the structures that are most expensive by hand; when it performs mediocrely, where it is applied matters little. This gives a ranking criterion for per-structure feature flags.

### D. Effectiveness of latency hiding

Whether double-session pre-encoding hides encoding latency depends on whether the clinician's dwell time on the current slice covers the encoding of the next. Dwell time is precisely the denominator of the economics model:

```
t_interaction(p) = t_v + p·t_a + (1 − p)·(t_r + t_m)
```

At `t_m = 25 s`, `t_interaction ≈ 7.0 s` for p = 0.8, about 4.5 s for p = 0.9, and about 3.2 s for p = 0.95. Against a WebGPU encode of 1–3 s:

- **p ≤ 0.95 with WebGPU available**: encoding is fully hidden and the clinician never perceives it.
- **p → 1 (a near-perfect model)**: `t_interaction → 1.9 s`, approaching the upper bound of encode time, and perceptible waiting begins.
- **WASM path**: 5–15 s of encoding exceeds dwell time at any acceptance rate and cannot be hidden.

The second point is a pleasing counter-intuition: **the more accurate the model, the harder latency hiding becomes**, because dwell time shrinks and the prefetch window narrows with it. Latency optimization and accuracy optimization are therefore not independent fronts — past a certain accuracy, the bottleneck switches from "the model isn't good enough" to "encoding isn't fast enough". The product response is to deepen prefetch from one slice to two or three, at a cost of 4 MiB and one GPU queue slot per additional slice.

### E. Cache behavior

The benefit of the embedding cache is exactly the encoding time it saves. Under the typical propagation access pattern — advancing in one direction with occasional back-tracking to review — prefetching along the scroll direction achieves roughly twice the hit rate of blindly prefetching one side. On back-tracking, L1 and L2 hits make revisiting earlier slices essentially instantaneous, which materially affects whether clinicians bother to review at all: if looking back costs two seconds, they tend not to look back.

The model cache (L3) pays off more directly: a 3–10 s cold download drops below 1 s when warm. That determines whether "enable AI" can be a switch one flips casually rather than a wait one braces for.

## XI. Discussion

### A. The intrinsic cost of a 2D foundation model on a 3D task

SAM is two-dimensional; volumetric consistency is obtained by inter-slice propagation. Two structural problems follow.

**Error accumulates along the propagation direction.** Slice `k`'s prompt is sampled from slice `k−1`'s confirmed annotation. If slice `k−1` spilled slightly and the clinician accepted it (because it looked harmless), that spill becomes the prompt source for slice `k` and may be amplified. The longer the chain, the larger the drift. Three mitigations apply: cap consecutive automatic acceptances (we force a full review after eight slices), anchor prompts to the original manual slice rather than the most recent one, and interrupt propagation when the rate of volume change exceeds a threshold.

**Degradation at the poles.** As noted in §VI-C, foreground area collapses near the superior and inferior extents and prompt quality collapses with it. Our handling is to stop propagating rather than push through: returning the hardest region to the clinician is faster than offering a proposal requiring heavy revision. In the economics model this is immediate — a proposal certain to be rejected contributes `−(t_v + t_r)`.

Native volumetric models such as nnInteractive have neither problem, which is the core reason for retaining Path B. The division of labor states simply: **structures that are continuous across slices with gradual morphology go through Path A; structures with abrupt morphology, multiple components, or text-specified identity go through Path B.**

### B. Generalizing the window-level problem

The cache-key issue in §V-C is one manifestation of a larger class: **when a model's input is a rendering rather than raw pixels, the rendering parameters are part of the model input.** Corollaries include:

- The cache key must contain every rendering parameter — window width and center, VOI LUT, pseudo-color map, invert flag.
- A reproducibility statement about the model must include the rendering parameters, or "same data, same model, different result" is misdiagnosed as nondeterminism.
- The `prompt` snapshot in the provenance record (§VIII-A) must also capture the window in force, or after-the-fact reproduction fails.

This problem does not arise in natural-image AI, where the JPEG *is* the final pixels. It arises everywhere in medical imaging, because DICOM separates pixel data from presentation state. Any engineering effort porting a general vision model onto medical images will meet it somewhere.

### C. Clinical asymmetry in thresholds and post-processing

The per-structure threshold configuration of §IV-D rests on a more general principle: **the default hyperparameters of a general vision model are tuned for what looks good on average, while clinical costs are asymmetric.** Over- and under-segmentation lose IoU symmetrically on natural images; in radiotherapy one causes geographic miss and the other over-constrains dose, and they are not interchangeable.

The same holds for island removal, edge smoothing, and largest-connected-component filtering — all the "harmless-looking" post-processing. Their shared flaw is treating statistically rare morphology as noise. In medical imaging, rare morphology is frequently the thing being looked for: an isolated metastasis, a discontinuous infiltration, a post-operative cavity. **Post-processing enabled by default is a mechanism for systematically filtering out exactly those findings.** Our choice is to disable all post-processing by default and enable it explicitly per structure.

### D. Data governance and supply chain

Browser-resident inference keeps pixel data on the workstation, which delivers C1 and is why the `inference_site` column can serve as evidence. But there is an easily overlooked gap in the other direction: **the provenance of the model binary.** The reference implementation pulls ONNX weights from a public CDN, meaning a hospital workstation initiates a 197 MB outbound download. In an isolated network it simply fails; in a network with egress it is an unpinned supply-chain dependency — weights can be swapped, and the resulting shift in segmentation is not easy to notice.

Our handling is that models must be self-hosted with integrity verification:

```typescript
const MODEL_MANIFEST = {
  'sam-b-encoder': {
    url: '/models/sam_vit_b_01ec64.encoder-fp16.onnx',
    sha256: '…',       // written at build time, verified at runtime
    sizeBytes: 188_743_680,
  },
  'sam-b-decoder': { url: '/models/sam_vit_b_01ec64.decoder.onnx', sha256: '…', sizeBytes: 17_825_792 },
} as const

async function fetchAndVerify(name: keyof typeof MODEL_MANIFEST): Promise<ArrayBuffer> {
  const spec = MODEL_MANIFEST[name]
  const buf = await (await fetch(spec.url)).arrayBuffer()
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))]
    .map((b) => b.toString(16).padStart(2, '0')).join('')
  // Integrity failure must be fatal: a swapped weight raises no error,
  // it silently produces shifted boundaries
  if (digest !== spec.sha256) throw new Error(`[ai] model integrity check failed: ${name}`)
  return buf
}
```

The same logic applies to Path B models: the model registry must record weight hashes and provenance, and those hashes must reconcile with `model_version` in the audit record. Otherwise the sentence "this is the model that produced this segmentation" cannot be substantiated after the fact.

### E. Limitations

Four limitations apply. **First**, accuracy evaluation is out of scope (§IX-E), so the acceptance rate `p` is a parameter here rather than a measured value; production `DECISION` events will yield its true distribution, but that requires sufficient accumulated clinical use. **Second**, the economics model assumes `t_m`, `t_v`, and `t_r` are independent and identically distributed across slices, whereas clinicians accelerate after several consecutive acceptances (having learned the morphology) and slow markedly on difficult slices; the model gives an estimate in the mean. **Third**, system benchmarks come from a limited hardware configuration, and differences between browsers' WebGPU implementations were not compared. **Fourth**, this paper treats only labelmap-form segmentation and does not address the equivalent questions under RTStruct contour representation, where the topological constraints (contours must close and must not self-intersect) differ substantively.

## XII. Conclusion

We presented and implemented a dual-path promptable medical image segmentation system: an in-browser SAM path carrying interaction-dense ordinary segmentation, an on-premise GPU path carrying volumetric and text-prompted models, and one shared prompt vocabulary, preview–sign-off state machine, and DICOM SEG output across both. System benchmarks show the architecture delivers interactive response (50–200 ms decoding) without a GPU server and without images leaving the workstation, at a cost of 1–3 s of encoding per slice — an overhead that double-session pre-encoding hides completely at acceptance rates up to 0.95.

Three design findings extend beyond this implementation. **The window-level-sensitive cache key**: when model input is a rendering, rendering parameters must enter the cache key, or silently wrong segmentations follow; the principle applies to every effort porting a general vision model onto DICOM. **The interaction economics model**: it reduces "is AI assistance faster?" to the acceptance threshold `p* = (t_v + t_r) / (t_r + t_m − t_a)`, roughly 10% under typical parameters, and reveals two counter-intuitive results — speedup is superlinear in the high-acceptance regime, and a more accurate model makes latency hiding harder. **The asymmetry of clinical cost**: default thresholds and post-processing in general vision models are tuned for symmetric costs and do not match radiotherapy, so both should be configured per structure semantics rather than set globally.

Three directions follow. Use production `DECISION` data to calibrate the economics model online and drive per-structure feature flags. Introduce lightweight volumetric consistency constraints on Path A (inter-slice deformation regularization, for instance) to curb propagation drift. And fold `inference_site` and model hashes into formally verifiable claims, so that data flow and model identity become automatically auditable properties rather than documented promises.

## References

[1] A. Kirillov, E. Mintun, N. Ravi, et al., "Segment Anything," in *Proc. IEEE/CVF Int. Conf. Comput. Vis. (ICCV)*, 2023, pp. 4015–4026.

[2] J. Ma, Y. He, F. Li, L. Han, C. You, and B. Wang, "Segment anything in medical images," *Nature Communications*, vol. 15, art. 654, 2024.

[3] F. Isensee, P. F. Jaeger, S. A. A. Kohl, J. Petersen, and K. H. Maier-Hein, "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation," *Nature Methods*, vol. 18, no. 2, pp. 203–211, 2021.

[4] J. Wasserthal, H.-C. Breit, M. T. Meyer, et al., "TotalSegmentator: Robust segmentation of 104 anatomic structures in CT images," *Radiology: Artificial Intelligence*, vol. 5, no. 5, e230024, 2023.

[5] N. Ravi, V. Gabeur, Y.-T. Hu, et al., "SAM 2: Segment Anything in Images and Videos," arXiv:2408.00714, 2024.

[6] F. Isensee, M. Rokuss, L. Krämer, et al., "nnInteractive: Redefining 3D Promptable Segmentation," arXiv:2503.08373, 2025.

[7] O. Ronneberger, P. Fischer, and T. Brox, "U-Net: Convolutional networks for biomedical image segmentation," in *Proc. MICCAI*, 2015, pp. 234–241.

[8] E. Ziegler, T. Urban, D. Brown, et al., "Open Health Imaging Foundation Viewer: An extensible open-source framework for building web-based imaging applications to support cancer research," *JCO Clinical Cancer Informatics*, vol. 4, pp. 336–345, 2020.

[9] M. J. Cardoso, W. Li, R. Brown, et al., "MONAI: An open-source framework for deep learning in healthcare," arXiv:2211.02701, 2022.

[10] C. S. Mayo, J. M. Moran, W. Bosch, et al., "American Association of Physicists in Medicine Task Group 263: Standardizing nomenclatures in radiation oncology," *International Journal of Radiation Oncology · Biology · Physics*, vol. 100, no. 4, pp. 1057–1066, 2018.

[11] National Electrical Manufacturers Association, *Digital Imaging and Communications in Medicine (DICOM) Standard, Part 3: Information Object Definitions*, PS3.3, 2024.

[12] A. Fedorov, D. Clunie, E. Ulrich, et al., "DICOM for quantitative imaging biomarker development: a standards based approach to sharing clinical data and structured PET/CT analysis results in head and neck cancer research," *PeerJ*, vol. 4, e2057, 2016.

[13] ONNX Runtime developers, "ONNX Runtime: cross-platform, high performance ML inferencing," https://onnxruntime.ai, 2024.

[14] A. Dosovitskiy, L. Beyer, A. Kolesnikov, et al., "An image is worth 16×16 words: Transformers for image recognition at scale," in *Proc. ICLR*, 2021.

[15] K. He, X. Chen, S. Xie, Y. Li, P. Dollár, and R. Girshick, "Masked autoencoders are scalable vision learners," in *Proc. IEEE/CVF Conf. Comput. Vis. Pattern Recognit. (CVPR)*, 2022, pp. 16000–16009.

[16] V. Vezhnevets and V. Konouchine, "GrowCut: Interactive multi-label N-D image segmentation by cellular automata," in *Proc. Graphicon*, 2005, pp. 150–156.

[17] G. C. Sharp, K. D. Fritscher, V. Pekar, et al., "Vision 20/20: Perspectives on automated image segmentation for radiotherapy," *Medical Physics*, vol. 41, no. 5, 050902, 2014.

[18] C. E. Cardenas, J. Yang, B. M. Anderson, L. E. Court, and K. B. Brock, "Advances in auto-segmentation," *Seminars in Radiation Oncology*, vol. 29, no. 3, pp. 185–197, 2019.

[19] N. Xu, B. Price, S. Cohen, J. Yang, and T. Huang, "Deep interactive object selection," in *Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR)*, 2016, pp. 373–381.

[20] G. Wang, W. Li, M. A. Zuluaga, et al., "DeepIGeoS: A deep interactive geodesic framework for medical image segmentation," *IEEE Trans. Pattern Anal. Mach. Intell.*, vol. 41, no. 7, pp. 1559–1572, 2019.

[21] C. P. Bridge, C. Gorman, S. Pieper, et al., "Highdicom: a Python library for standardized encoding of image annotations and machine learning model outputs in clinical imaging," *Journal of Digital Imaging*, vol. 35, pp. 1719–1737, 2022.

[22] L. Maier-Hein, A. Reinke, P. Godau, et al., "Metrics reloaded: recommendations for image analysis validation," *Nature Methods*, vol. 21, pp. 195–212, 2024.

[23] A. Reinke, M. D. Tizabi, M. Baumgartner, et al., "Understanding metric-related pitfalls in image analysis validation," *Nature Methods*, vol. 21, pp. 182–194, 2024.

[24] W3C GPU for the Web Working Group, *WebGPU*, W3C Candidate Recommendation Draft, 2024.

[25] L. R. Dice, "Measures of the amount of ecologic association between species," *Ecology*, vol. 26, no. 3, pp. 297–302, 1945.

[26] D. P. Huttenlocher, G. A. Klanderman, and W. J. Rucklidge, "Comparing images using the Hausdorff distance," *IEEE Trans. Pattern Anal. Mach. Intell.*, vol. 15, no. 9, pp. 850–863, 1993.

[27] Center for Medical Device Evaluation, National Medical Products Administration (China), *Guiding Principles for the Registration Review of Artificial Intelligence Medical Devices*, 2022.

[28] European Parliament and Council, *Regulation (EU) 2017/745 on Medical Devices (MDR)*, 2017.

[29] C. Pinter, A. Lasso, A. Wang, D. Jaffray, and G. Fichtinger, "SlicerRT: radiation therapy research toolkit for 3D Slicer," *Medical Physics*, vol. 39, no. 10, pp. 6332–6338, 2012.

[30] G. A. Ezzell, J. W. Burmeister, N. Dogan, et al., "IMRT commissioning: multiple institution planning and dosimetry comparisons, a report from AAPM Task Group 119," *Medical Physics*, vol. 36, no. 11, pp. 5359–5373, 2009.

[31] E. Mosqueira-Rey, E. Hernández-Pereira, D. Alonso-Ríos, J. Bobes-Bascarán, and Á. Fernández-Leal, "Human-in-the-loop machine learning: a state of the art," *Artificial Intelligence Review*, vol. 56, pp. 3005–3054, 2023.

[32] N. Rieke, J. Hancox, W. Li, et al., "The future of digital health with federated learning," *npj Digital Medicine*, vol. 3, art. 119, 2020.

[33] WHATWG, *File System Living Standard* (Origin Private File System), 2024.

[34] S. Nikolov, S. Blackwell, A. Zverovitch, et al., "Clinically applicable segmentation of head and neck anatomy for radiotherapy: Deep learning algorithm development and validation study," *Journal of Medical Internet Research*, vol. 23, no. 7, e26151, 2021.
