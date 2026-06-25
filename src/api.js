const SUMMARY_INSTRUCTION = `Also generate a "summary" field: a single sentence under 15 words capturing what this card is and its key relationships or category. This is used for indexing, not display.`;

// ── Dynamic prompt builder ──
export function buildPrompt(profile) {
  if (profile.useCustomPrompt) {
    return (profile.customPrompt || '') + `\n\n${SUMMARY_INSTRUCTION}`;
  }

  const fieldLabels = (profile.fields || []).map((f) => `"${f.label}"`).join(', ');
  const fieldSection = fieldLabels
    ? `This profile expects these fields (in order): ${fieldLabels}`
    : '';

  // Support both new (additionalInstructions) and legacy (scanInstructions) field names
  const additionalInstructions = profile.additionalInstructions || profile.scanInstructions || '';

  return `You are a reference card parser. Extract content from the image and return ONLY valid JSON with no markdown, no backticks, no preamble.

Schema:
{
  "name": "string",
  "summary": "string",
  "source": "string|null",
  "sections": [
    {
      "name": "string",
      "type": "text|key-value",
      "content": "string|null",
      "keyValues": {"key":"value"}|null,
      "priority": number
    }
  ]
}

${fieldSection}

${additionalInstructions}

Rules:
- Return sections matching the expected fields, in the order listed. Only include sections that have actual content.
- For structured data (stats, properties, numbers): use type "key-value" with keyValues as string pairs.
- For prose text (descriptions, abilities, lore): use type "text" with content string.
- Preserve body text faithfully.
- If multiple entries visible, extract only the most prominent one.
- ${SUMMARY_INSTRUCTION}
- Return ONLY the JSON object.`;
}

// ── Parse card from one or more images ──
// images: [{ base64, mediaType }, ...]
// opts.fullPageWithRegions: true when Full Page mode — image has gold overlay highlights
export async function parseCardImage(images, apiKey, profile, opts = {}) {
  if (!apiKey) throw new Error('No API key configured');
  if (!profile) throw new Error('No scan profile selected');

  const imageBlocks = images.map(({ base64, mediaType }) => ({
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: base64 },
  }));

  let prompt;
  if (opts.fullPageWithRegions) {
    prompt = 'This image shows a full page with highlighted regions (gold corner-bracket overlays). Focus your extraction on the highlighted areas when building the card.';
  } else if (images.length > 1) {
    prompt = 'These images are cropped regions from a page. Extract the content from all regions into a single structured card.';
  } else {
    prompt = 'Extract the content from this image into a structured card.';
  }

  let systemPrompt = buildPrompt(profile);
  if (opts.scanInstructions) {
    systemPrompt += `\n\nAdditional instructions for this scan: ${opts.scanInstructions.trim()}`;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: prompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || 'API error: ' + res.status);
  }

  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ── Parse multiple cards from a batch of images ──
// Returns { cards: [...], usage } where cards have [[Title]] links pre-resolved to [[id|Title]].
// existingCards: lightweight index [{ id, name, summary }] of cards already in this profile,
// so the scan can link new cards to existing ones (cross-scan linking).
export async function parseBatchImages(images, apiKey, profile, existingTags = [], existingCards = [], opts = {}) {
  if (!apiKey) throw new Error('No API key configured');
  if (!profile) throw new Error('No scan profile selected');

  const imageBlocks = images.map(({ base64, mediaType }) => ({
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: base64 },
  }));

  const fieldLabels = (profile.fields || []).map((f) => `"${f.label}"`).join(', ');
  const tagList = existingTags.length > 0 ? existingTags.map((t) => `"${t}"`).join(', ') : 'none yet';
  const additionalInstructions = profile.additionalInstructions || profile.scanInstructions || '';

  const existingCardList = existingCards.length > 0
    ? existingCards.map((c) => `"${c.name}"`).join(', ')
    : 'none yet';

  const systemPrompt = `You are a reference card parser building a cross-linked wiki from photos. Break the page down into the SMALLEST meaningful, independently-referenceable entries and return ONLY valid JSON — no markdown, no backticks, no preamble.

Return a JSON array where each element has this shape:
{
  "name": "string",
  "summary": "string",
  "source": "string|null",
  "tags": ["string"],
  "sections": [
    {
      "name": "string",
      "type": "text|key-value",
      "content": "string|null",
      "keyValues": {"key":"value"}|null,
      "priority": number
    }
  ]
}

Profile fields (use these as section names, in order): ${fieldLabels || 'Name, Description'}

${additionalInstructions}

Granularity rules (IMPORTANT — this is what makes the wiki useful):
- Create a SEPARATE card for EVERY proper-named thing that could be referenced from elsewhere: each named spell, named ability, named feature, named item, named subclass/archetype, named creature, named location, etc.
- Do NOT lump a whole class, chapter, or page into one giant card. If a page describes a class with five named features and a spell list, that is one overview card PLUS one card per named feature PLUS one card per named spell.
- When a subject is an overview/parent (e.g. a class), make a card for it whose sections describe it generally and LINK to its named sub-parts, rather than inlining all their full text.
- Descriptive prose with no proper name of its own stays as a section inside its parent card — do not invent cards for unnamed paragraphs.

Category / tag rules:
- The app has these existing tags: [${tagList}]. Assign each card 0-3 tags from this list that fit. Only use tags from this list — do not invent new ones.

Linking rules:
- Whenever a card's text references another subject that has its own card — whether newly created in THIS batch or already existing — write the reference as [[Subject Name]] (double square brackets, exact name match).
- Cards already in this wiki (link to these by exact name when referenced; do NOT recreate them): [${existingCardList}].
- Do not link to subjects that have no card.

General rules:
- If two images show the same subject, merge them into one card. If a subject already exists in the wiki list above, do not duplicate it — reference it with a link instead.
- For structured data (stats, properties): use type "key-value".
- For prose text: use type "text".
- summary: one sentence under 15 words capturing what this entry is.
- Return ONLY the JSON array.`;

  const userPrompt = images.length === 1
    ? 'Extract all distinct subjects from this image into separate wiki cards.'
    : `Extract all distinct subjects from these ${images.length} images into separate wiki cards. Merge any that cover the same subject.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: userPrompt }] }],
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || 'API error: ' + res.status);
  }

  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  const cards = JSON.parse(text.replace(/```json|```/g, '').trim());
  if (!Array.isArray(cards)) throw new Error('Unexpected response format from batch scan');
  return { cards, usage: data.usage };
}

// ── Resolve [[Title]] links within a batch of cards ──
// Mutates section text in place: [[Title]] → [[id|Title]] where title matches a card name.
// existingCards: prior cards in the wiki [{ id, name }] so new cards can link to them too.
export function resolveBatchLinks(cards, existingCards = []) {
  const titleToId = {};
  existingCards.forEach((c) => { if (c.name) titleToId[c.name.toLowerCase()] = c.id; });
  cards.forEach((c) => { titleToId[c.name.toLowerCase()] = c.id; });

  function resolve(text) {
    if (!text) return text;
    return text.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
      const id = titleToId[title.toLowerCase()];
      return id ? `[[${id}|${title}]]` : title;
    });
  }

  cards.forEach((card) => {
    (card.sections || []).forEach((s) => {
      if (s.content) s.content = resolve(s.content);
      if (s.keyValues) {
        Object.keys(s.keyValues).forEach((k) => {
          s.keyValues[k] = resolve(s.keyValues[k]);
        });
      }
    });
  });
}

// ── Chat message send ──
// messages: Anthropic-format array (role/content). tools: optional array of tool defs.
export async function sendChatMessage(messages, systemPrompt, apiKey, tools = []) {
  if (!apiKey) throw new Error('No API key configured');

  const body = {
    model: 'claude-opus-4-8',
    max_tokens: 4000,
    system: systemPrompt,
    messages,
  };
  if (tools.length > 0) body.tools = tools;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || 'API error: ' + res.status);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return { text: text || '(No text response)', usage: data.usage };
}

// ── Crop image helper ──
export function cropImage(imgEl, rect, dispW, dispH) {
  const c = document.createElement('canvas');
  const sx = (rect.x * imgEl.naturalWidth) / dispW;
  const sy = (rect.y * imgEl.naturalHeight) / dispH;
  const sw = (rect.w * imgEl.naturalWidth) / dispW;
  const sh = (rect.h * imgEl.naturalHeight) / dispH;
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  c.getContext('2d').drawImage(
    imgEl, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh),
    0, 0, c.width, c.height
  );
  return c.toDataURL('image/jpeg', 0.92).split(',')[1];
}
