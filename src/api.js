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
      model: 'claude-sonnet-4-20250514',
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

// ── Chat message send ──
// messages: Anthropic-format array (role/content). tools: optional array of tool defs.
export async function sendChatMessage(messages, systemPrompt, apiKey, tools = []) {
  if (!apiKey) throw new Error('No API key configured');

  const body = {
    model: 'claude-sonnet-4-20250514',
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
