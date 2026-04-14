import React, { useState, useMemo } from 'react';
import { useApp } from '../context';
import LinkedText from './LinkedText';
import CardEditor from './CardEditor';
import { computeReverseLinks } from '../linking';

export default function CardDetail() {
  const { state, dispatch, saveCard, removeCard, navigateToCard } = useApp();
  const card = state.cards.find((c) => c.id === state.selectedCardId);
  const [tagOpen, setTagOpen] = useState(false);

  const reverseLinks = useMemo(() => {
    if (!card) return [];
    return computeReverseLinks(card.id, state.cards);
  }, [card, state.cards]);

  if (!card) {
    dispatch({ type: 'DESELECT_CARD' });
    return null;
  }

  const profile = state.profiles.find((p) => p.id === card.profileId);
  const color = profile?.color || '#7d8590';
  const sections = [...(card.sections || [])].sort((a, b) => (a.priority || 99) - (b.priority || 99));

  // Editing mode
  if (state.editingCardId === card.id) {
    return (
      <div className="section fade-in">
        <button className="back-btn" onClick={() => dispatch({ type: 'STOP_EDITING' })}>← Cancel</button>
        <CardEditor
          card={card}
          onSave={async (draft) => {
            await saveCard({ ...card, ...draft });
            dispatch({ type: 'STOP_EDITING' });
          }}
          onCancel={() => dispatch({ type: 'STOP_EDITING' })}
        />
      </div>
    );
  }

  async function toggleTag(name) {
    const tags = card.tags || [];
    const updated = tags.includes(name) ? tags.filter((t) => t !== name) : [...tags, name];
    await saveCard({ ...card, tags: updated });
  }

  return (
    <div className="section fade-in">
      <button className="back-btn" onClick={() => dispatch({ type: 'DESELECT_CARD' })}>← Back</button>

      <div className="detail-card" style={{ borderTop: `3px solid ${color}` }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <h2>{card.name}</h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: 'EDIT_CARD', id: card.id })}>✎ Edit</button>
            {profile && (
              <span className="type-badge" style={{ background: color + '22', color, border: `1px solid ${color}55` }}>
                {profile.icon} {profile.name}
              </span>
            )}
          </div>
        </div>

        {/* Sections */}
        {sections.map((sec, i) => {
          const hasContent = sec.content || (sec.keyValues && Object.keys(sec.keyValues).length);
          if (!hasContent) return null;
          return sec.priority <= 2
            ? <ExpandedSection key={i} sec={sec} />
            : <CollapsibleSection key={i} sec={sec} />;
        })}

        {/* Source */}
        {card.source && (
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)' }}>Source: {card.source}</div>
        )}

        {/* Reverse links */}
        {reverseLinks.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 8 }}>
              Linked from — opens in library
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {reverseLinks.map((ref, i) => (
                <button
                  key={i}
                  className="card-preview"
                  style={{ padding: '8px 12px' }}
                  onClick={() => navigateToCard(ref.cardId, true)}
                >
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{ref.cardName}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 6 }}>in {ref.sectionName}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Tags</span>
            <button className="btn btn-primary btn-sm" onClick={() => setTagOpen(!tagOpen)}>
              {tagOpen ? 'Done' : '+ Tag'}
            </button>
          </div>
          {tagOpen && state.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {state.tags.map((name) => {
                const active = (card.tags || []).includes(name);
                return (
                  <button
                    key={name}
                    className="btn btn-sm"
                    style={{
                      background: active ? 'var(--accent-glow)' : 'var(--surface)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      color: active ? 'var(--accent)' : 'var(--text-mid)',
                    }}
                    onClick={() => toggleTag(name)}
                  >{active ? '✓ ' : ''}{name}</button>
                );
              })}
            </div>
          )}
          {tagOpen && state.tags.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>No tags yet — add one in the Tags tab.</p>
          )}
          {!tagOpen && card.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {card.tags.map((t) => <span key={t} className="char-tag">{t}</span>)}
            </div>
          )}
          {!tagOpen && !card.tags?.length && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>No tags assigned.</p>
          )}
        </div>

        {/* Delete */}
        <button
          className="btn btn-danger btn-block"
          style={{ marginTop: 20 }}
          onClick={() => { if (confirm(`Delete "${card.name}"?`)) removeCard(card.id); }}
        >Delete Card</button>
      </div>
    </div>
  );
}

function ExpandedSection({ sec }) {
  return (
    <div style={{ marginTop: 12 }}>
      {sec.type === 'key-value' && sec.keyValues ? (
        <div className="stat-grid" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          {Object.entries(sec.keyValues).map(([k, v]) => (
            <div key={k}>
              <span className="stat-label">{k}</span><br />
              <LinkedText text={String(v)} />
            </div>
          ))}
        </div>
      ) : sec.content ? (
        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
          <LinkedText text={sec.content} />
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleSection({ sec }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="section-collapse">
      <div className="section-collapse-header" onClick={() => setOpen(!open)}>
        <h4>{sec.name}</h4>
        <span className={'arrow' + (open ? ' open' : '')}>▸</span>
      </div>
      <div className={'section-collapse-body ' + (open ? 'expanded' : 'collapsed')}>
        {sec.type === 'key-value' && sec.keyValues ? (
          <div className="stat-grid">
            {Object.entries(sec.keyValues).map(([k, v]) => (
              <div key={k}>
                <span className="stat-label">{k}</span><br />
                <LinkedText text={String(v)} />
              </div>
            ))}
          </div>
        ) : sec.content ? (
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', paddingBottom: 8 }}>
            <LinkedText text={sec.content} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
