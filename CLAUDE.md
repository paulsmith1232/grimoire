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
- Move the completed spec from **Pending Specs** to **Completed Specs**.
- Add the completion date and a short summary of what was implemented.
- If you deviated from the spec in any way, note what changed and why.
- Example format:
  ```
  ### Feature: [Name] — Completed 2026-04-13
  Implemented as specced. Minor deviation: used `Map` instead of
  plain object for the history stack for cleaner cleanup on unmount.
  ```

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

### Feature: Inline Card Linking

**Goal:** Any text within any card field can link to another card, Wikipedia-style. Tapping a link navigates to that card with full back-navigation support.

**Storage Format:**
- Inline tokens embedded in field value strings: `[[cardId|display text]]`
- `cardId` is the target card's unique ID (resilient to renames)
- `display text` is what renders visually
- Example field value: `"Deal [[abc123|Fire]] damage equal to your [[def456|Spellcasting Modifier]]"`

**Authoring UX:**
1. User is editing a card field (any field)
2. User selects/highlights a span of text
3. A "Link" action appears (button or floating action)
4. Tapping "Link" opens a card search/picker modal
5. User selects the target card
6. The selected text wraps in `[[targetId|selected text]]` in the raw field value

**Rendering:**
- In view mode (non-edit), parse `[[id|text]]` tokens in all field values
- Render linked text as styled tappable `<span>` elements — visually distinct with gold underline to match the grimoire theme
- In edit mode, show the raw `[[id|text]]` markup (no rendering of links)

**Navigation — Card History Stack:**
- Maintain an in-memory array of card IDs, capped at 10 entries
- When user taps a link: push target card ID onto the stack AND call `history.pushState({ cardId, depth })` on the browser History API
- Listen for `popstate` event — on back-swipe/back-button, navigate to the previous card in the stack instead of leaving the page
- **Sentinel behavior:** When the stack has only one entry (the first card opened from a list/search), the next back action exits card view entirely and returns to the previous screen. Use `{ root: true }` in the pushState data to distinguish "go back one card" from "exit card view entirely."

**Decisions:**
- Decision: Store link tokens as `[[cardId|displayText]]` directly in field value strings, not in a separate link table.
  Rationale: Survives card renames, no join overhead, keeps field values self-contained. Easy to debug by inspecting raw data.
- Decision: Use browser History API with a sentinel state, not a custom in-app router.
  Rationale: Hijacks mobile back-swipe naturally without fighting the browser. Sentinel pattern cleanly handles the "exit card view" vs "go back one card" distinction.
- Decision: Links render only in view mode. Edit mode shows raw `[[id|text]]` markup.
  Rationale: Keeps the editor simple. Users can see and manually adjust link tokens. A WYSIWYG editor would add significant complexity for minimal gain.
- Decision: Cap the history stack at 10 entries.
  Rationale: Prevents unbounded memory growth from deep link chains. 10 levels of depth is more than enough for practical use.

**Edge Cases:**
- Deleted target card: render the display text as plain (non-linked) text, or show a subtle "card not found" indicator (e.g., strikethrough or dimmed). Do not crash or show broken UI.
- Circular links (A→B→A): no special handling needed. The stack is linear history — user navigates back through it normally.
- Links created via API scanning: not in scope now, but the `[[id|text]]` format is compatible with future auto-linking where the scan prompt includes the card index.
- Empty display text: `[[id|]]` should not render a visible link. Treat as plain text (skip it).

**Implementation Notes:**
- Files to modify:
  - `src/linking.js` — already exists as a utility file. Add/update: `parseLinks(text)` returns array of `{ type: 'text'|'link', content, cardId? }` segments. Add `wrapLink(text, cardId)` for authoring. Add `resolveLinks(segments, cardLookup)` to check if target cards exist.
  - `src/components/LinkedText.jsx` — already exists. Update to render parsed segments as mixed `<span>` (plain) and tappable `<span>` (linked) elements. Receives an `onNavigate(cardId)` callback.
  - `src/components/CardDetail.jsx` — integrate `LinkedText` into field value rendering in view mode. Add the `popstate` listener and history stack management here (or in a custom `useCardHistory` hook).
  - `src/components/CardEditor.jsx` — add link authoring: detect text selection, show "Link" button, open card picker modal, wrap selection in `[[id|text]]`.
- New files:
  - `src/components/LinkPicker.jsx` — modal with search input that filters existing cards. Returns the selected card's ID. Keep it simple — a text input with a filtered list below it.
  - `src/hooks/useCardHistory.js` (optional) — encapsulate the history stack, `pushState`, and `popstate` listener. Cleaner than putting it all in CardDetail.
- The `popstate` listener must be set up carefully to not conflict with any existing navigation logic. Check what currently handles tab switching and card selection in `context.jsx` / `App.jsx` before wiring this in.
- Naming conventions: follow existing patterns — `useXxx` for hooks, `handleXxx` for event handlers, component files are PascalCase.
- Not in scope: auto-linking during API scanning, reverse link index ("what links to this card"), WYSIWYG link editing.

---

## Completed Specs

### Feature: Profile Editing & Prompt Builder — Completed 2026-04-14
Implemented as specced.
- `db.js`: `DND_PROFILE` updated to new model (`fields` + `additionalInstructions`). `migrateProfileFields()` exported helper converts old `sections`/`scanInstructions` to new shape. `getAllProfiles()` auto-migrates and persists any un-migrated profiles on load. `migrateFromLocalStorage()` and `importFromJSON()` also run profile migration.
- `ProfileEditor.jsx`: Sections editor replaced with fields editor (label input per field, ▲/▼ reorder, × delete, + Add Field). `scanInstructions` renamed to `additionalInstructions` throughout. Custom prompt toggle and assembled prompt preview unchanged.
- `api.js`: `buildPrompt()` now uses `profile.fields` (label list) and `profile.additionalInstructions`. Legacy `scanInstructions` fallback retained for safety. Rules section updated to guide Claude on text vs key-value inference (since fields no longer carry explicit types).
- `Profiles.jsx`: New profile template updated to use `fields`/`additionalInstructions`. Profile card chip list updated to render from `fields`.
- `Scan.jsx`: Profile summary line updated from `profile.sections` to `profile.fields`.
- Deviations: (1) Drag-to-reorder replaced with ▲/▼ buttons — reused the existing pattern from the old sections editor rather than adding drag handling. (2) `key` is auto-derived from `label` (lowercased, underscored) instead of being a user-editable field — keeps the UI simpler for a label-only input. (3) Fields carry no explicit type — `buildPrompt()` instructs Claude to infer text vs key-value from context, since the type distinction was removed from the data model.

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
