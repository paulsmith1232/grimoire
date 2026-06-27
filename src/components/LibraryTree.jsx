import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../context';
import { getOutgoingLinks } from '../linking';

const ROOT = '__root__';
const EDGE = 70;          // px from container edge that triggers auto-scroll
const AUTO_SPEED = 8;     // px per frame auto-scroll

// ── Build the hybrid tree: explicit parentId/treeOrder first, link-derived fallback ──
function buildTree(cards, homeCardIds) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const inScope = new Set(byId.keys());

  // Normalize a card's effective parent: ROOT, a real in-scope card, or null (unplaced).
  const effParent = (c) =>
    c.parentId === ROOT ? ROOT : (c.parentId && byId.has(c.parentId) ? c.parentId : null);

  const explicitChildren = new Map();
  for (const c of cards) {
    const p = effParent(c);
    if (p == null) continue;
    if (!explicitChildren.has(p)) explicitChildren.set(p, []);
    explicitChildren.get(p).push(c);
  }
  for (const arr of explicitChildren.values()) {
    arr.sort((a, b) => (a.treeOrder ?? 0) - (b.treeOrder ?? 0));
  }

  const linkChildren = (card) =>
    getOutgoingLinks(card).filter((id) => inScope.has(id) && id !== card.id).map((id) => byId.get(id));

  function childrenOf(cardId) {
    const exp = explicitChildren.get(cardId) || [];
    const expIds = new Set(exp.map((c) => c.id));
    const card = byId.get(cardId);
    const derived = card
      ? linkChildren(card).filter((c) => effParent(c) == null && !expIds.has(c.id))
      : [];
    return [...exp, ...derived];
  }

  // Roots
  const explicitRoots = explicitChildren.get(ROOT) || [];
  const expRootIds = new Set(explicitRoots.map((c) => c.id));
  const homeRoots = cards.filter((c) => homeCardIds.has(c.id) && effParent(c) == null);
  let derivedRoots;
  if (homeRoots.length > 0) {
    derivedRoots = homeRoots;
  } else {
    const hasIncoming = new Set();
    for (const c of cards) for (const id of getOutgoingLinks(c)) if (inScope.has(id) && id !== c.id) hasIncoming.add(id);
    derivedRoots = cards.filter((c) => effParent(c) == null && !hasIncoming.has(c.id));
  }
  const roots = [...explicitRoots, ...derivedRoots.filter((c) => !expRootIds.has(c.id))];

  return { roots, childrenOf, byId };
}

// Flatten the visible tree into rows, respecting expand state and guarding cycles.
function flatten(roots, childrenOf, expanded) {
  const rows = [];
  function walk(card, depth, path, parentId) {
    const kids = childrenOf(card.id).filter((c) => !path.includes(c.id) && c.id !== card.id);
    const open = expanded.has(card.id);
    rows.push({ card, depth, parentId, hasChildren: kids.length > 0, open });
    if (open) for (const k of kids) walk(k, depth + 1, [...path, card.id], card.id);
  }
  for (const r of roots) walk(r, 0, [], ROOT);
  return rows;
}

export default function LibraryTree({ cards, homeCardIds, onOpen }) {
  const { saveCards } = useApp();
  const [expanded, setExpanded] = useState(() => {
    // start with roots expanded
    const t = buildTree(cards, homeCardIds);
    return new Set(t.roots.map((c) => c.id));
  });
  const [showHelp, setShowHelp] = useState(false);
  const [drag, setDrag] = useState(null);      // { id }
  const [drop, setDrop] = useState(null);       // { targetId, mode: before|after|child }

  const tree = useMemo(() => buildTree(cards, homeCardIds), [cards, homeCardIds]);
  const rows = useMemo(() => flatten(tree.roots, tree.childrenOf, expanded), [tree, expanded]);

  // Orphans: cards never reached from roots (ignoring expand state)
  const orphans = useMemo(() => {
    const reached = new Set();
    const stack = tree.roots.map((c) => c.id);
    while (stack.length) {
      const id = stack.pop();
      if (reached.has(id)) continue;
      reached.add(id);
      for (const c of tree.childrenOf(id)) if (!reached.has(c.id)) stack.push(c.id);
    }
    return cards.filter((c) => !reached.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [cards, tree]);

  const wrapRef = useRef(null);
  const dragState = useRef({ id: null, scrollEl: null, raf: 0, dir: 0 });

  function isInSubtree(rootId, targetId, path = []) {
    if (rootId === targetId) return true;
    if (path.includes(rootId)) return false;
    for (const c of tree.childrenOf(rootId)) if (isInSubtree(c.id, targetId, [...path, rootId])) return true;
    return false;
  }

  // Auto-scroll loop while dragging near an edge
  const autoScroll = useCallback(() => {
    const st = dragState.current;
    if (st.dir !== 0 && st.scrollEl) {
      st.scrollEl.scrollTop += st.dir * AUTO_SPEED;
      st.raf = requestAnimationFrame(autoScroll);
    } else {
      st.raf = 0;
    }
  }, []);

  function hitTest(clientY) {
    // Find which tree row the pointer is over and the drop mode.
    const els = wrapRef.current?.querySelectorAll('[data-treerow]') || [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        const id = el.getAttribute('data-treerow');
        const frac = (clientY - r.top) / r.height;
        const mode = frac < 0.25 ? 'before' : frac > 0.75 ? 'after' : 'child';
        return { targetId: id, mode };
      }
    }
    return null;
  }

  function onGripDown(e, cardId) {
    e.preventDefault();
    e.stopPropagation();
    const scrollEl = wrapRef.current?.closest('.content') || null;
    dragState.current = { id: cardId, scrollEl, raf: 0, dir: 0 };
    setDrag({ id: cardId });
    if (scrollEl) scrollEl.style.overflow = 'hidden'; // suspend native scroll during drag
    try { e.target.setPointerCapture(e.pointerId); } catch {}
  }

  function onPointerMove(e) {
    if (!dragState.current.id) return;
    e.preventDefault();
    const y = e.clientY;
    // edge auto-scroll
    const sc = dragState.current.scrollEl;
    if (sc) {
      const r = sc.getBoundingClientRect();
      const dir = y < r.top + EDGE ? -1 : y > r.bottom - EDGE ? 1 : 0;
      dragState.current.dir = dir;
      if (dir !== 0 && dragState.current.raf === 0) dragState.current.raf = requestAnimationFrame(autoScroll);
    }
    const hit = hitTest(y);
    if (!hit || hit.targetId === dragState.current.id) { setDrop(null); return; }
    setDrop(hit);
  }

  function endDrag() {
    const sc = dragState.current.scrollEl;
    if (sc) sc.style.overflow = '';
    if (dragState.current.raf) cancelAnimationFrame(dragState.current.raf);
    dragState.current = { id: null, scrollEl: null, raf: 0, dir: 0 };
  }

  async function onPointerUp() {
    const draggedId = dragState.current.id;
    const target = drop;
    endDrag();
    setDrag(null);
    setDrop(null);
    if (!draggedId || !target) return;
    await performDrop(draggedId, target);
  }

  async function performDrop(draggedId, target) {
    const dragged = tree.byId.get(draggedId);
    if (!dragged) return;
    const targetRow = rows.find((r) => r.card.id === target.targetId);
    if (!targetRow) return;

    let newParent, siblings;
    if (target.mode === 'child') {
      newParent = target.targetId;
      if (isInSubtree(draggedId, newParent)) return; // would create a cycle
      siblings = tree.childrenOf(newParent).filter((c) => c.id !== draggedId);
      siblings.push(dragged);
      setExpanded((s) => new Set(s).add(newParent)); // reveal the new child
    } else {
      newParent = targetRow.parentId;
      if (newParent !== ROOT && isInSubtree(draggedId, newParent)) return;
      const base = newParent === ROOT ? tree.roots : tree.childrenOf(newParent);
      siblings = base.filter((c) => c.id !== draggedId);
      const idx = siblings.findIndex((c) => c.id === target.targetId);
      siblings.splice(target.mode === 'before' ? idx : idx + 1, 0, dragged);
    }

    // Freeze this sibling group explicitly with sequential order.
    const changed = [];
    siblings.forEach((c, i) => {
      if (c.parentId !== newParent || c.treeOrder !== i) {
        changed.push({ ...c, parentId: newParent, treeOrder: i });
      }
    });
    if (changed.length) await saveCards(changed);
  }

  function toggle(id) {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  if (cards.length === 0) {
    return <div className="empty-state"><div className="icon">🌲</div><div className="title">Nothing to outline</div></div>;
  }

  return (
    <div ref={wrapRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ marginTop: 10, touchAction: drag ? 'none' : 'auto' }}>
      {/* Header with help toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          onClick={() => setShowHelp((v) => !v)}
          aria-label="How to rearrange"
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%', width: 28, height: 28, color: 'var(--text-dim)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >?</button>
      </div>

      {showHelp && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Rearranging the tree</div>
          <div>• <b>Press and hold the ⠿ grip</b> on a row, then drag.</div>
          <div>• Drop <b>onto a card</b> (middle) to nest it as a child.</div>
          <div>• Drop <b>between rows</b> (top/bottom edge) to reorder.</div>
          <div>• Drag near the <b>top or bottom edge</b> to auto-scroll to far branches.</div>
          <div>• Tap <b>▸</b> to expand, the <b>name</b> to open a card.</div>
          <div style={{ marginTop: 6, color: 'var(--text-dim)', fontSize: 12 }}>Cards you move stay pinned; untouched cards keep auto-arranging from their links.</div>
        </div>
      )}

      {rows.map((row) => {
        const isDragging = drag?.id === row.card.id;
        const dropHere = drop?.targetId === row.card.id ? drop.mode : null;
        return (
          <div
            key={row.card.id}
            data-treerow={row.card.id}
            style={{
              position: 'relative',
              borderBottom: '1px solid var(--border)',
              borderTop: dropHere === 'before' ? '2px solid var(--accent)' : '2px solid transparent',
              opacity: isDragging ? 0.4 : 1,
              background: dropHere === 'child' ? 'var(--accent-glow)' : 'transparent',
              boxShadow: dropHere === 'after' ? 'inset 0 -2px 0 var(--accent)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 0', paddingLeft: row.depth * 16, minHeight: 40 }}>
              {row.hasChildren ? (
                <button onClick={() => toggle(row.card.id)} aria-label={row.open ? 'Collapse' : 'Expand'}
                  style={{ width: 18, flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 11, padding: 0, textAlign: 'left' }}>
                  {row.open ? '▾' : '▸'}
                </button>
              ) : <span style={{ width: 18, flexShrink: 0, color: 'var(--border)', fontSize: 11 }}>·</span>}

              <span
                onPointerDown={(e) => onGripDown(e, row.card.id)}
                style={{ flexShrink: 0, color: 'var(--text-dim)', fontSize: 16, cursor: 'grab', touchAction: 'none', padding: '4px 2px', lineHeight: 1 }}
                aria-label="Drag to rearrange"
              >⠿</span>

              <button onClick={() => onOpen(row.card.id)}
                style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                {homeCardIds.has(row.card.id) && <span style={{ color: 'var(--accent)' }}>⌂</span>}
                <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: row.depth === 0 ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.card.name}
                </span>
                {row.hasChildren && !row.open && (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>({tree.childrenOf(row.card.id).length})</span>
                )}
              </button>
            </div>
          </div>
        );
      })}

      {orphans.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Unconnected ({orphans.length}) — drag into the tree to attach
          </div>
          {orphans.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 0', minHeight: 40, borderBottom: '1px solid var(--border)', opacity: drag?.id === c.id ? 0.4 : 1 }}>
              <span style={{ width: 18, flexShrink: 0 }} />
              <span onPointerDown={(e) => onGripDown(e, c.id)}
                style={{ flexShrink: 0, color: 'var(--text-dim)', fontSize: 16, cursor: 'grab', touchAction: 'none', padding: '4px 2px', lineHeight: 1 }}
                aria-label="Drag to attach">⠿</span>
              <button onClick={() => onOpen(c.id)} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                <span style={{ color: 'var(--text)', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
