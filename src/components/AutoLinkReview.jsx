import React, { useState, useMemo } from 'react';
import { useApp } from '../context';
import { findAutoLinks, insertFirstLink } from '../autolink';

// Review-gated auto-linking: finds plain-text mentions of existing card names
// and offers to convert them into links. No API — pure string matching.
export default function AutoLinkReview({ onClose }) {
  const { state, saveCard } = useApp();
  const [phase, setPhase] = useState('select'); // select | review | saving
  const [profileId, setProfileId] = useState('all');
  const [proposals, setProposals] = useState([]);
  const [accepted, setAccepted] = useState(() => new Set());

  const scopedCards = profileId === 'all'
    ? state.cards
    : state.cards.filter((c) => c.profileId === profileId);

  function run() {
    // Match against all cards (cross-profile links are valid), but only propose
    // edits to cards within the chosen scope.
    const all = findAutoLinks(state.cards);
    const scopeIds = new Set(scopedCards.map((c) => c.id));
    const found = all.filter((p) => scopeIds.has(p.cardId));
    setProposals(found);
    setAccepted(new Set(found.map((_, i) => i)));
    setPhase('review');
  }

  // Group proposals by card for display
  const grouped = useMemo(() => {
    const m = new Map();
    proposals.forEach((p, i) => {
      if (!m.has(p.cardId)) m.set(p.cardId, []);
      m.get(p.cardId).push({ ...p, index: i });
    });
    return [...m.values()];
  }, [proposals]);

  function toggle(i) {
    setAccepted((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  async function handleApply() {
    setPhase('saving');
    // Group accepted proposals by card, apply sequentially per section.
    const byCard = new Map();
    proposals.forEach((p, i) => {
      if (!accepted.has(i)) return;
      if (!byCard.has(p.cardId)) byCard.set(p.cardId, []);
      byCard.get(p.cardId).push(p);
    });

    for (const [cardId, props] of byCard) {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) continue;
      const sections = (card.sections || []).map((sec) => {
        const forSection = props.filter((p) => p.sectionName === sec.name);
        if (forSection.length === 0) return sec;

        if (sec.type === 'text' && sec.content) {
          let content = sec.content;
          for (const p of forSection.filter((p) => p.kind === 'text')) {
            const r = insertFirstLink(content, p.targetId, p.targetName);
            if (r.changed) content = r.content;
          }
          return { ...sec, content };
        }

        if (sec.type === 'key-value' && sec.keyValues) {
          // Rebuild entries in order, applying value edits (kind 'kv') and key
          // renames (kind 'kvkey'). Match proposals against the ORIGINAL key.
          const keyValues = {};
          for (const [origKey, origVal] of Object.entries(sec.keyValues)) {
            let newKey = origKey;
            for (const p of forSection.filter((p) => p.kind === 'kvkey' && p.kvKey === origKey)) {
              const r = insertFirstLink(newKey, p.targetId, p.targetName);
              if (r.changed) newKey = r.content;
            }
            let newVal = String(origVal);
            for (const p of forSection.filter((p) => p.kind === 'kv' && p.kvKey === origKey)) {
              const r = insertFirstLink(newVal, p.targetId, p.targetName);
              if (r.changed) newVal = r.content;
            }
            keyValues[newKey] = newVal;
          }
          return { ...sec, keyValues };
        }

        return sec;
      });
      await saveCard({ ...card, sections });
    }
    onClose();
  }

  if (phase === 'select') {
    return (
      <div className="section fade-in">
        <button className="back-btn" onClick={onClose}>← Cancel</button>
        <h2 className="section-title">Auto-Link Cards</h2>
        <p className="help" style={{ marginTop: 0 }}>
          Finds plain-text mentions of other cards' names and offers to turn them into links. No AI — just exact name matching.
        </p>
        <div className="edit-field" style={{ marginTop: 8 }}>
          <label>Profile</label>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="all">All profiles</option>
            {state.profiles.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
          </select>
        </div>
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 14, opacity: scopedCards.length === 0 ? 0.5 : 1 }}
          disabled={scopedCards.length === 0}
          onClick={run}
        >
          Scan {scopedCards.length} Card{scopedCards.length !== 1 ? 's' : ''} for Links
        </button>
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <div className="section fade-in">
        <button className="back-btn" onClick={onClose}>← Back</button>
        <div className="empty-state">
          <div className="icon">🔗</div>
          <div className="title">No new links found</div>
          <div className="sub">Every mention is already linked.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="section fade-in">
      <button className="back-btn" onClick={onClose}>← Cancel</button>
      <h2 className="section-title">Auto-Link Cards</h2>
      <p className="help" style={{ marginTop: 0 }}>
        {proposals.length} suggested link{proposals.length !== 1 ? 's' : ''}. Untick any you don't want, then apply.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
        {grouped.map((group) => (
          <div key={group[0].cardId}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 6 }}>
              {group[0].cardName}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.map((p) => {
                const on = accepted.has(p.index);
                return (
                  <button
                    key={p.index}
                    onClick={() => toggle(p.index)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
                      background: on ? 'var(--bg-card)' : 'var(--bg)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '8px 10px', cursor: 'pointer', opacity: on ? 1 : 0.55,
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                      border: `2px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      background: on ? 'var(--accent)' : 'transparent',
                      color: '#1a1714', fontWeight: 700, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{on ? '✓' : ''}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>
                        Link <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{p.targetName}</span>
                        <span style={{ color: 'var(--text-dim)' }}> in {p.sectionName}</span>
                      </div>
                      {p.snippet && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{p.snippet}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        className="btn btn-primary btn-block"
        disabled={accepted.size === 0 || phase === 'saving'}
        style={{ opacity: accepted.size === 0 || phase === 'saving' ? 0.5 : 1 }}
        onClick={handleApply}
      >
        {phase === 'saving' ? 'Applying…' : `Apply ${accepted.size} Link${accepted.size !== 1 ? 's' : ''}`}
      </button>
      <button className="btn btn-block" style={{ marginTop: 8 }} onClick={onClose} disabled={phase === 'saving'}>
        Cancel
      </button>
    </div>
  );
}
