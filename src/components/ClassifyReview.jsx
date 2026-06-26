import React, { useState, useEffect } from 'react';
import { useApp } from '../context';
import { classifyCards } from '../api';
import { getOutgoingLinks } from '../linking';

// Review-gated AI tag backfill. Suggests a class/subject tag (or "General") for
// each card, using link context, and lets the user edit/skip before applying.
export default function ClassifyReview({ onClose }) {
  const { state, saveCard, addTag } = useApp();
  const [phase, setPhase] = useState('loading'); // loading | review | error | saving
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]); // { card, suggested, apply }
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nameById = {};
        for (const c of state.cards) nameById[c.id] = c.name;
        const items = state.cards.map((c) => ({
          id: c.id,
          name: c.name,
          summary: c.summary || '',
          links: getOutgoingLinks(c).map((id) => nameById[id]).filter(Boolean),
        }));
        const candidateTags = state.tags;
        const { result, usage } = await classifyCards(items, candidateTags, state.apiKey);
        if (cancelled) return;
        const byId = {};
        for (const r of result) byId[r.id] = r.tag;
        const built = state.cards
          .map((card) => {
            const suggested = byId[card.id] || 'General';
            const alreadyHas = (card.tags || []).includes(suggested);
            return { card, suggested, apply: suggested !== 'General' && !alreadyHas };
          })
          .sort((a, b) => Number(b.apply) - Number(a.apply));
        setRows(built);
        setUsage(usage);
        setPhase('review');
      } catch (e) {
        if (cancelled) return;
        setError(e.message || 'Classification failed.');
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function setRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.card.id === id ? { ...r, ...patch } : r)));
  }

  async function handleApply() {
    setPhase('saving');
    const seen = new Set(state.tags);
    for (const r of rows) {
      if (!r.apply || !r.suggested || r.suggested === 'General') continue;
      if (!seen.has(r.suggested)) { await addTag(r.suggested); seen.add(r.suggested); }
      const tags = r.card.tags || [];
      if (!tags.includes(r.suggested)) {
        await saveCard({ ...r.card, tags: [...tags, r.suggested] });
      }
    }
    onClose();
  }

  if (phase === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 26, marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }}>🏷</div>
        <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>Classifying {state.cards.length} cards…</div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="setting-group">
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
      </div>
    );
  }

  const applyCount = rows.filter((r) => r.apply).length;

  return (
    <div className="section fade-in">
      <button className="back-btn" onClick={onClose}>← Cancel</button>
      <h2 className="section-title">Classify Cards</h2>
      <p className="help" style={{ marginTop: 0 }}>
        Suggested tags below. Adjust or untick any, then apply. "General" cards stay untagged so they
        remain reusable across characters.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {rows.map(({ card, suggested, apply }) => (
          <div
            key={card.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: apply ? 'var(--bg-card)' : 'var(--bg)',
              border: `1px solid ${apply ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 12px', opacity: apply ? 1 : 0.55,
            }}
          >
            <button
              onClick={() => setRow(card.id, { apply: !apply })}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                border: `2px solid ${apply ? 'var(--accent)' : 'var(--border)'}`,
                background: apply ? 'var(--accent)' : 'transparent',
                color: '#1a1714', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >{apply ? '✓' : ''}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {card.name}
              </div>
              {(card.tags || []).length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>has: {card.tags.join(', ')}</div>
              )}
            </div>
            <select
              value={suggested}
              onChange={(e) => setRow(card.id, { suggested: e.target.value, apply: e.target.value !== 'General' })}
              style={{ marginTop: 0, width: 'auto', maxWidth: 140, fontSize: 13, padding: '6px 8px' }}
            >
              <option value="General">General</option>
              {state.tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        ))}
      </div>

      {usage && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 12 }}>
          ~{usage.input_tokens?.toLocaleString()} input · ~{usage.output_tokens?.toLocaleString()} output tokens
        </div>
      )}

      <button
        className="btn btn-primary btn-block"
        disabled={applyCount === 0 || phase === 'saving'}
        style={{ opacity: applyCount === 0 || phase === 'saving' ? 0.5 : 1 }}
        onClick={handleApply}
      >
        {phase === 'saving' ? 'Applying…' : `Apply ${applyCount} Tag${applyCount !== 1 ? 's' : ''}`}
      </button>
      <button className="btn btn-block" style={{ marginTop: 8 }} onClick={onClose} disabled={phase === 'saving'}>
        Cancel
      </button>
    </div>
  );
}
