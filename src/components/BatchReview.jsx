import React, { useState } from 'react';

// For each update card, track per-section decisions: 'keep' | 'replace' | 'append'
function initSectionChoices(updateItems) {
  const choices = {};
  for (const { incomingCard, existingCard } of updateItems) {
    choices[incomingCard.id] = {};
    for (const sec of incomingCard.sections || []) {
      const exists = (existingCard.sections || []).find((s) => s.name === sec.name);
      choices[incomingCard.id][sec.name] = exists ? 'append' : 'replace';
    }
  }
  return choices;
}

export default function BatchReview({ newCards, updateItems, onSave, onCancel, usage }) {
  const [selectedNew, setSelectedNew] = useState(() => new Set(newCards.map((c) => c.id)));
  const [selectedUpdates, setSelectedUpdates] = useState(() => new Set(updateItems.map((u) => u.incomingCard.id)));
  const [sectionChoices, setSectionChoices] = useState(() => initSectionChoices(updateItems));
  const [saving, setSaving] = useState(false);

  function toggleNew(id) {
    setSelectedNew((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleUpdate(id) {
    setSelectedUpdates((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function setChoice(cardId, secName, choice) {
    setSectionChoices((prev) => ({
      ...prev,
      [cardId]: { ...prev[cardId], [secName]: choice },
    }));
  }

  async function handleSave() {
    setSaving(true);
    await onSave({
      newCards: newCards.filter((c) => selectedNew.has(c.id)),
      updates: updateItems
        .filter((u) => selectedUpdates.has(u.incomingCard.id))
        .map(({ incomingCard, existingCard }) => ({
          existingCard,
          incomingCard,
          sectionChoices: sectionChoices[incomingCard.id] || {},
        })),
    });
  }

  const totalCount = selectedNew.size + selectedUpdates.size;

  return (
    <div className="section fade-in">
      <h2 className="section-title">Review Cards</h2>

      {/* New cards */}
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
                <button
                  key={card.id}
                  onClick={() => toggleNew(card.id)}
                  style={cardRowStyle(checked)}
                >
                  <Checkbox checked={checked} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={cardNameStyle}>{card.name}</div>
                    {card.summary && <div style={summaryStyle}>{card.summary}</div>}
                    <TagChips tags={card.tags} />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Updates to existing cards */}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {updateItems.map(({ incomingCard, existingCard }) => {
              const checked = selectedUpdates.has(incomingCard.id);
              const choices = sectionChoices[incomingCard.id] || {};
              return (
                <div
                  key={incomingCard.id}
                  style={{
                    border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 10, overflow: 'hidden',
                    opacity: checked ? 1 : 0.5,
                  }}
                >
                  {/* Header row — tap to toggle include/skip */}
                  <button
                    onClick={() => toggleUpdate(incomingCard.id)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', background: checked ? 'var(--bg-card)' : 'var(--bg)', padding: '12px 14px', textAlign: 'left', cursor: 'pointer', border: 'none' }}
                  >
                    <Checkbox checked={checked} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...cardNameStyle, marginBottom: 2 }}>{existingCard.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Updating existing card</div>
                    </div>
                  </button>

                  {/* Per-section merge choices */}
                  {checked && (incomingCard.sections || []).map((sec) => {
                    const hasExisting = (existingCard.sections || []).some((s) => s.name === sec.name);
                    const choice = choices[sec.name] || (hasExisting ? 'append' : 'replace');
                    return (
                      <div key={sec.name} style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', background: 'var(--bg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{sec.name}</span>
                          {hasExisting && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              {['append', 'replace', 'keep'].map((opt) => (
                                <button
                                  key={opt}
                                  onClick={() => setChoice(incomingCard.id, sec.name, opt)}
                                  style={{
                                    fontSize: 10, padding: '3px 7px', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
                                    background: choice === opt ? 'var(--accent)' : 'var(--surface)',
                                    color: choice === opt ? '#1a1714' : 'var(--text-dim)',
                                    border: `1px solid ${choice === opt ? 'var(--accent)' : 'var(--border)'}`,
                                  }}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                          {!hasExisting && (
                            <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>new section</span>
                          )}
                        </div>
                        {choice !== 'keep' && (
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>
                            {sec.content
                              ? sec.content.slice(0, 120) + (sec.content.length > 120 ? '…' : '')
                              : sec.keyValues
                                ? Object.entries(sec.keyValues).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')
                                : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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

// ── Shared small components ──

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

function Checkbox({ checked }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
      border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
      background: checked ? 'var(--accent)' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, color: '#1a1714', fontWeight: 700,
    }}>
      {checked ? '✓' : ''}
    </div>
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

const cardRowStyle = (checked) => ({
  display: 'flex', alignItems: 'flex-start', gap: 12,
  background: checked ? 'var(--bg-card)' : 'var(--bg)',
  border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 10, padding: '12px 14px',
  textAlign: 'left', cursor: 'pointer', width: '100%',
  opacity: checked ? 1 : 0.5,
});

const cardNameStyle = { fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 3 };
const summaryStyle = { fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 };
