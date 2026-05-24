# Pending Specs — Change Notes & Drive Sync

> Two specs, built in order. Spec 1 (Google Drive auth) is a standalone foundation with no
> consumer beyond a connection indicator. Spec 2 (Change Notes + sync) rides on top of it.
> Build, verify, and move Spec 1 to Ready for Testing **before** starting Spec 2.

---

## Feature: Google Drive Authentication

**Goal:** Add a client-side Google OAuth token flow so the app can later write files into the
user's Drive `Grimoire/` folder. This spec ships only the auth plumbing and a connect/disconnect
status indicator in Settings — nothing writes to Drive yet.

**Approach:**
- Use Google Identity Services (GIS) token client (the current recommended path for SPAs), **not**
  the deprecated `gapi.auth2`.
- Scope: `https://www.googleapis.com/auth/drive.file` only. This is already what the OAuth consent
  screen is configured for, and it is sufficient because the app only ever touches files it creates.
- The OAuth client is already restricted to the GitHub Pages domain — no new console config needed.
- The OAuth **client ID is not secret**. Put it in `VITE_GOOGLE_CLIENT_ID` (Vite env var) so it is
  not hardcoded; read it via `import.meta.env`.

**Token handling:**
- The browser token flow yields a short-lived (~1 hr) access token and **no refresh token**.
- Hold the token + expiry in memory (context state). Do **not** persist the token to IndexedDB —
  a persisted dead token is useless.
- Persist only a small `driveConnected` boolean hint in settings so the UI can show intent across
  reloads, then silently re-request a token (`prompt: ''`) when an action needs one.
- Any token request (connect, or silent re-acquire) **must** be triggered from a user gesture
  (a tap) — never fired automatically, or mobile browsers block the popup.

**Where it lives:** Settings tab. Add a **Connections** group alongside the existing Anthropic API
key block — Google Drive row with a connected/disconnected status line, a Connect button, and a
Disconnect button. Keeping the API key and Drive auth in one place is the "manage accounts" home.

**Files to create:**
- `src/google.js` — GIS script bootstrap, `initTokenClient()`, `requestAccessToken()`, in-memory
  token state, `isConnected()`. Plus the Drive REST helpers Spec 2 will consume:
  `findOrCreateFolder('Grimoire')`, `findFileInFolder(folderId, name)`,
  `uploadFile({ folderId, name, content, mimeType })`, `updateFile(fileId, content, mimeType)`.
  Use `https://www.googleapis.com/upload/drive/v3/files` for create/update (multipart / media).

**Files to modify:**
- `index.html` — load the GIS library: `https://accounts.google.com/gsi/client` (runtime script,
  loaded in the browser, unrelated to the build network allowlist).
- `src/context.jsx` — add Drive auth state (token, expiry, connected flag) and actions
  `connectDrive()` / `disconnectDrive()`; expose `driveConnected`. Follow existing action patterns.
- `src/db.js` — add a `driveConnected` settings read/write helper. Bump the DB version **only** if a
  new store is actually added; a settings key likely needs no schema change.
- `src/components/Settings.jsx` — add the Connections group with the Drive row + status + buttons.

**Decisions:**
- Decision: GIS token model, in-memory token, no refresh token. Rationale: it is the supported SPA
  path; persisting a short-lived token buys nothing. Re-acquire silently on demand, fall back to a
  consent tap.
- Decision: `drive.file` scope only. Rationale: least privilege, already configured, and the app
  only reads/writes its own files.
- Decision: client ID in a Vite env var, not hardcoded. Rationale: keeps deploy config out of source
  even though the ID is public.

**Edge cases:**
- Expired token mid-action → catch the 401, attempt one silent re-auth, retry once, then prompt.
- Popup blocked → only request tokens from a gesture; surface a clear "tap Connect" message if it
  still fails.
- Offline → Connect is disabled / shows "needs connection."

**Test checklist:**
- [ ] Settings shows a Connections group; Google Drive reads "Not connected"
- [ ] Tap Connect → Google consent → returns to app → status shows "Connected"
- [ ] Reload the app → status reflects reality (a fresh silent token request on next Drive action)
- [ ] Tap Disconnect → status returns to "Not connected"

**Deploy after testing:** `npm run deploy`

**Not in scope:** writing any report to Drive (Spec 2), refresh-token / offline access, multi-account.

---

## Feature: QA Change Notes + One-Tap Drive Sync

**Goal:** Capture freeform "recommended change" notes from anywhere in the app with near-zero
friction, collect and manage them in the QA tab, and mirror everything (checklist reports + change
notes) to a single Markdown file in the Drive `Grimoire/` folder with one tap. Depends on Spec 1.

### Part A — Change Notes capture & stream

**Data model:** new IndexedDB table `changeNotes`.
Schema: `{ id, text, context, createdAt }` where `context = { screen, cardId?, cardName? }` is
auto-captured at save time. Add db helpers: `addChangeNote(note)`, `getAllChangeNotes()`,
`updateChangeNote(id, text)`, `deleteChangeNote(id)`. Bump the Dexie DB version for the new store.

**Context (context.jsx):** add `changeNotes` to state, load it in `reloadAll`, and add actions
`addChangeNote`, `editChangeNote`, `removeChangeNote`. The capture action reads the current active
tab and `selectedCardId` from state to build the `context` stamp (resolve the card name from
`state.cards`).

**Two capture entry points (the "Both" choice):**
1. **Floating button (global):** a small circular FAB pinned bottom-right, above the tab bar,
   visible on every tab. Tapping opens a **capture sheet** — a bottom slide-up (reuse the portal +
   `translateY` pattern from `ChatPanel.jsx`) containing: an auto-growing textarea (16px, 2–6 rows,
   voice-friendly), a context line showing what was auto-captured ("On: Library" / "On card:
   Fireball"), and Save / Cancel. Save → `addChangeNote` with the stamped context → toast → close.
2. **QA tab stream (review/edit home):** a **Change Notes** section in the QA tab listing all notes
   newest-first, each showing its text, a context chip, and relative time. Each note is editable
   inline (tap → AutoTextarea) and deletable (×). This is where notes live, get reviewed, edited,
   and cleared — i.e. everything feeds into the QA tab.

**Shared component refactor:** `AutoTextarea` currently lives inside `QAChecklist.jsx`. Lift it to
`src/components/AutoTextarea.jsx` (no behavior change) and import it in both `QAChecklist.jsx` and
the new ChangeNotes component, so the capture sheet and notes stream reuse the same voice-friendly
textarea behavior.

**Files to create:**
- `src/components/AutoTextarea.jsx` — lifted from QAChecklist.jsx.
- `src/components/CaptureFAB.jsx` — the floating button (or inline it in App.jsx if cleaner).
- `src/components/CaptureSheet.jsx` — the bottom-sheet capture form.
- `src/components/ChangeNotes.jsx` — the notes stream rendered inside the QA tab.

**Files to modify:**
- `src/db.js` — `changeNotes` store + helpers, DB version bump.
- `src/context.jsx` — `changeNotes` state + actions; ensure active-tab / selected-card are readable
  at capture time for stamping.
- `src/App.jsx` — render `CaptureFAB` + `CaptureSheet` **outside** the per-tab content so they
  persist across tab switches.
- `src/components/QA.jsx` — render the `ChangeNotes` section (e.g. a collapsible "Change Notes (N)").
- `src/components/QAChecklist.jsx` — import `AutoTextarea` from the new shared file.

### Part B — Consolidated Drive sync (mirror)

**Goal:** one tap writes a single Markdown document to `Grimoire/` containing all checklist reports
plus a Change Notes section. **Mirror** semantics: each sync overwrites the same canonical file with
current local state, so clearing a note locally removes it from the Drive doc on the next sync.

**Where the button lives:** a top-level **Sync to Drive** button in the QA tab, separate from the
existing per-checklist "Export Report" clipboard button (which stays). Disabled when Drive is not
connected, with a hint linking to Settings → Connections.

**What it writes (build one markdown string):**
- A header with the sync timestamp.
- For each checklist: reuse the **exact** existing per-checklist export format. Lift the markdown
  builder currently inside `QAChecklist.handleExport` into a shared
  `buildChecklistMarkdown(checklist, qaState)` in a new `src/qa-export.js`, and have **both** the
  clipboard export and the Drive sync call it — one formatting path, no drift.
- A `## Change Notes` section: each note rendered with its context + timestamp + text.

**File handling (mirror):** fixed filename `Grimoire-QA-Report.md` inside the `Grimoire/` folder.
On sync: `findOrCreateFolder('Grimoire')` → `findFileInFolder(folderId, name)` → if found,
`updateFile` (PATCH media); else `uploadFile`. Single canonical file = the mirror.

**Files to create:**
- `src/qa-export.js` — `buildChecklistMarkdown()` + `buildFullReport(checklists, qaStates, notes)`.

**Files to modify:**
- `src/components/QA.jsx` — add the Sync to Drive button + handler (uses `src/google.js` helpers and
  the connection state from context).
- `src/components/QAChecklist.jsx` — refactor `handleExport` to call `buildChecklistMarkdown()`.

**Decisions:**
- Decision: mirror to a single fixed file. Rationale: local IndexedDB stays the single source of
  truth; the Drive doc is a current-state reflection. Clearing locally cleans up Drive on next sync.
- Decision: reuse the existing checklist markdown builder for both clipboard and Drive. Rationale:
  one code path, identical formatting everywhere.
- Decision: sync is one explicit tap. Rationale: also satisfies the gesture requirement for token
  requests; no background sync.
- Decision: keep the per-checklist clipboard "Export Report." Rationale: still the fastest path to
  paste one checklist into a chat without involving Drive.

**Edge cases:**
- Drive not connected → button disabled with a prompt to connect.
- Token expired → catch 401, silent re-auth, retry once.
- **`drive.file` folder gotcha:** the scope only sees app-created files. If a `Grimoire/` folder was
  made manually (e.g. via rclone) the app may not see it and could create a second one. Let the app
  create and own its folder; do not assume an externally made folder is visible.
- Hand-edits to the Drive doc are overwritten on the next sync — expected under mirror semantics, but
  worth knowing: the app is the source of truth, not the Drive file.
- Empty state (no checklists, no notes) → either disable Sync or write a near-empty doc; low priority.

**Test checklist:**
- [ ] FAB is visible on every tab → tap it → capture sheet slides up, context line shows the current
      screen or open card
- [ ] Dictate a note → Save → toast, sheet closes
- [ ] Open QA tab → Change Notes section shows the note, newest first, with context chip + time
- [ ] Edit a note inline → saves; delete a note → it disappears
- [ ] (Drive connected) Tap Sync to Drive → success toast → the `.md` appears in Drive `Grimoire/`
      with checklist reports **and** a Change Notes section
- [ ] Clear a note locally, Sync again → that note is gone from the Drive doc (mirror confirmed)
- [ ] Tap Sync while disconnected → blocked with a prompt to connect

**Deploy after testing:** `npm run deploy`

**Not in scope:** auto-sync on reconnect (possible later), pulling notes/checklists back down from
Drive (capture is phone-only, local is canonical), a Google Doc output format (Markdown for now),
syncing change notes between devices.
