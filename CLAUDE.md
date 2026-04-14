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

### Feature: Scan-Time Custom Prompt Field

**Goal:** A collapsible text input on the scan screen where the user can add per-scan instructions via typing or voice dictation. This text is appended to the profile's prompt for that specific API call only — not saved to the profile.

**Behavior:**
- Located below the image preview / region selection area, above the "Scan N Regions" button.
- Collapsed by default, showing a tappable row: "＋ Add instructions".
- On tap, expands to reveal a multi-line auto-growing `<textarea>` (min 2 rows, max 6 before scroll). Placeholder text: `e.g. 'This is from the 2024 PHB, focus on mechanical effects'`.
- A collapse button (chevron or ✕) to re-hide if opened accidentally.
- The text is cleared after a successful scan. On error, it's preserved for retry.

**Data Model — component state:**
```js
const [scanInstructions, setScanInstructions] = useState('');
const [showInstructions, setShowInstructions] = useState(false);
```

**Decisions:**
- Decision: Per-scan instructions are ephemeral, not saved to the profile.
  Rationale: Profile-level instructions cover the general case. Per-scan text is for one-off guidance ("this is from a specific edition", "extract the sidebar too"). Saving it would clutter the profile.
- Decision: Clear on success, preserve on error.
  Rationale: If the scan fails, the user wants to retry with the same instructions without retyping/redictating.

**Edge Cases:**
- Very long voice dictation: auto-growing textarea handles it. No character limit. The text gets appended to the prompt, so very long instructions increase token usage but that's the user's prerogative.
- Instructions contain formatting or special characters: passed through as-is. The API handles arbitrary text.

**Implementation Notes:**
- Files to modify:
  - `src/components/Scan.jsx` — add the collapsible instructions UI below the image preview area. Pass `scanInstructions` to the API call function. Clear state on success.
  - `src/api.js` — when `scanInstructions` is non-empty, append to the assembled prompt: `\n\nAdditional instructions for this scan: ${scanInstructions.trim()}`
- New files: none.
- Follow voice-to-text design principles: 16px+ font, no autocorrect suppression, large touch targets.
- The textarea should use `onInput` for auto-growing (set `style.height = 'auto'` then `style.height = scrollHeight + 'px'`).
- Not in scope: saving frequently-used instructions as presets. That could come later but is not part of this feature.

---

### Feature: Chat Panel Component

**Goal:** A reusable slide-up overlay panel that provides a conversational interface with Claude. Used by both Profile Creation (section 5) and Profile Evolution (section 6) flows.

**Behavior:**
- Slides up from the bottom, covering ~90% of viewport height. A small strip of the underlying view is visible at top, plus a drag handle or close button. The panel is modal — underlying view is not interactive while open.
- Layout (top to bottom):
  1. **Header bar:** Title ("Create Profile" or "Update Profile: [name]"), close button (✕).
  2. **Scrollable message thread:** Alternating user/assistant messages. User messages right-aligned, assistant messages left-aligned. Standard chat bubble styling matching the grimoire dark theme.
  3. **Input area:** Multi-line auto-growing textarea (same specs as scan instructions), "Attach" button (opens camera/file picker for images), "Send" button.
- Each send builds the full Claude API message array from local history and sends it. Claude's response is appended to the thread.
- The panel includes `web_search` as a tool in all API calls so Claude can fetch URLs the user shares.
- After each API response, display token usage (per cost guardrails in standing instructions).

**Data Model — component state:**
```js
const [messages, setMessages] = useState([]);
// { role: 'user'|'assistant', content: string|object, rawText?: string, timestamp: Date }

const [inputText, setInputText] = useState('');
const [attachedImages, setAttachedImages] = useState([]); // base64 strings
const [isLoading, setIsLoading] = useState(false);
```

**Props:**
```js
{
  mode: 'create' | 'update',
  existingProfile: object | null,  // populated in update mode
  onClose: () => void,
  onSaveProfile: (profileData) => void
}
```

**API Call Structure:**
- Build the `messages` array from local history. User messages include text + any attached images. Assistant messages use `rawText` (the original API response text).
- System prompt depends on `mode` — create mode or update mode (see sections 5 and 6 for the full prompts, which will be added when those specs are implemented).
- Include `tools: [{ type: "web_search_20250305", name: "web_search" }]` in all calls.

**Response Parsing:**
- After receiving a response, scan the assistant's text for a ` ```json ` code fence.
- If found: parse the JSON, check the `type` field (`schema_proposal` or `schema_diff`), store raw text as `msg.rawText` and parsed object as `msg.content`. Render an interactive review UI instead of a plain text bubble (the review UI is defined in sections 5 and 6).
- If no JSON fence found: render as a normal text message.

**Decisions:**
- Decision: Full message history sent with every API call, not summarized.
  Rationale: Profile creation/evolution conversations are short (typically 3-8 exchanges). Summarization would lose nuance. History fits comfortably in context.
- Decision: Chat panel is a generic reusable component. Mode-specific behavior (system prompts, review UIs) is injected via props/callbacks.
  Rationale: Avoids duplicating the chat infrastructure for create vs update flows. The panel handles message threading, API calls, image attachment. The caller handles what happens with the results.
- Decision: Include `web_search` tool in all chat panel API calls.
  Rationale: Users will share wiki URLs and expect Claude to read them. Web search enables this without the app needing to fetch and parse pages itself.

**Edge Cases:**
- API error during send: show error message in the thread (styled distinctly from normal messages). Preserve the user's input text so they can retry.
- Very long conversation: message thread scrolls. Auto-scroll to bottom on new messages.
- Image attachment: show a thumbnail preview above the input area before sending. Allow removal (✕ on thumbnail). Multiple images allowed.
- User closes panel mid-conversation: conversation state is lost. This is intentional — these are short task-oriented conversations, not persistent chats.

**Implementation Notes:**
- New files:
  - `src/components/ChatPanel.jsx` — the full panel component. Handles slide-up animation, message rendering, input area, image attachment, API calls, response parsing.
- Files to modify:
  - `src/api.js` — add a `sendChatMessage(messages, systemPrompt, tools)` function that handles the chat-specific API call pattern (full history, tool inclusion, response parsing). Distinct from the existing `parseCardImage` function.
  - `src/App.css` — add styles for the slide-up panel, chat bubbles, message thread, input area. Follow grimoire dark theme (dark backgrounds, gold accents, Cinzel headings, Nunito Sans body text).
- The chat panel does NOT need to know about profile schemas, proposals, or diffs — it renders whatever `msg.content` contains. When sections 5-6 are implemented, they'll provide render functions for the schema proposal and diff review UIs that the panel calls when it detects structured JSON in a response.
- For now, the panel renders all assistant messages as plain text. The structured review UIs (schema_proposal, schema_diff) are stubbed — when a JSON fence is detected, parse and store it but render a placeholder like "Schema proposal received — review UI coming in a future update." This lets the panel be fully functional for testing before sections 5-6 are built.
- Slide-up animation: use CSS `transform: translateY(100%)` → `translateY(0)` with a transition. The panel is a fixed-position overlay.
- Follow voice-to-text design principles for the input area.
- Not in scope: persistent conversation history, conversation export, typing indicators.

---

## Completed Specs

### Feature: Multi-Region Selection Tool — Completed 2026-04-13
Implemented as specced. `CropOverlay.jsx` fully rewritten: multi-rect state, semi-transparent gold fill + corner-bracket overlays, ✕ hit-tested delete buttons, Full Page / Crop Only toggle (default Full Page ON), "Scan N Regions" button disabled at zero. `Scan.jsx` updated to new `onConfirm(images, fullPage)` interface, tracks `fullPageMode`, passes it to `parseCardImage`. `api.js` adds `opts.fullPageWithRegions` parameter to select the appropriate user prompt. Deviation: props changed from `{ onCrop, onSendFull }` to `{ onConfirm }` — image processing moved into CropOverlay, consistent with spec intent.

### Feature: Card Index Infrastructure — Completed 2026-04-13
Implemented as specced.
- `buildCardIndex(profileId)` added to `db.js` — queries cards by profileId (or all cards if null), returns `{ id, name, category, summary }` array.
- `buildPrompt()` in `api.js` updated: added `"summary"` field to the assembled JSON schema and appended the summary instruction as a rule. For custom-prompt mode, the instruction is appended after the user's custom text.
- `Library.jsx` shows a subtle `●` dot (with tooltip) next to card names missing a summary, 1-col list view only.
