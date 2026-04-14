import React from 'react';
import { segmentText } from '../linking';
import { useApp } from '../context';

/**
 * Renders text with [[cardId|display text]] links as tappable gold spans.
 * Clicking a link navigates to that card.
 */
export default function LinkedText({ text, className, style }) {
  const { state, navigateToCard } = useApp();

  if (!text) return null;

  const segments = segmentText(text);

  if (segments.length === 0) return null;
  if (segments.length === 1 && segments[0].type === 'text') {
    return <span className={className} style={style}>{segments[0].content}</span>;
  }

  return (
    <span className={className} style={style}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <span key={i}>{seg.content}</span>;
        }

        const targetCard = state.cards.find((c) => c.id === seg.cardId);
        const exists = !!targetCard;

        return (
          <span
            key={i}
            className="linked-term"
            data-exists={exists}
            title={exists ? `Go to: ${targetCard.name}` : `Card not found: ${seg.cardId}`}
            onClick={(e) => {
              e.stopPropagation();
              if (exists) navigateToCard(seg.cardId, false);
            }}
          >
            {seg.displayText}
          </span>
        );
      })}
    </span>
  );
}
