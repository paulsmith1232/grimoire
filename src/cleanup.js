// ── Card text de-duplication ──
// Removes repeated paragraphs/blocks that accumulate when scans append the same
// content to an existing card more than once.

// Normalize a paragraph for comparison: collapse whitespace, lowercase, strip
// link markup so [[id|Sacred Flame]] and "Sacred Flame" compare equal.
function normalize(text) {
  return text
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Remove duplicate paragraphs from a block of text, keeping first occurrence.
// Paragraphs are split on blank lines. Returns { text, removed }.
export function dedupeText(text) {
  if (!text) return { text, removed: 0 };
  const paragraphs = text.split(/\n\s*\n/);
  const seen = new Set();
  const kept = [];
  let removed = 0;
  for (const p of paragraphs) {
    const key = normalize(p);
    if (key === '') { kept.push(p); continue; }
    if (seen.has(key)) { removed++; continue; }
    seen.add(key);
    kept.push(p);
  }
  return { text: kept.join('\n\n'), removed };
}

// Dedupe every text section in a card. Returns { card, removed } where card is a
// new object only if anything changed (removed > 0), otherwise the original.
export function dedupeCard(card) {
  let removed = 0;
  const sections = (card.sections || []).map((sec) => {
    if (sec.type === 'text' && sec.content) {
      const r = dedupeText(sec.content);
      removed += r.removed;
      if (r.removed > 0) return { ...sec, content: r.text };
    }
    return sec;
  });
  if (removed === 0) return { card, removed: 0 };
  return { card: { ...card, sections }, removed };
}
