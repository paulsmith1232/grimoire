// ── Link markup format: [[cardId|display text]] ──

const LINK_REGEX = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

/**
 * Parse a text string and extract all links
 * Returns array of { cardId, displayText, start, end }
 */
export function parseLinks(text) {
  if (!text) return [];
  const links = [];
  let match;
  const regex = new RegExp(LINK_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    links.push({
      cardId: match[1],
      displayText: match[2],
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }
  return links;
}

/**
 * Split text into segments of plain text and links for rendering
 * Returns array of { type: 'text'|'link', content, cardId?, displayText? }
 */
export function segmentText(text) {
  if (!text) return [];
  const segments = [];
  let lastIndex = 0;
  const regex = new RegExp(LINK_REGEX.source, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Plain text before this link
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'link',
      content: match[2],
      cardId: match[1],
      displayText: match[2],
    });
    lastIndex = match.index + match[0].length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Insert a link into text at the given range
 */
export function insertLink(text, start, end, cardId, displayText) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  return before + `[[${cardId}|${displayText}]]` + after;
}

/**
 * Remove a link from text, keeping the display text
 */
export function removeLink(text, cardId) {
  return text.replace(new RegExp(`\\[\\[${escapeRegex(cardId)}\\|([^\\]]+)\\]\\]`, 'g'), '$1');
}

/**
 * Get plain text with all link markup stripped
 */
export function stripLinks(text) {
  if (!text) return '';
  return text.replace(LINK_REGEX, '$2');
}

/**
 * Compute reverse links: which cards link TO this card
 * Returns array of { cardId, cardName, sectionName }
 */
export function computeReverseLinks(targetCardId, allCards) {
  const refs = [];
  for (const card of allCards) {
    if (card.id === targetCardId) continue;
    for (const sec of card.sections || []) {
      const text = sec.content || '';
      const kvText = sec.keyValues ? Object.values(sec.keyValues).join(' ') : '';
      const combined = text + ' ' + kvText;
      const links = parseLinks(combined);
      if (links.some((l) => l.cardId === targetCardId)) {
        refs.push({ cardId: card.id, cardName: card.name, sectionName: sec.name });
      }
    }
  }
  return refs;
}

/**
 * Get all card IDs referenced from a card's sections
 */
export function getOutgoingLinks(card) {
  const ids = new Set();
  for (const sec of card.sections || []) {
    const text = sec.content || '';
    const kvText = sec.keyValues ? Object.values(sec.keyValues).join(' ') : '';
    for (const link of parseLinks(text + ' ' + kvText)) {
      ids.add(link.cardId);
    }
  }
  return [...ids];
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
