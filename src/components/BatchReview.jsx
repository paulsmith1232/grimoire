import React, { useState } from 'react';

export default function BatchReview({ newCards, updateItems, onSave, onCancel, usage }) {
  const [selectedNew, setSelectedNew] = useState(() => new Set(newCards.map((c) => c.id)));
  const [selectedUpdates, setSelectedUpdates] = useState(() => new Set(updateItems.map((u) => u.incomingCard.id)));
  const [saving, setSaving] = useState(false);

  function toggleNew(id) {
    setSelectedNew((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleUpdate(id) {
    setSelectedUpdates((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleSave() {
    setSaving(true);
    await onSave({
      newCards: newCards.filter((c) => selectedNew.has(c.id)),
      updates: updateItems.filter((u) => selectedUpdates.has(u.incomingCard.id)),
    });
  }

  const totalCount = selectedNew.size + selectedUpdates.size;

  return (
    <div className="section fade-in">
      <h2 className="section-title">Review Cards</h2>

      {newCards.length > 0 && (
        <>
          <SectionHeader
            label="New Cards"
            count={newCards.length}
            selected={selectedNew.size}
            onToggleAll={() => setSelectedNew(
              selectedNew.size === newCards.length ? new Set() : new Set(newCards.map((c) => c.id))
            )}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {newCards.map((card) => {
              const checked = selectedNew.has(card.id);
              return (
                <CardRow key={card.id} checked={checked} onClick={() => toggleNew(card.id)}>
                  <div style={nameStyle}>{card.name}</div>
                  {card.summary && <div style={summaryStyle}>{card.summary}</div>}
                  <TagChips tags={card.tags} />
                </CardRow>
              );
            })}
          </div>
        </>
      )}

      {updateItems.length > 0 && (
        <>
          <SectionHeader
            label="Updates to Existing Cards"
            count={updateItems.length}
            selected={selectedUpdates.size}
            onToggleAll={() => setSelectedUpdates(
              selectedUpdates.size === updateItems.length ? new Set() : new Set(updateItems.map((u) => u.incomingCard.id))
            )}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {updateItems.map(({ incomingCard, existingCard }) => {
              const checked = selectedUpdates.has(incomingCard.id);
              const newSections = (incomingCard.sections || []).filter((s) => s.content || s.keyValues);
              return (
                <CardRow key={incomingCard.id} checked={checked} onClick={() => toggleUpdate(incomingCard.id)}>
                  <div style={nameStyle}>{existingCard.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>
                    {newSections.length > 0
                      ? `Adding: ${newSections.map((s) => s.name).join(', ')}`
                      : 'No new sections — skip recommended'}
                  </div>
                  {incomingCard.summary && !existingCard.summary && (
                    <div style={summaryStyle}>+ summary: {incomingCard.summary}</div>
                  )}
                </CardRow>
              );
            })}
          </div>
        </>
      )}

      {usage && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 12 }}>
          ~{usage.input_tokens?.toLocaleString()} input · ~{usage.output_tokens?.toLocaleString()} output tokens
        </div>
      )}

      <button
        className="btn-primary"
        style={{ width: '100%', marginBottom: 10, fontWeight: 700, fontSize: 16, minHeight: 48, opacity: totalCount === 0 || saving ? 0.5 : 1 }}
        disabled={totalCount === 0 || saving}
        onClick={handleSave}
      >
        {saving ? 'Saving...' : `Save ${totalCount} Card${totalCount !== 1 ? 's' : ''}`}
      </button>

      <button className="btn" style={{ width: '100%', minHeight: 44 }} onClick={onCancel} disabled={saving}>
        Cancel
      </button>
    </div>
  );
}

function SectionHeader({ label, count, selected, onToggleAll }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label} ({count})
      </span>
      <button
        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}
        onClick={onToggleAll}
      >
        {selected === count ? 'Deselect all' : 'Select all'}
      </button>
    </div>
  );
}

function CardRow({ checked, onClick, children }) {
  return (
    <button
      onClick={onClick}
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
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </button>
  );
}

function TagChips({ tags }) {
  if (!tags?.length) return null;
  return (
    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {tags.map((t) => (
        <span key={t} style={{ fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-dim)' }}>
          {t}
        </span>
      ))}
    </div>
  );
}

const nameStyle = { fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 3 };
const summaryStyle = { fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 };
