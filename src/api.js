const SUMMARY_INSTRUCTION = `Also generate a "summary" field: a single sentence under 15 words capturing what this card is and its key relationships or category. This is used for indexing, not display.`;

// ── Dynamic prompt builder ──
export function buildPrompt(profile) {
  if (profile.useCustomPrompt) {
    return (profile.customPrompt || '') + `\n\n${SUMMARY_INSTRUCTION}`;
  }

  const sectionDefs = (profile.sections || [])
    .map((s) => `"${s.name}" (type: ${s.type}, priority: ${s.priority})`)
    .join(', ');

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

This profile expects these sections: ${sectionDefs}

${profile.scanInstructions || ''}

Rules:
- Return sections in the order listed above. Only include sections that have actual content.
- For "text" type: put content in "content", leave keyValues null.
- For "key-value" type: put structured data in "keyValues" as string pairs, leave content null.
- Preserve body text faithfully.
- If multiple entries visible, extract only the most prominent one.
- ${SUMMARY_INSTRUCTION}
- Return ONLY the JSON object.`;
}

// ── Parse card from one or more images ──
// images: [{ base64, mediaType }, ...]
export async function parseCardImage(images, apiKey, profile) {
  if (!apiKey) throw new Error('No API key configured');
  if (!profile) throw new Error('No scan profile selected');

  const imageBlocks = images.map(({ base64, mediaType }) => ({
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: base64 },
  }));

  const prompt = images.length > 1
    ? 'Extract the content from these images into a single structured card, combining information across all images.'
    : 'Extract the content from this image into a structured card.';

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
      system: buildPrompt(profile),
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
