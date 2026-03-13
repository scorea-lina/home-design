# PRD v1 — Paradisa Home Project Hub (Local-first, Tailscale-only)

## 0) Summary
Build a **locally hosted** private web app on Veronica’s always-on **Mac mini** to capture all project communication (emails, attachments, meeting transcript PDFs, pasted texts), automatically **tag** and **index** it, provide **full-text search**, enable **crop + markup** workflows on PDFs/images, and auto-generate an **area-tagged kanban** of to-dos extracted aggressively from content.

Primary goals:
- Single source of truth for “paper trail”
- Fast retrieval (search + tags)
- Make “what’s pending?” visible via to-do kanban
- Make “what did we decide?” easy to reference with annotated snippets

Non-goals (v1):
- Public site, SEO, open internet access
- Real-time collaborative editing
- Strict speaker diarization for transcripts (no timestamps, no speaker labels)
- Google Drive ingestion (explicitly out of scope for now; email-only)

---

## 0.1) Scope update (vNext) — Keep Kanban/Inbox, replace other tabs with Links + Images

**Hard constraints:**
- **Keep the Kanban tab and Inbox tab EXACTLY as they are. Do not touch or change those.**

**Remove / do not build out:**
- Search tab
- Transcripts tab
- Canvas tab
- Settings tab

**Build instead:**
- **Links tab** — Pinterest-like board of link cards extracted from emails, with metadata, tags, notes, filtering, and an above-the-fold “View Archived” entrypoint to an archived view.
- **Images tab** — Pinterest-like board of images from emails + uploads, with clone+markup workflow and threading of edited clones to originals.

**Tagging (vNext):**
- There is **one global tag set**.
- Tags are **task-level** as the source of truth (clear + already working).
- Links/Images should **adopt tags from tasks** (and allow manual add/remove).
- New tags are created **only manually** by the user (no automatic tag creation).

---

## 1) Users & Roles

### 1.1 People map (canonical)
- **Veronica** (Client)
- **Zach** (Client, zachkinloch@gmail.com)
- **Amy Alexander** (Designer, a.alexander@paradisahomes.com)
- **Todd Bennett** (Architect, todd.bennett@paradisahomes.com)
- **Marcelino Caro** (CM, marcelino@paradisahomes.com)
- **Daniel Proano** (Finance, daniel@paradisahomes.com)
- **Other Paradisa** (any other sender `@paradisahomes.com` not listed above)

### 1.2 Source types
- Email (agentmail is CC’d / direct-to / forwarded)
- Attachments: PDFs/images/etc.
- Meeting transcript PDFs (Plaud exports; **no timestamps**, **no speaker labels**)
- Pasted SMS transcripts (Marcelino texts pasted into an email sent from Veronica)

---

## 2) Privacy, Security, Access

### 2.1 Access model (v1)
- **Tailscale-only access**, no login screen required.
- Server listens on LAN/local host; remote access relies on Tailscale.
- Optional future enhancement: simple password login.

### 2.2 Data egress policy
- All storage local on Mac mini.
- AI tagging/to-do extraction:
  - May call an external LLM if configured in the system; otherwise can run rule-based.
  - If external calls exist, show a clear “AI processing enabled” indicator in settings.

### 2.3 Audit trail / immutability
- Keep immutable copies of:
  - raw email source (headers + body as received)
  - original attachments (binary)
  - original transcript PDFs (binary)
- Derived artifacts (chunks, tags, OCR text, to-dos, markups) are editable but always link back to immutable sources.

---

## 3) Core Objects / Data Model (high-level)

### 3.1 Entities

#### SourceEmail
- id
- message_id / thread_id (when available)
- from, to, cc, date
- subject
- raw_body (original)
- normalized_body (cleaned text)
- source_type: {forwarded, cc, direct}
- attachments[] (FK)
- derived_chunks[] (FK)

#### Attachment
- id
- email_id (FK)
- filename, mime_type, size
- sha256 hash (dedupe)
- storage_path
- extracted_text (OCR/text extraction)
- preview thumbnails (optional)
- derived_markups[] (FK)

#### MeetingTranscript
- id
- attachment_id (FK to transcript PDF)
- meeting_title (parsed)
- meeting_date (parsed; fallback email date)
- text_extracted
- chunks[] (FK)
- tags[] (FK)
- to_dos[] (FK)

#### Chunk (atomic unit for quoting + optional “who said what”)
- id
- parent_type: {email, meeting_transcript}
- parent_id
- order_index
- text
- speaker_person_id (nullable; default null/Unknown)
- source_link (pointer back to parent + offset info if possible)

#### Person
- id
- display_name
- emails[]
- role_label: {Client, Designer, Architect, CM, Finance, Other}

#### Tag
- id
- name (e.g., Kitchen, Utility Room, Budget)
- category: {Area, Topic}
- active boolean

#### TagAssignment
- tag_id
- target_type: {email, attachment, meeting_transcript, markup, todo, chunk}
- target_id
- confidence: {manual, auto_high, auto_low}
- created_at

#### ToDo
- id
- title (short)
- description (optional)
- status: {Open, Resolved, Archived, Removed}
- raised_by_person_id (nullable)
- raised_at_date (date)
- source_links[] (email/chunk/transcript)
- tags[] (same tag system)
- undo_token (for immediate undo of removal)

#### MarkupArtifact
- id
- source_attachment_id (FK)
- crop_rect (page + coordinates)
- annotations (vector model)
- render_png_path (flattened)
- version (v1, v2, v3… per save)
- tags[]
- comments[]

---

## 4) Tagging System

### 4.1 Multi-tag support
- Everything can have **multiple tags**.

### 4.2 Starting tag set
Seed with Veronica’s list, plus required topic tags.

**Areas (seed):**
- Exterior, Entryway, Living, Dining, Kitchen, Pantry, Mudroom, Utility Room, Laundry Machines, Powder Bath, 1st floor Office, 2nd floor Bedrooms, 2nd floor Bathrooms, Primary Bedroom, Primary Closet, Primary Bathroom, Hallways/Stairs, Arches, Garage, Under the stair storage, Light fixtures, Windows, Doors, Vent hood, Kitchen counter, Bathroom counter, Counter, Cabinets, Built-In, Drawers, Wine Fridge, Wallpaper, Pool, Casita, Pool Bath

**Topics (seed):**
- **Budget** (must-have)
- Finance (optional), Allowances (optional), Timeline (optional), Decisions (optional), Open Questions (optional), Procurement (optional)

### 4.3 Naming rules
- Room name is **Utility Room** (canonical). Use **Laundry Machines** only for the appliances.
- Powder Bath is distinct from other bathrooms.
- No hierarchical tags.

---

## 5) Ingestion & Processing Pipeline

### 5.1 Email ingestion (agentmail)
**Inputs:**
- Emails where agentmail is CC’d
- Emails sent to agentmail directly
- Emails forwarded to agentmail
- Plaud transcript PDFs emailed in
- Pasted SMS logs emailed in

**Processing stages (idempotent):**
1) Receive email → store raw
2) Parse headers/body/attachments
3) **Deduplicate**
   - Primary: Message-ID
   - Secondary: sha256(normalized body) + attachment hashes + subject/date heuristics
4) Store attachments binary + metadata
5) Normalize email body text
6) Chunking:
   - Split on quoted replies (“On <date>, <name> wrote:”), blockquotes, signatures, blank lines
   - Store each chunk as a quote-able unit
7) Person attribution:
   - For emails: sender → person_id mapping
   - For pasted SMS: treat as Unknown unless explicit markers exist
8) Auto-tag suggestions:
   - Keyword/tag dictionary + optional model
   - Persist as suggestions (or apply with low confidence)
9) Search indexing:
   - Add email, chunks, and attachment text to full-text index
10) To-do extraction:
   - Aggressive extraction (catch everything), create ToDos with tags + source links

### 5.2 Transcript ingestion (Plaud PDFs)
- Each **transcript PDF = 1 meeting**.
- Extract meeting title + date from (in order):
  1) transcript header inside PDF (preferred)
  2) filename (if available)
  3) email date (fallback)
- Extract text from PDF (P0: typed/clean)
- Chunk transcript into paragraphs/turn-ish blocks
- Speaker attribution:
  - Default Unknown; leaving blank is acceptable and preferred when ambiguous
  - Provide fast manual assignment UI

### 5.3 OCR
- P0: typed PDFs + clean scans
- Nice-to-have: screenshots/photos of plans
- Not needed: handwriting

---

## 6) UI / UX (screens)

### 6.1 Global layout (vNext)
- Left nav: **Inbox / To-Dos (Kanban) / Links / Images**
- Remove from nav: Search / Transcripts / Canvas / Settings

### 6.2 Inbox (Paper Trail)
- **Frozen: keep exactly as-is** (per scope update)

### 6.3 Links (Pinterest-like)
- Board of link cards extracted from emails
- Each link → its own card
- Card shows:
  - short summary
  - clickable link (opens new tab)
  - tags (derived from related task tags)
  - OpenGraph preview if available
  - email sent datetime
  - notes (manual)
- Filtering: by tags
- Sorting: newest → oldest by email sent datetime (top-left newest)
- Archive:
  - Above the fold: **“View Archived”** link
  - Separate archived view/page

### 6.4 Images (Pinterest-like)
- Board of images associated with the project
- Sources:
  - Email inline + attachments (dedupe only when confidently identical)
  - User uploads (images + PDFs + Slides converted to images)
- Clicking image opens a detail surface with:
  - original image
  - threaded clone list
  - **Clone** button
  - markup tools (arrows/lines/shapes/text) producing flattened saved clones
- Tagging:
  - Email-sourced images adopt tags from related tasks
  - Upload-sourced images can be tagged manually (and can create new tags)

### 6.7 To-Dos (Kanban)
- Columns: Open | Resolved | (Archived hidden by default)
- Removed items go to “Trash” with immediate undo
- Card shows:
  - Title
  - Raised-by (if known)
  - Hover: date raised
  - Tags
- Actions:
  - Manual add ticket
  - Mark resolved
  - Archive (from Open or Resolved)
  - Remove + Undo

---

## 7) To-Do Extraction Spec (behavior)

**Inputs:**
- Email chunks
- Transcript chunks

**Extract:**
- explicit commitments (“I’ll send…”, “we will update…”, “I’ll price…”)
- implicit next steps (“we need to…”, “should…”, “next…”, “follow up…”)
- unresolved decisions/questions (“do we want…”, “need to decide…”, “confirm…”)

**Fields:**
- title: concise imperative
- raised_at_date: meeting date (for transcripts) or email date
- raised_by: inferred if clear; else null
- tags: inferred; else empty
- source link: chunk + parent doc

**Aggressiveness:**
- Bias toward over-capture; Veronica triages via kanban.

---

## 8) Performance & Reliability
- Ingestion is idempotent; safe to reprocess.
- Dedup prevents repeated forwards from multiplying content.
- Search should return results in <1s for typical project scale.

---

## 9) R2 Interview Decisions (2026-03-12)

Answers from Veronica's technical interview session, refining the PRD for implementation.

### Links tab
- **AI summaries**: Yes, generate during ingestion (not on-demand)
- **OG preview images**: Yes, fetch og:image from link URLs
- **Tags**: Inherit from tasks via `source_message_id` linkage; also allow manual add/remove
- **Detail surface**: Side drawer (same pattern as Images)
- **Notes**: Manual, editable in the side drawer
- **Archive**: Soft delete with `archived_at` column, "View Archived" link above the fold
- **Sender filter**: Only show links from zachkinloch@gmail.com, veronica.tong@gmail.com, and @paradisahomes.com

### Images tab
- **Detail surface**: Side drawer (not modal)
- **Markup tools**: Basic — freehand draw, lines, arrows, rectangles, text. 6 colors. Undo support.
- **Clone workflow**: Clone button creates a copy linked to the original; markup only on clones (never mutate originals)
- **Image sources from email**: Both attachments AND inline images extracted during ingestion
- **PDF handling**: Convert each page to a PNG image (client-side via pdf.js)
- **Upload method**: Drag-and-drop + click-to-upload button
- **Upload size limit**: 50MB
- **Storage**: Supabase Storage (browser uploads directly with anon key, bypasses Vercel 4.5MB body limit)
- **Timeline/versions**: Filmstrip strip at bottom of drawer showing original + all clones
- **Tag inheritance**: Email-sourced images adopt tags from related tasks; uploads can be tagged manually
- **Google Slides/Docs**: Skip GCP API integration; rely on PDF upload conversion instead

### General
- **Tabs removed**: Search, Transcripts, Canvas, Settings — all deleted
- **Tabs kept as-is**: Kanban, Inbox
- **Navigation**: Kanban / Inbox / Links / Images / Archive
- **Build priority**: Images first, then Links
- **Export**: PDF export instead of Google API integration

---

## 10) Open Items (non-blocking)
- Confirm exact Paradisa domain string (assumed `@paradisahomes.com`).
- Mobile web polish level for canvas interactions.
