import React, { useState, useMemo } from 'react';
import { getOutgoingLinks } from '../linking';

// A collapsible outline derived from the link graph: roots (home cards, or
// link "sources" if none) expand down through their linked children. Non-
// destructive — it only renders existing links, nothing is rewritten.
export default function LibraryTree({ cards, homeCardIds, onOpen }) {
  const cardById = useMemo(() => {
    const m = new Map();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  const { roots, orphans } = useMemo(() => {
    const inScope = new Set(cards.map((c) => c.id));

    // Roots: home cards in scope; else cards with no incoming link from within scope.
    let rootIds = cards.filter((c) => homeCardIds.has(c.id)).map((c) => c.id);
    if (rootIds.length === 0) {
      const hasIncoming = new Set();
      for (const c of cards) {
        for (const id of getOutgoingLinks(c)) {
          if (inScope.has(id) && id !== c.id) hasIncoming.add(id);
        }
      }
      rootIds = cards.filter((c) => !hasIncoming.has(c.id)).map((c) => c.id);
    }

    // Reachable set from roots (for orphan detection).
    const reachable = new Set();
    const stack = [...rootIds];
    while (stack.length) {
      const id = stack.pop();
      if (reachable.has(id)) continue;
      reachable.add(id);
      const c = cardById.get(id);
      if (!c) continue;
      for (const childId of getOutgoingLinks(c)) {
        if (inScope.has(childId) && !reachable.has(childId)) stack.push(childId);
      }
    }

    const orphanCards = cards
      .filter((c) => !reachable.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { roots: rootIds, orphans: orphanCards };
  }, [cards, cardById, homeCardIds]);

  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">🌲</div>
        <div className="title">Nothing to outline</div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      {roots.map((id) => {
        const card = cardById.get(id);
        if (!card) return null;
        return (
          <TreeNode key={id} card={card} cardById={cardById} path={[]} depth={0} onOpen={onOpen} isHome={homeCardIds.has(id)} />
        );
      })}

      {orphans.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Unconnected ({orphans.length})
          </div>
          {orphans.map((c) => (
            <button key={c.id} className="tree-row" onClick={() => onOpen(c.id)} style={treeRowStyle(0)}>
              <span style={{ width: 18, flexShrink: 0 }} />
              <span style={{ color: 'var(--text)', fontSize: 14 }}>{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNode({ card, cardById, path, depth, onOpen, isHome }) {
  const [open, setOpen] = useState(depth === 0); // roots start expanded

  // Children: outgoing links that exist in scope and aren't already an ancestor (cycle guard).
  const childIds = getOutgoingLinks(card).filter((id) => cardById.has(id) && !path.includes(id) && id !== card.id);
  const hasChildren = childIds.length > 0;
  const nextPath = [...path, card.id];

  return (
    <div>
      <div style={treeRowStyle(depth)}>
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Collapse' : 'Expand'}
            style={{ width: 18, flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11, padding: 0, textAlign: 'left' }}
          >{open ? '▾' : '▸'}</button>
        ) : (
          <span style={{ width: 18, flexShrink: 0, color: 'var(--border)', fontSize: 11 }}>·</span>
        )}
        <button
          onClick={() => onOpen(card.id)}
          style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {isHome && <span style={{ color: 'var(--accent)' }}>⌂</span>}
          <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: depth === 0 ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {card.name}
          </span>
          {hasChildren && !open && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>({childIds.length})</span>
          )}
        </button>
      </div>
      {open && hasChildren && childIds.map((id) => (
        <TreeNode key={id} card={cardById.get(id)} cardById={cardById} path={nextPath} depth={depth + 1} onOpen={onOpen} isHome={false} />
      ))}
    </div>
  );
}

function treeRowStyle(depth) {
  return {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    padding: '7px 0', paddingLeft: depth * 16,
    minHeight: 38, borderBottom: '1px solid var(--border)',
  };
}
