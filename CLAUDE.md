# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server (Vite, hot reload)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
```

No test runner is configured. There is no lint script — the project uses plain JSX/JS with no TypeScript compilation.

## Architecture

**Grimoire** is a local-first PWA for managing personal reference cards (wiki-style), with AI-powered scanning via the Claude API.

### Data Flow

```
IndexedDB (Dexie, db.js)
    ↓ loaded on startup
React Context + Reducer (context.jsx)
    ↓ consumed by all components
Components (src/components/)
```

State lives entirely in `context.jsx` (reducer pattern). All DB writes go through context actions (`saveCard`, `addProfile`, etc.), which also handle auto-backup every 10 saves.

### Key Files

- **`src/db.js`** — Dexie schema (`cards`, `profiles`, `tags`, `settings`, `backups`). Contains migration logic from old localStorage format and the built-in D&D 5e profile.
- **`src/context.jsx`** — Single source of truth. Exposes state and action dispatchers via `useGrimoire()` hook.
- **`src/api.js`** — Claude API integration. `parseCardImage()` sends a base64 image to `claude-sonnet-4-20250514` with a prompt built from the active profile's section definitions. Direct browser-side fetch (no backend proxy).
- **`src/linking.js`** — Link markup: `[[cardId|display text]]`. Functions for parsing, segmenting, inserting, removing, and computing reverse links.
- **`src/App.jsx`** — Tab-based navigation shell (Library, Scan, Tags, Profiles, Settings).

### Profiles

Profiles define the card schema: each profile specifies which sections a card has, their types (key-value vs. free text), and AI scanning instructions. The D&D 5e profile is hardcoded in `db.js` and always available. Custom profiles are stored in IndexedDB.

### Deployment

Vite base path is `/grimoire/` — all asset paths are relative to that subpath. PWA service worker auto-updates. App is designed for mobile-first use at max-width 480px.

### Styling

CSS variables in `App.css` define the design system (dark theme, gold accent `#c29a3e`, Cinzel/Nunito Sans fonts). No CSS framework or preprocessor.


## Conventions

- Discuss architecture decisions before writing code
- Deployed to GitHub Pages at https://paulsmith1232.github.io/grimoire/; repo is `paulsmith1232/grimoire`
- Git uses a personal access token with the noreply email for privacy
- After `npm run build`, the `dist/` output must be pushed to the deployment branch for changes to go live

## Standing Instructions for Claude Code

### Implementing Specs
- Pending specs below are written during planning sessions on claude.ai. They represent finalized decisions — do not second-guess architectural choices marked with "Decision/Rationale" unless they conflict with existing code, in which case flag the conflict and ask before proceeding.
- Follow the **Implementation Notes** section of each spec closely. It lists the files to modify, where new code hooks in, and what is explicitly out of scope.
- If anything in a spec is genuinely ambiguous or impossible given the current codebase, stop and ask — do not silently deviate or invent an alternative approach.

### After Completing a Spec
- Move the completed spec from **Pending Specs** to **Ready for Testing**.
- Add the implementation date and a summary of what was implemented, including any deviations.
- Include a **Test checklist** — a short bullet list of the key behaviors to manually verify. Write these as user-facing actions, not implementation details. Think "what would I tap/see/check on the phone?" Each item should be a concrete action with an expected result.
- Also append a new checklist entry to `src/qa-checklists.json` with a stable ID (kebab-case feature name + implementation date, e.g. `"profile-editing-2026-04-14"`). Mirror the test checklist items from CLAUDE.md into the JSON `items` array.
- Example format:
  ```
  ### Feature: [Name] — Implemented 2026-04-14
  [Implementation summary and deviation notes]
  **Test checklist:**
  - [ ] [Action] → [expected result]
  - [ ] [Action] → [expected result]
  **Deploy after testing:** `npm run deploy`
  ```
- Do NOT move specs directly to Completed. Only the developer moves specs from Ready for Testing to Completed after manual verification.

### General
- Do not modify or remove pending specs you are not actively implementing.
- When making changes, keep commits granular — one feature or fix per commit with a clear message.
- After any session where files were changed, do a final review pass to make sure no debug logging, commented-out code, or TODO placeholders were left behind.

### Voice-to-Text Design Principles (apply to all new UI)

- All text inputs are multi-line auto-growing textareas. Min 2 rows, max 6 before scroll. 16px+ font size to prevent iOS zoom-on-focus.
- Do NOT suppress autocorrect or spellcheck — voice dictation relies on these.
- Large touch targets: all action buttons at least 44x44px.
- No reliance on precise formatting in user input. All system prompts instruct Claude to handle voice-dictated, unpunctuated, conversational input.
- Button-driven navigation. All major actions are initiated by taps, not typed commands.
- Placeholder text in inputs should read like example voice dictation to guide users.

### Cost Guardrails (apply to all Claude API interactions)

- After every Claude API response in chat or discovery flows, display a subtle line below the message: `~1,247 input tokens · ~384 output tokens`. Pull from the API response's `usage` object.
- Before any batch API call where estimated input exceeds 30k tokens, show a confirmation dialog: "This will send approximately [N]k tokens to Claude. Continue?" Estimate with `JSON.stringify(payload).length / 4`.

---

## Pending Specs

### Feature: Google Drive Authentication

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

### Feature: QA Change Notes + One-Tap Drive Sync

**Goal:** Capture freeform "recommended change" notes from anywhere in the app with near-zero
friction, collect and manage them in the QA tab, and mirror everything (checklist reports + change
notes) to a single Markdown file in the Drive `Grimoire/` folder with one tap. Depends on Google Drive Authentication spec above.

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

---

## Ready for Testing

*(Specs that have been implemented but not yet manually verified and deployed.)*

### Feature: Wiki Granularity + Home Card — Implemented 2026-06-25
From the wiki-direction planning discussion (Model B). Two changes:
- **Batch granularity + cross-scan linking** (`api.js`, `Scan.jsx`): `parseBatchImages` prompt rewritten so each proper-named spell/feature/ability/item/subclass becomes its own card, with an overview card linking to its sub-parts rather than inlining them. `parseBatchImages` and `resolveBatchLinks` now take an `existingCards` index (`buildCardIndex(profileId)`); new cards link to and avoid duplicating cards already in the wiki. `Scan.runBatch` passes the index through.
- **Per-profile home card** (`db.js` model, `ProfileEditor.jsx`, `Library.jsx`): profiles gain an optional `homeCardId` set via a selector in ProfileEditor. The card is pinned at the top of the Library with a ⌂ marker and excluded from the normal list. No DB schema bump — `homeCardId` is just a property on the profile object.
- Deviations: None.

**Test checklist:**
- [ ] Scan a class page with several named features via Generate Wiki → each named feature/spell becomes its own card, not one lumped card
- [ ] An overview card for the parent subject links to the sub-cards with tappable gold terms
- [ ] Run a second Generate Wiki scan in the same profile → new cards link to cards from the first scan instead of duplicating them
- [ ] Open a profile → set Home / Index Card → that card appears pinned at the top of the Library with a ⌂ marker
- [ ] The pinned home card does not also appear in the normal list below
- [ ] Set Home / Index Card back to None → pinned card returns to the normal list

**Deploy after testing:** `npm run deploy`

### Feature: Inline Card Linking — Implemented 2026-05-24
Implemented as specced.
- `src/linking.js`: `parseLinks()`, `segmentText()`, `insertLink()`, `removeLink()`, `stripLinks()`, `computeReverseLinks()`, `getOutgoingLinks()` implemented.
- `src/components/LinkedText.jsx`: renders `[[id|text]]` segments as tappable gold `.linked-term` spans; missing-card targets get `data-exists="false"` and a dimmed appearance rather than crashing.
- `src/context.jsx`: `navigateToCard(id, isRoot)` manages an in-memory card history stack with `history.pushState`; `popstate` listener handles back-navigation, sentinel `isRoot` flag exits card view entirely when back is pressed from the first card.
- `src/components/CardEditor.jsx`: on text selection a "Link" button appears; tapping opens an inline `LinkModal` (search input + filtered card list); selecting a card wraps the selection with `[[cardId|selectedText]]` via `insertLink`.
- `src/components/CardDetail.jsx`: field values rendered via `LinkedText` in view mode; raw markup shown in edit mode.
- Deviations: `LinkPicker.jsx` was not created as a separate file — the picker is implemented as an inline `LinkModal` function component at the bottom of `CardEditor.jsx`. `useCardHistory.js` was not extracted; history logic lives in `context.jsx`.

**Test checklist:**
- [ ] View a card with a `[[id|text]]` link → linked text appears with gold underline
- [ ] Tap the link → navigates to the target card
- [ ] Tap the back button / swipe back → returns to the previous card
- [ ] Back from the first card in the stack → exits card view, returns to the list
- [ ] Link pointing to a deleted card → display text shown plain (no crash, no broken UI)
- [ ] Edit a card field, select some text → "Link" button appears
- [ ] Tap "Link", search for a card, select it → selection becomes `[[id|text]]` token in the raw field
- [ ] Save the card, view it → the new link renders as a tappable span

**Deploy after testing:** `npm run deploy`

### Feature: QA Checklist Tab — Implemented 2026-04-16
Implemented as specced.
- `db.js`: `qaState` table added (DB version bumped to 2). Helpers `getQAState`, `saveQAState`, `resetQAState` exported.
- `context.jsx`: `getQAState`, `saveQAState`, `resetQAState` added as `useCallback` actions and exposed through context value.
- `src/qa-checklists.json`: Created with two seed checklists — Profile Editing & Prompt Builder and QA Checklist Tab.
- `src/components/QAChecklist.jsx`: Collapsible checklist card. Per-item checkbox + note toggle (auto-growing 16px textarea). General notes textarea at bottom. Export Report (markdown to clipboard) and Reset (confirmation dialog) buttons. Toast confirmation on copy.
- `src/components/QA.jsx`: Tab component. Loads all checklist states from IndexedDB on mount. Passes state and callbacks to QAChecklist components. Empty state when no checklists.
- `src/App.jsx`: QA tab added to nav with 📋 icon.
- `CLAUDE.md`: "After Completing a Spec" standing instruction updated to include appending to `src/qa-checklists.json`.
- Deviations: None.

**Test checklist:**
- [ ] QA tab appears in the nav bar with a 📋 icon → tapping it shows the QA screen
- [ ] Two checklist cards appear: "Profile Editing & Prompt Builder" and "QA Checklist Tab"
- [ ] Each card shows feature name, date, and "0/N checked" progress
- [ ] Tap a checklist card → expands showing summary, deviations, items, general notes, Export/Reset buttons
- [ ] Check off an item → progress counter updates
- [ ] Switch to another tab and return → checked state is still there
- [ ] Tap the ✎ note icon on an item → textarea expands below it, type a note → note is saved
- [ ] Type in General Notes → saves (verify by leaving and returning)
- [ ] Tap "Export Report" → toast says "Copied to clipboard", paste into a text editor to verify markdown format
- [ ] Tap "Reset" → confirmation dialog appears → confirm → all checks and notes clear

**Deploy after testing:** `npm run deploy`

### Feature: Profile Editing & Prompt Builder — Implemented 2026-04-14
Implemented as specced.
- `db.js`: `DND_PROFILE` updated to new model (`fields` + `additionalInstructions`). `migrateProfileFields()` exported helper converts old `sections`/`scanInstructions` to new shape. `getAllProfiles()` auto-migrates and persists any un-migrated profiles on load. `migrateFromLocalStorage()` and `importFromJSON()` also run profile migration.
- `ProfileEditor.jsx`: Sections editor replaced with fields editor (label input per field, ▲/▼ reorder, × delete, + Add Field). `scanInstructions` renamed to `additionalInstructions` throughout. Custom prompt toggle and assembled prompt preview unchanged.
- `api.js`: `buildPrompt()` now uses `profile.fields` (label list) and `profile.additionalInstructions`. Legacy `scanInstructions` fallback retained for safety. Rules section updated to guide Claude on text vs key-value inference (since fields no longer carry explicit types).
- `Profiles.jsx`: New profile template updated to use `fields`/`additionalInstructions`. Profile card chip list updated to render from `fields`.
- `Scan.jsx`: Profile summary line updated from `profile.sections` to `profile.fields`.
- Deviations: (1) Drag-to-reorder replaced with ▲/▼ buttons — reused the existing pattern from the old sections editor rather than adding drag handling. (2) `key` is auto-derived from `label` (lowercased, underscored) instead of being a user-editable field — keeps the UI simpler for a label-only input. (3) Fields carry no explicit type — `buildPrompt()` instructs Claude to infer text vs key-value from context, since the type distinction was removed from the data model.

**Test checklist:**
- [ ] Open the D&D 5e profile → fields show (Name, Level, etc.) not old sections
- [ ] Add a new field, reorder with ▲/▼, delete one → changes save
- [ ] Type in Additional Instructions → assembled prompt preview updates live
- [ ] Toggle "Use custom prompt" on → freeform textarea appears, assembled preview hidden
- [ ] Toggle it back off → fields and instructions still intact
- [ ] Scan a card using the edited profile → card comes back with expected fields

**Deploy after testing:** `npm run deploy`

---

## Completed Specs

### Feature: Chat Panel Component — Completed 2026-04-13
Implemented as specced. New `src/components/ChatPanel.jsx`: slide-up overlay (90vh, `translateY` animation), scrollable message thread with user/assistant/error bubbles, auto-growing textarea (16px, 2-6 rows), image attach with thumbnail preview, full history sent per call, JSON fence detection with structured-message stub, token usage display, 30k-token cost guardrail. `sendChatMessage` added to `api.js`. CSS added to `App.css`. Placeholder system prompts in place — will be replaced when sections 5-6 are implemented. Note: `onSaveProfile` prop is wired through but not yet called; that hookup comes with sections 5-6.

### Feature: Scan-Time Custom Prompt Field — Completed 2026-04-13
Implemented as specced. Collapsible "＋ Add instructions" row in the idle/error scan state; expands to an auto-growing textarea (16px, min 2 rows, max 6 / 168px). `scanInstructions` cleared on successful API call, preserved on error. `api.js` appends the instructions to the system prompt via `opts.scanInstructions`.

### Feature: Multi-Region Selection Tool — Completed 2026-04-13
Implemented as specced. `CropOverlay.jsx` fully rewritten: multi-rect state, semi-transparent gold fill + corner-bracket overlays, ✕ hit-tested delete buttons, Full Page / Crop Only toggle (default Full Page ON), "Scan N Regions" button disabled at zero. `Scan.jsx` updated to new `onConfirm(images, fullPage)` interface, tracks `fullPageMode`, passes it to `parseCardImage`. `api.js` adds `opts.fullPageWithRegions` parameter to select the appropriate user prompt. Deviation: props changed from `{ onCrop, onSendFull }` to `{ onConfirm }` — image processing moved into CropOverlay, consistent with spec intent.

### Feature: Card Index Infrastructure — Completed 2026-04-13
Implemented as specced.
- `buildCardIndex(profileId)` added to `db.js` — queries cards by profileId (or all cards if null), returns `{ id, name, category, summary }` array.
- `buildPrompt()` in `api.js` updated: added `"summary"` field to the assembled JSON schema and appended the summary instruction as a rule. For custom-prompt mode, the instruction is appended after the user's custom text.
- `Library.jsx` shows a subtle `●` dot (with tooltip) next to card names missing a summary, 1-col list view only.
