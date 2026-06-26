// ── Auto-linking: find plain-text mentions of existing card names and turn
// them into [[id|text]] links. Pure string matching, no API. ──

import { segmentText, parseLinks } from './linking';

const MIN_NAME_LEN = 4; // ignore very short names to avoid false matches

function isWordChar(ch) {
  return !!ch && /[A-Za-z0-9]/.test(ch);
}

// Find the first standalone (word-bounded) occurrence of `name` in `text`,
// case-insensitive. Returns the index or -1. Handles names with punctuation
// like "Channel Divinity (Paladin)".
function findStandalone(text, name, from = 0) {
  const lower = text.toLowerCase();
  const target = name.toLowerCase();
  let i = from;
  while (true) {
    const idx = lower.indexOf(target, i);
    if (idx === -1) return -1;
    const before = idx > 0 ? text[idx - 1] : '';
    const after = idx + target.length < text.length ? text[idx + target.length] : '';
    if (!isWordChar(before) && !isWordChar(after)) return idx;
    i = idx + target.length;
  }
}

// Does a plain-text (non-link) segment of `content` contain a standalone mention?
function hasPlainMention(content, name) {
  for (const seg of segmentText(content)) {
    if (seg.type === 'text' && findStandalone(seg.content, name) !== -1) return true;
  }
  return false;
}

// Insert a link at the first unlinked standalone occurrence of `targetName`.
// Returns { content, changed }.
export function insertFirstLink(content, targetId, targetName) {
  const segments = segmentText(content);
  let changed = false;
  let out = '';
  for (const seg of segments) {
    if (seg.type === 'link') {
      out += `[[${seg.cardId}|${seg.displayText}]]`;
      continue;
    }
    if (!changed) {
      const idx = findStandalone(seg.content, targetName);
      if (idx !== -1) {
        const matched = seg.content.slice(idx, idx + targetName.length);
        out += seg.content.slice(0, idx) + `[[${targetId}|${matched}]]` + seg.content.slice(idx + targetName.length);
        changed = true;
        continue;
      }
    }
    out += seg.content;
  }
  return { content: out, changed };
}

// Scan all cards and propose links. Returns an array of proposals:
// { cardId, cardName, sectionName, targetId, targetName, snippet }
export function findAutoLinks(cards) {
  // Candidate targets: longer names first so "Oath of Devotion" beats "Devotion".
  const targets = cards
    .filter((c) => (c.name || '').length >= MIN_NAME_LEN)
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => b.name.length - a.name.length);

  const proposals = [];
  for (const card of cards) {
    for (const sec of card.sections || []) {
      if (sec.type !== 'text' || !sec.content) continue;
      const alreadyLinked = new Set(parseLinks(sec.content).map((l) => l.cardId));
      const usedInSection = new Set();
      for (const t of targets) {
        if (t.id === card.id) continue;            // no self-links
        if (alreadyLinked.has(t.id)) continue;     // already linked here
        if (usedInSection.has(t.id)) continue;
        if (!hasPlainMention(sec.content, t.name)) continue;
        proposals.push({
          cardId: card.id,
          cardName: card.name,
          sectionName: sec.name,
          targetId: t.id,
          targetName: t.name,
          snippet: makeSnippet(sec.content, t.name),
        });
        usedInSection.add(t.id);
      }
    }
  }
  return proposals;
}

function makeSnippet(content, name) {
  for (const seg of segmentText(content)) {
    if (seg.type !== 'text') continue;
    const idx = findStandalone(seg.content, name);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 30);
    const end = Math.min(seg.content.length, idx + name.length + 30);
    return (start > 0 ? '…' : '') + seg.content.slice(start, end).trim() + (end < seg.content.length ? '…' : '');
  }
  return '';
}
