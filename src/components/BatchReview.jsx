import React, { useState } from 'react';

export default function BatchReview({ cards, profileId, onSave, onCancel, usage }) {
  const [selected, setSelected] = useState(() => new Set(cards.map((c) => c.id)));
  const [saving, setSaving] = useState(false);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === cards.length ? new Set() : new Set(cards.map((c) => c.id))
    );
  }

  async function handleSave() {
    setSaving(true);
    await onSave(cards.filter((c) => selected.has(c.id)));
  }

  const count = selected.size;

  return (
    <div className="section fade-in">
      <h2 className="section-title">Review Cards</h2>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          {cards.length} card{cards.length !== 1 ? 's' : ''} found
        </span>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', padding: '4px 0', minHeight: 44, display: 'flex', alignItems: 'center' }}
          onClick={toggleAll}
        >
          {selected.size === cards.length ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {cards.map((card) => {
          const checked = selected.has(card.id);
          return (
            <button
              key={card.id}
              onClick={() => toggle(card.id)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                background: checked ? 'var(--bg-card)' : 'var(--bg)',
                border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10, padding: '12px 14px',
                textAlign: 'left', cursor: 'pointer', width: '100%',
                opacity: checked ? 1 : 0.5,
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                background: checked ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, color: '#1a1714', fontWeight: 700,
              }}>
                {checked ? '✓' : ''}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 3 }}>
                  {card.name}
                </div>
                {card.summary && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 }}>{card.summary}</div>
                )}
                {card.tags?.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {card.tags.map((t) => (
                      <span key={t} style={{ fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-dim)' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {usage && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 12 }}>
          ~{usage.input_tokens?.toLocaleString()} input · ~{usage.output_tokens?.toLocaleString()} output tokens
        </div>
      )}

      <button
        className="btn-primary"
        style={{ width: '100%', marginBottom: 10, fontWeight: 700, fontSize: 16, minHeight: 48, opacity: count === 0 || saving ? 0.5 : 1 }}
        disabled={count === 0 || saving}
        onClick={handleSave}
      >
        {saving ? 'Saving...' : `Save ${count} Card${count !== 1 ? 's' : ''}`}
      </button>

      <button
        className="btn"
        style={{ width: '100%', minHeight: 44 }}
        onClick={onCancel}
        disabled={saving}
      >
        Cancel
      </button>
    </div>
  );
}
