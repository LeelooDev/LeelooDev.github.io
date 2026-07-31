---
title: Notes on an AI Radiotherapy Contouring Workbench
group: Medical Imaging
coverAlt: An AI-assisted radiotherapy contouring and review workbench
---

This is a six-document design set (numbered RTC-00 through RTC-05) covering the product plan, requirements, system design, frontend guide, deployment and compliance, and competitive analysis. These notes condense it into one piece, ordered as: why build it, what it looks like, and where the boundaries are.

The whole set revolves around a single sentence, worth memorizing first:

> **The AI proposes; the physician reviews, corrects, and makes the final decision. The system only makes that process faster, clearer, and traceable — it never decides for the physician. Dose calculation and plan optimization stay with the TPS.**

That sentence is the product's red line. It is three things at once: the positioning, the differentiator, and the compliance strategy. Any feature that conflicts with it loses.

## What radiotherapy contouring actually is

Radiotherapy sits alongside surgery and chemotherapy as one of the three main cancer treatments, covering nearly 95% of cancer types and about 50% of cancer patients. Before treatment, the physician draws two kinds of structures slice by slice on the planning CT:

- **Targets** (GTV / CTV / PTV): the tumor region to be irradiated, plus its margins.
- **Organs at risk** (OAR): the healthy organs to protect and keep under dose limits — spinal cord, lungs, heart.

How accurately these are drawn determines where the dose lands, and therefore both the outcome and the side effects. It is the first step of planning, and the most labor-intensive one.

The pain points are concentrated:

- **Extremely time-consuming.** A patient needs 300 to 400 planning CT slices before treatment, drawn by hand, slice by slice. Radiation oncologists spend roughly half their working day contouring.
- **Scarce expertise.** Radiation oncologists and medical physicists are in short supply. Plenty of regional hospitals have installed the equipment and cannot staff it.
- **Poor consistency.** Contouring depends heavily on personal experience; different physicians and different centers draw the same structure noticeably differently.
- **Adaptive radiotherapy magnifies the problem.** Online adaptive radiotherapy (oART) requires re-contouring and re-planning while the patient is on the treatment couch, in a window measured in minutes. Manual contouring simply cannot keep up.

## Why now

**Equipment is rolling out, and software demand follows.** By WHO standards China needs roughly 11,000 medical linear accelerators; the installed base at the end of 2022 was around 3,000, about 1.5 per million people, below the WHO standard of 2 to 4. The 14th Five-Year Plan adds nearly 994 accelerators (about 46.5% growth), with MR simulators growing 351.7%. Every additional accelerator implies another set of contouring, planning, and review software.

**Localization is mandated.** In 2021 the Ministry of Finance and the Ministry of Industry and Information Technology jointly required 100% domestic sourcing for treatment planning systems (TPS), oncology information systems, and image-guided accelerator systems, and 75% for linear accelerators. Imported radiotherapy software has to give way in procurement.

**The field is uncrowded.** Unlike diagnostic AI — lung nodules, fundus, cardiovascular — where everyone piles in, there are few players in radiotherapy contouring, and most of them lead with the algorithm while the editing and review experience lags.

Market context: China's radiotherapy oncology market grew from ¥27.2B in 2016 to ¥51.7B in 2021, a CAGR of about 13.7%.

## The competitive landscape, and where we sit

| Tier | Representative | Strength | The opening |
|------|----------------|----------|-------------|
| Contouring specialists | LinkingMed, Perception Vision, Vision & Image, SenseCare | Mature algorithms, clinical data, some certified | Interface built around the algorithm; weak editing and review; closed models |
| Imported TPS / contouring | Varian, Elekta, RayStation, MIM | Complete workflow, clinically trusted | Expensive, closed, desktop-first, and displaced by localization policy |
| Open-source models | TotalSegmentator, MONAI, nnU-Net | Free, accuracy is competitive | Models only — no clinical workflow, no editing product |
| Equipment vendors | United Imaging uRT, Our United | Bundled with their own accelerators | Locked to their own ecosystem, neither open nor neutral |

The conclusion fits in one line: **don't build yet another contouring algorithm; build a model-neutral "correction editor plus review cockpit" workbench.** The moat is the editing and review interface, not model accuracy.

## How one contouring case runs end to end

<figure class="diagram">
<svg viewBox="0 0 800 336" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="End-to-end contouring flow: pulling the planning CT, requesting an AI draft, gateway dispatch to an external model, draft production, physician editing and e-signature, then RTStruct handoff to the TPS">
<defs>
<marker id="rtce-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="30" y="40" width="155" height="46" rx="9"/>
<rect x="225" y="40" width="155" height="46" rx="9"/>
<rect x="615" y="40" width="155" height="46" rx="9"/>
<rect x="615" y="150" width="155" height="46" rx="9"/>
<rect x="225" y="150" width="155" height="46" rx="9"/>
<rect x="225" y="260" width="155" height="46" rx="9"/>
<rect x="420" y="260" width="155" height="46" rx="9"/>
</g>
<g fill="#ffffff" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 4">
<rect x="420" y="150" width="155" height="46" rx="9"/>
<rect x="615" y="260" width="155" height="46" rx="9"/>
</g>
<g fill="#25262b">
<rect x="420" y="40" width="155" height="46" rx="9"/>
<rect x="30" y="150" width="155" height="46" rx="9"/>
<rect x="30" y="260" width="155" height="46" rx="9"/>
</g>
<g text-anchor="middle" font-size="12" fill="#25262b">
<text x="107" y="61">Planning CT / MR</text>
<text x="302" y="61">PACS image library</text>
<text x="692" y="61">Backend auth + log</text>
<text x="692" y="173">Contouring gateway</text>
<text x="497" y="173">Model GPU inference</text>
<text x="302" y="173">SEG draft produced</text>
<text x="302" y="281">SEG → RTStruct</text>
<text x="497" y="281">Push to TPS / PACS</text>
<text x="692" y="281">TPS dose &#38; planning</text>
</g>
<g text-anchor="middle" font-size="12" fill="#ffffff" font-weight="600">
<text x="497" y="61">Ask for AI draft</text>
<text x="107" y="173">Physician edits</text>
<text x="107" y="281">Physician signs off</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="107" y="77">Simulator / linac</text>
<text x="302" y="77">DICOMweb</text>
<text x="692" y="77">Event AI_SUGGEST</text>
<text x="692" y="189">Model-neutral, draft only</text>
<text x="497" y="189">Vendor / OSS / in-house</text>
<text x="302" y="189">Marked awaiting review</text>
<text x="302" y="297">TG-263 name mapping</text>
<text x="497" y="297">Only after sign-off</text>
<text x="692" y="297">External, out of scope</text>
</g>
<g text-anchor="middle" font-size="10" fill="#ffffff" opacity="0.72">
<text x="497" y="77">Pick model and set</text>
<text x="107" y="189">Every edit logged: EDIT</text>
<text x="107" y="297">Event SIGN_OFF</text>
</g>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#rtce-arrow)" fill="none">
<line x1="185" y1="63" x2="223" y2="63"/>
<line x1="380" y1="63" x2="418" y2="63"/>
<line x1="575" y1="63" x2="613" y2="63"/>
<line x1="692" y1="86" x2="692" y2="148"/>
<line x1="615" y1="173" x2="577" y2="173"/>
<line x1="420" y1="173" x2="382" y2="173"/>
<line x1="225" y1="173" x2="187" y2="173"/>
<line x1="107" y1="196" x2="107" y2="258"/>
<line x1="185" y1="283" x2="223" y2="283"/>
<line x1="380" y1="283" x2="418" y2="283"/>
<line x1="575" y1="283" x2="613" y2="283"/>
</g>
<text x="30" y="24" font-size="10.5" fill="#6b6e76">Dark blocks = the physician's own actions · Dashed = external systems</text>
</svg>
<figcaption>End-to-end flow of one routine contouring case</figcaption>
</figure>

Technology choices: OHIF v3 extensions on the frontend; Spring Boot or ASP.NET Core for the business backend; FastAPI for the orchestration gateway; PostgreSQL for storage; Redis or RabbitMQ for cache and queue; DICOMweb for imaging; DICOM SEG for AI drafts; DICOM-RT RTStruct for the TPS handoff.

A few design trade-offs are worth recording on their own:

**The frontend talks to neither the gateway nor the TPS directly.** Every request goes through the business backend, which handles auth, proxying, and logging. That gives the audit chain a single entry point, with no path that bypasses it.

**The orchestration gateway is model-neutral.** Each model — vendor, open-source engine, or in-house — gets an adapter that normalizes it to one interface. Adding a model means writing an adapter, inserting one registry row, and configuring the structure set. The frontend and the workflow do not change.

**"Draft" is encoded in the data structure.** The task creation response carries a field permanently set to `suggestion`, and every structure returned is tagged `origin: "ai"` and `status: "suggested"`:

```json
{
  "taskId": "rtc-20260712-3f9a",
  "status": "QUEUED",
  "kind": "suggestion"
}
```

A red line cannot live only in the copy. It has to live in the fields, so that overstepping it stops making sense at the data layer.

One more field in the model registry deserves attention — `contains_target`, marking whether a model touches target volumes. That boolean maps directly onto the regulatory pathway, which comes up in the compliance section below:

```sql
CREATE TABLE rt_model (
  model           VARCHAR(64) PRIMARY KEY,
  display_name    VARCHAR(128) NOT NULL,
  vendor          VARCHAR(64),          -- external vendor, for liability attribution
  modality        JSONB NOT NULL,       -- ["CT","CBCT","MR"]
  structure_set   JSONB NOT NULL,
  contains_target BOOLEAN NOT NULL DEFAULT false, -- targets? affects registration path
  default_version VARCHAR(32),
  status          VARCHAR(16) NOT NULL DEFAULT 'DISABLED'
);
```

## State machine and audit chain

The audit chain is the compliance core of the product and its hardest differentiator. It answers a legal question: **who actually made this contouring decision.**

<figure class="diagram">
<svg viewBox="0 0 800 286" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contouring state machine and audit chain: four states with a discard branch, and the four audit event types written beneath them">
<defs>
<marker id="rtce2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<path d="M 300 50 V 26 H 110 V 48" stroke="#9a9da6" stroke-width="1.3" stroke-dasharray="4 4" fill="none" marker-end="url(#rtce2-arrow)"/>
<text x="205" y="20" text-anchor="middle" font-size="10" fill="#6b6e76">Discard edits, request a new draft</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="40" y="50" width="140" height="40" rx="9"/>
<rect x="610" y="50" width="140" height="40" rx="9"/>
<rect x="40" y="124" width="140" height="34" rx="8" stroke-dasharray="5 4"/>
</g>
<g fill="#25262b">
<rect x="230" y="50" width="140" height="40" rx="9"/>
<rect x="420" y="50" width="140" height="40" rx="9"/>
</g>
<g text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12">
<text x="110" y="75" fill="#25262b">AI_SUGGESTED</text>
<text x="680" y="75" fill="#25262b">EXPORTED</text>
<text x="110" y="146" fill="#6b6e76">DISCARDED</text>
<text x="300" y="75" fill="#ffffff">EDITING</text>
<text x="490" y="75" fill="#ffffff">SIGNED_OFF</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="110" y="108">Generated, awaiting review</text>
<text x="300" y="108">Physician is editing</text>
<text x="490" y="108">Physician e-signature</text>
<text x="680" y="108">System exports</text>
</g>
<text x="194" y="145" font-size="10" fill="#6b6e76">Physician drops the draft</text>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#rtce2-arrow)">
<line x1="180" y1="70" x2="228" y2="70"/>
<line x1="370" y1="70" x2="418" y2="70"/>
<line x1="560" y1="70" x2="608" y2="70"/>
<line x1="110" y1="90" x2="110" y2="122"/>
</g>
<text x="400" y="184" text-anchor="middle" font-size="11" fill="#25262b">Every transition appends to the audit chain — append-only, retained long term</text>
<rect x="40" y="198" width="710" height="62" rx="10" fill="#ffffff" stroke="#9a9da6" stroke-width="1.5"/>
<g stroke="#d6d8de" stroke-width="1">
<line x1="217" y1="198" x2="217" y2="260"/>
<line x1="395" y1="198" x2="395" y2="260"/>
<line x1="572" y1="198" x2="572" y2="260"/>
</g>
<g text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11.5" fill="#25262b">
<text x="128" y="222">AI_SUGGEST</text>
<text x="306" y="222">EDIT</text>
<text x="483" y="222">SIGN_OFF</text>
<text x="661" y="222">EXPORT</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="128" y="243">Which model, which version</text>
<text x="306" y="243">Who, when, which structure</text>
<text x="483" y="243">Approver, signature, time</text>
<text x="661" y="243">Export record and target</text>
</g>
</svg>
<figcaption>The contouring state machine and its four audit events</figcaption>
</figure>

There is one constraint, and it is rigid: **only `SIGNED_OFF` may advance to `EXPORTED`.** Anything exported before sign-off is labeled a draft, in the interface and in the file itself.

The audit table is append-only and tamper-evident, archived periodically to separate storage, with a retention period matched to radiotherapy records (≥ 10 years is the suggestion; hospital policy governs):

```sql
CREATE TABLE rt_contour_audit (
  id            BIGSERIAL PRIMARY KEY,
  case_id       VARCHAR(64) NOT NULL,
  series_uid    VARCHAR(128) NOT NULL,
  structure     VARCHAR(64) NOT NULL,
  -- event types: AI_SUGGEST / EDIT / SIGN_OFF / DISCARD / EXPORT
  event_type    VARCHAR(24) NOT NULL,
  origin        VARCHAR(8),             -- ai / human
  model         VARCHAR(64),            -- if from AI, record model and version
  model_version VARCHAR(32),
  user_id       VARCHAR(64),
  detail        JSONB,                  -- edit summary: structure, slices, volume delta
  signature     VARCHAR(256),           -- sign-off signature, SIGN_OFF events only
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Any sign-off can then be reconstructed in full: which vendor's model at which version produced the draft, what the physician changed at each step, and who signed at what time.

In regulatory terms, this logging corresponds to "the AI assists; the responsible clinician makes the determination." The system's value is making the human's decision provable, traceable, and defensible.

## Frontend: how to build it on OHIF

Integrate as a custom Extension plus Mode, **without forking the OHIF core**, so upstream upgrades stay available. Reuse OHIF's segmentation rendering extension (`@ohif/extension-cornerstone-dicom-seg`) and its 3D capabilities, and layer the radiotherapy editing, sign-off, and review interfaces on top.

```
extensions/rt-contouring/
├── src/
│   ├── index.tsx                 # register command / panel / toolbar / mode
│   ├── api/backendClient.ts      # backend: draft / task / sign-off / export
│   ├── ws/taskSocket.ts          # task status push
│   ├── panels/
│   │   ├── StructurePanel.tsx    # structure list: visibility, color, status
│   │   ├── ReviewPanel.tsx       # review cockpit: side-by-side + read-only dose
│   │   └── SignOffPanel.tsx      # sign-off and e-signature
│   ├── tools/
│   │   ├── brush3d.ts            # 3D brush
│   │   ├── interpolate.ts        # inter-slice interpolation
│   │   └── snap.ts               # boundary snapping
│   └── utils/
│       ├── loadSuggestion.ts     # load the AI draft SEG
│       └── exportRTStruct.ts     # trigger backend export
```

When loading a draft, pin origin and status into the metadata. The interface uses that to show an unmistakable draft marker — a dashed boundary or a corner badge — so a draft never looks like a signed-off structure:

```ts
segmentationService.setSegmentationMeta(segDS.SeriesInstanceUID, {
  origin: 'ai',
  status: 'suggested',
  banner: 'AI draft, awaiting physician review',
})
```

The editor's three core tools all exist to make "fixing the AI's drawing" fast:

- **3D brush**: add and erase, adjustable radius, axial/coronal/sagittal views in sync. Each stroke is one undoable operation, summarized into a single EDIT record on save.
- **Inter-slice interpolation**: the physician draws a few key slices and the ones in between are interpolated. Note that interpolated output is also marked awaiting review — it never becomes final on its own.
- **Boundary snapping**: along organ edges with a clear gradient, the brush path snaps to the boundary, saving manual tracing. It is an aid, and the physician can switch it off at any time.

**The review cockpit** is the crux of the oART scenario, presenting four panes side by side: today's images | the original plan's contours | the new AI draft | prior fractions. Deformation differences are highlighted on top, and the sidebar carries read-only DVH and key dose metrics pulled from the TPS.

There is a wording discipline here that gets repeated throughout: **difference highlighting answers "where they differ," never "which one is right."** Every consistency check outputs a prompt, and the copy avoids adjudicating words like pass/fail or correct/incorrect. This is not word games — adjudicating language pushes the product into a higher-risk regulatory class.

The frontend also handles several degradations: when the AI draft is unavailable, prompt that manual contouring is available and do not block the workflow; when a draft's geometry does not align with the images, intercept it rather than load a bad draft; when dose retrieval fails, degrade the cockpit to a no-dose view and point the physicist to the TPS.

## On-premises deployment

Four deployment principles: data never leaves the hospital, assist rather than decide, keep liability traceable, keep models decoupled.

The minimum deployment runs on two machines: an application node (frontend, backend, database, imaging gateway) and a GPU node (orchestration gateway plus external contouring models). Production splits and scales out as needed, with the GPU node isolated and the database never co-located with inference.

<figure class="diagram">
<svg viewBox="0 0 800 322" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="On-premises network zoning: access, business, data, imaging, AI, inference, and radiotherapy zones, all inside the hospital intranet with no outbound connectivity">
<defs>
<marker id="rtce3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9da6"/></marker>
</defs>
<rect x="16" y="40" width="768" height="268" rx="14" fill="none" stroke="#9a9da6" stroke-width="1.5" stroke-dasharray="7 5"/>
<text x="400" y="30" text-anchor="middle" font-size="11.5" fill="#25262b" font-weight="600">Hospital intranet · no outbound connectivity</text>
<g fill="#ffffff" stroke="#9a9da6" stroke-width="1.5">
<rect x="44" y="76" width="196" height="48" rx="9"/>
<rect x="302" y="76" width="196" height="48" rx="9"/>
<rect x="560" y="76" width="196" height="48" rx="9"/>
<rect x="44" y="176" width="196" height="48" rx="9"/>
<rect x="302" y="176" width="196" height="48" rx="9"/>
</g>
<g fill="#ffffff" stroke="#c4c6cd" stroke-width="1.5" stroke-dasharray="5 4">
<rect x="560" y="176" width="196" height="48" rx="9"/>
<rect x="44" y="252" width="196" height="44" rx="9"/>
</g>
<g text-anchor="middle" font-size="12.5" fill="#25262b" font-weight="600">
<text x="142" y="97">Access zone</text>
<text x="400" y="97">Business zone</text>
<text x="658" y="97">Data zone</text>
<text x="142" y="197">Imaging zone</text>
<text x="400" y="197">AI zone</text>
<text x="658" y="197">Inference zone</text>
<text x="142" y="271">RT zone</text>
</g>
<g text-anchor="middle" font-size="10" fill="#6b6e76">
<text x="142" y="114">Nginx + OHIF workstation</text>
<text x="400" y="114">Backend auth · audit · logs</text>
<text x="658" y="114">PostgreSQL + Redis</text>
<text x="142" y="214">PACS / Orthanc</text>
<text x="400" y="214">Contouring gateway</text>
<text x="658" y="214">GPU + external models</text>
<text x="142" y="288">TPS (hospital's existing)</text>
</g>
<g stroke="#9a9da6" stroke-width="1.5" marker-end="url(#rtce3-arrow)">
<line x1="240" y1="100" x2="300" y2="100"/>
<line x1="498" y1="100" x2="558" y2="100"/>
<line x1="142" y1="124" x2="142" y2="174"/>
<line x1="400" y1="124" x2="400" y2="174"/>
<line x1="498" y1="200" x2="558" y2="200"/>
</g>
<path d="M 302 112 H 270 V 274 H 242" stroke="#9a9da6" stroke-width="1.5" fill="none" marker-end="url(#rtce3-arrow)"/>
<g font-size="10" fill="#6b6e76">
<text x="270" y="94" text-anchor="middle">HTTPS</text>
<text x="528" y="94" text-anchor="middle">Encrypted</text>
<text x="150" y="152">DICOMweb</text>
<text x="408" y="152">Service Token</text>
<text x="528" y="194" text-anchor="middle">mTLS</text>
<text x="262" y="240" text-anchor="end">DICOM-RT · RTStruct</text>
<text x="658" y="242" text-anchor="middle">No ports open to workstations</text>
</g>
</svg>
<figcaption>Network zoning: the inference and data zones are unreachable from the access zone</figcaption>
</figure>

Security requirements:

- HTTPS / WSS throughout on an internal CA; Service Token or mTLS between backend and gateway, and between gateway and models.
- Authentication federates with the hospital identity system (LDAP / OAuth2 / CAS). RBAC must **separate contouring rights from sign-off rights** — being able to edit is not the same as being able to sign.
- Temporary patient image caches live on encrypted volumes and are cleared when the task ends.
- No component may write images or patient information anywhere reachable from outside the network.
- Harden to a Level 3 baseline under China's Classified Protection 2.0, and meet the Personal Information Protection Law's requirements for patient data.

## The line that decides registration and compliance

This section is directional, not a conclusion — the actual classification and reimbursement path must be confirmed by radiotherapy device registration and medical insurance advisors against the exact feature boundary.

NMPA's regulatory logic draws a clear line:

- Software that performs routine image processing (3D reconstruction, stitching, basic measurement) or workflow assistance and **outputs no diagnostic conclusion** generally falls under Class II.
- Software used for lesion identification, diagnosis, or treatment decision support, whose **output directly influences the treatment plan**, is high risk and is almost always managed as Class III. Among AI medical software approvals granted to date, the overwhelming majority are Class III.

Mapped onto this product:

| Capability | Distance from "lesion identification" | Registration burden |
|------------|---------------------------------------|---------------------|
| Organ-at-risk (OAR) contouring | Closer to image processing and workflow support | Relatively light |
| Target volume (GTV / CTV) contouring | Adjacent to lesion identification | Markedly heavier, more likely Class III |
| Dose calculation and plan adjudication | Directly determines the treatment plan | Highest — **deliberately excluded** |

That makes the compliance strategy obvious: phase one centers on OAR contouring, editing, review presentation, and audit logging, keeping to the lighter registration path; target contouring becomes a separate capability assessed on its own and released in phases; the whole product holds the line on "draft and presentation" rather than "adjudication and conclusion"; and models stay external, with drafts explicitly attributed to certified or filed third-party models so liability is clearly assigned.

**Deliberately not touching dose keeps the heaviest regulation outside the door.** That is why "dose goes back to the TPS" in the red line is not a concession — it is the design.

## Boundaries: what's in, what's out

In scope:

- The correction editor (3D brush, inter-slice interpolation, boundary snapping, contralateral comparison)
- Model-neutral orchestration (any external contouring AI, drafts only)
- The review cockpit (today's anatomy vs. the original plan, AI draft, prior fractions, TPS dose display)
- Advisory consistency checks (missing structures, differences, geometric anomalies — flagged for attention only)
- Audit logging (the full chain from AI draft to physician edits to sign-off signature)
- RTStruct output and TPS handoff

Handed back:

- Dose calculation and plan optimization → stays in the TPS
- Judging whether a plan is acceptable → the physician decides with the TPS; the system only presents
- Judging whether a contour is correct → the physician signs off; the system only prompts

## Roadmap and the numbers that matter

| Phase | Goal | Delivery |
|-------|------|----------|
| One | Routine contouring workbench | Editor + one external model + RTStruct output + audit logging |
| Two | Model-neutral orchestration + QA prompts | Multi-model orchestration + consistency prompts + audit reports |
| Three | oART review cockpit | Today / original plan / prior fraction comparison + dose display + minute-scale review |
| Four | Multi-center and research | Consistency analysis, template library, research data export |

Key non-functional targets: AI draft returned in < 120 s (thoracic and abdominal OARs at standard resolution); 3D editor interaction ≥ 30 fps; review cockpit first screen < 5 s; RTStruct export and TPS read success ≥ 99.9%; audit chain retained ≥ 10 years.

Phase one has to lock in a radiotherapy center as a clinical co-development partner. That is the entry ticket, not an option.

## What I'd write down

- The moat in this field is the **editing and review interface**, not model accuracy. The algorithm companies' weak spot happens to be a viewer company's strength.
- The red line is not a constraint; it is the design. "Assist only, human decides, dose stays with the TPS" solves positioning, differentiation, and compliance at once.
- The pitch is not "contours faster." It is "decide faster, and be able to prove the physician made the decision." What's being sold is compliance and defensibility.
- The red line has to reach the fields, the state machine, and the audit table. A red line that lives in the copy cannot be held in engineering.

A few things are still open: the backend stack (Spring Boot or ASP.NET Core), the first clinical partner center and target cancer type, whether phase one covers OARs only, which TPS to integrate with (Varian / Elekta / United Imaging / Our United), and the registration class and reimbursement path — that last one has to come from professional advisors against the exact feature boundary, not from a guess.
