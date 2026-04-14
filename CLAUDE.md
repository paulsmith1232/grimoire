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

---

## Pending Specs

### Feature: Profile Editing & Prompt Builder

**Goal:** Profiles become editable scan configurations. Each profile defines the card field schema and the API prompt used during image scanning.

**Behavior:**
- Profile edit screen has three sections:
  1. **Field Configurator** — define which fields appear on cards produced by this profile (e.g., Name, Effect, Duration, Source). Fields are ordered and can be added/removed/reordered.
  2. **Additional Instructions** — freeform text area for extra instructions appended to the assembled prompt (e.g., "prioritize information related to cats").
  3. **Assembled Prompt Preview** — read-only preview showing the full prompt that will be sent to the API.
- A toggle ("Use custom prompt instead") replaces the entire assembled prompt with a single freeform text area. When enabled, ONLY the user-authored prompt is sent — the assembled preamble and field schema are ignored. The assembled sections remain configured so the user can toggle back without losing work.

**Prompt Assembly Order:**
1. System instructions (output format, JSON structure expectations)
2. Field schema derived from the field configurator
3. User's additional instructions

**Data Model — additions to profile object:**
- `fields`: `Array<{ key: string, label: string }>` — defines the card schema
- `additionalInstructions`: `string` — user's extra instructions for the prompt
- `useCustomPrompt`: `boolean` — toggle for full override mode
- `customPrompt`: `string` — the full override prompt text

**Decisions:**
- Decision: Use an assembled prompt with optional full override, not a single freeform-only prompt.
  Rationale: Assembled approach prevents users from accidentally breaking the output format while still allowing full control via the toggle for power users.
- Decision: When custom prompt is toggled on, the assembled sections stay configured in the background.
  Rationale: Users can toggle back without losing their field definitions and instructions.
- Decision: Profile `fields` array replaces the existing `sections` array concept from v4.
  Rationale: Simpler model — each field is a key/label pair rather than a typed section. The section type distinction (text vs key-value) added complexity without clear value in v5's generalist model.

**Edge Cases:**
- Empty fields array: prompt assembly still works, just omits the field schema section. Cards scanned with no fields defined get whatever structure the API returns.
- Migration: existing profiles with `sections` and `scanInstructions` should map to the new model. `sections` → `fields` (extract name/key pairs), `scanInstructions` → `additionalInstructions`. `useCustomPrompt` defaults to `false`, `customPrompt` defaults to empty string.

**Implementation Notes:**
- Files to modify:
  - `src/db.js` — add new fields to profile schema, write migration logic from `sections`/`scanInstructions` to new fields
  - `src/components/ProfileEditor.jsx` — rebuild the edit UI with field configurator, additional instructions textarea, prompt preview, and custom prompt toggle
  - `src/api.js` — update the prompt assembly function to use the new profile data model (`fields` + `additionalInstructions` + custom prompt logic)
- Existing `ProfileEditor.jsx` already has section editing and scan instructions — this is a refactor of that component, not a new file.
- The prompt preview is read-only and updates live as the user edits fields or instructions. Render it in a `<pre>` or styled `<div>` with a muted background.
- The field configurator needs drag-to-reorder. The existing profile editor already has a drag handle pattern — reuse that approach.
- Not in scope: changing how cards are rendered based on field types (text vs key-value distinction). That's a separate concern.

---

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

_No completed specs yet. Claude Code moves specs here after implementation._
