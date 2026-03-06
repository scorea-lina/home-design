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

### 6.1 Global layout
- Left nav: Inbox / Meetings / Attachments / Canvas / To-Dos / Tags / Settings
- Global search bar (Google-like)

### 6.2 Inbox (Paper Trail)
- Timeline list of SourceEmails
- Each item shows: subject, participants, date, key tags, attachment count, extracted to-dos count
- Email detail:
  - header + body + chunks
  - inline tag editor (multi-tag)
  - attachments panel
  - “Create To-Do”
  - “Extracted To-Dos” list with edit/accept

### 6.3 Meetings
- List view by meeting_date descending
- Meeting detail:
  - meeting metadata (title/date)
  - transcript chunks
  - tag editor (area tags apply here)
  - extracted to-dos
  - optional speaker dropdown per chunk

### 6.4 Search
- Single search input
- Results grouped by type: Emails / Meetings / Attachments / Markups / To-Dos
- Filters: tag, person, date range, type
- Clicking a result opens the source at the relevant chunk

### 6.5 Attachments
- Gallery/table
- Preview PDFs/images
- Actions:
  - “Open in Canvas”
  - “Create Snippet”

### 6.6 Canvas (Crop + Markup)
Flow:
1) Open PDF/image
2) Select crop region (for PDFs: page + crop rect)
3) Create snippet → opens markup editor
4) Markup tools:
   - pen/highlighter
   - arrows, rectangles, circles, lines
   - text boxes
   - layers
   - undo/redo
   - comments attached to markup
5) Save = creates **MarkupArtifact vN**
6) Export:
   - **Copy image to clipboard** (required)
7) Tagging:
   - Apply same multi-tags
   - Link back to source attachment + page

Versioning:
- Each save increments version: v1, v2, v3…

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

## 9) Open Items (non-blocking)
- Confirm exact Paradisa domain string (assumed `@paradisahomes.com`).
- Mobile web polish level for canvas interactions.
