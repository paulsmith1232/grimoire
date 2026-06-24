import React, { useState } from 'react';
import { useApp } from '../context';
import { stripLinks } from '../linking';

const COL_ICONS = { 1: '▤', 2: '▦', 3: '⊞' };

export default function Library() {
  const { state, dispatch, navigateToCard } = useApp();
  const { cards, profiles, tags, filterProfile, filterTag, searchQuery } = state;
  const [cols, setCols] = useState(1);

  const usedProfiles = [...new Set(cards.map((c) => c.profileId).filter(Boolean))];

  const filtered = cards.filter((c) => {
    if (filterProfile === '_none' && c.profileId) return false;
    if (filterProfile !== 'all' && filterProfile !== '_none' && c.profileId !== filterProfile) return false;
    if (filterTag !== 'all' && !(c.tags || []).includes(filterTag)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = c.name?.toLowerCase().includes(q);
      const textMatch = (c.sections || []).some((s) => {
        const content = stripLinks(s.content || '');
        const kvText = s.keyValues ? Object.values(s.keyValues).join(' ') : '';
        return content.toLowerCase().includes(q) || kvText.toLowerCase().includes(q);
      });
      if (!nameMatch && !textMatch) return false;
    }
    return true;
  });

  function getProfile(id) {
    return profiles.find((p) => p.id === id);
  }

  function getPreviewMeta(card) {
    const s = (card.sections || []).find((s) => s.type === 'key-value' && s.keyValues);
    if (!s) return '';
    return Object.entries(s.keyValues).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ');
  }

  function getPreviewText(card) {
    const s = (card.sections || []).find((s) => s.type === 'text' && s.content);
    return s ? stripLinks(s.content) : '';
  }

  function cycleView() {
    setCols((c) => (c % 3) + 1);
  }

  return (
    <div className="section fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <input
          type="search"
          placeholder="Search cards..."
          value={searchQuery}
          style={{ flex: 1, marginTop: 0 }}
          onChange={(e) => dispatch({ type: 'SET_SEARCH', value: e.target.value })}
        />
        <button
          className="btn btn-secondary btn-sm"
          style={{ flexShrink: 0, fontSize: 16, padding: '6px 10px' }}
          title={`Switch to ${cols === 3 ? '1' : cols + 1}-column view`}
          onClick={cycleView}
        >{COL_ICONS[cols]}</button>
      </div>

      {/* Profile filter pills */}
      <div className="pills" style={{ marginTop: 10 }}>
        <button
          className={'pill' + (filterProfile === 'all' ? ' active' : '')}
          onClick={() => dispatch({ type: 'SET_FILTER_PROFILE', value: 'all' })}
        >All</button>
        {profiles.map((p) =>
          (usedProfiles.includes(p.id) || filterProfile === p.id) ? (
            <button
              key={p.id}
              className={'pill' + (filterProfile === p.id ? ' active' : '')}
              onClick={() => dispatch({ type: 'SET_FILTER_PROFILE', value: p.id })}
            >{p.icon} {p.name}</button>
          ) : null
        )}
        {cards.some((c) => !c.profileId) && (
          <button
            className={'pill' + (filterProfile === '_none' ? ' active' : '')}
            onClick={() => dispatch({ type: 'SET_FILTER_PROFILE', value: '_none' })}
          >• Unlinked</button>
        )}
      </div>

      {/* Tag filter pills */}
      {tags.length > 0 && (
        <div className="pills" style={{ marginTop: 6 }}>
          <button
            className={'pill' + (filterTag === 'all' ? ' active' : '')}
            onClick={() => dispatch({ type: 'SET_FILTER_TAG', value: 'all' })}
          >All Tags</button>
          {tags.map((name) => (
            <button
              key={name}
              className={'pill' + (filterTag === name ? ' active' : '')}
              onClick={() => dispatch({ type: 'SET_FILTER_TAG', value: name })}
            >🏷 {name}</button>
          ))}
        </div>
      )}

      {/* Card grid/list */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📖</div>
          <div className="title">{cards.length === 0 ? 'Your grimoire is empty' : 'No cards match'}</div>
          <div className="sub">{cards.length === 0 ? 'Scan a page to get started' : 'Try adjusting your filters'}</div>
        </div>
      ) : cols === 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {filtered.map((card) => {
            const profile = getProfile(card.profileId);
            const color = profile?.color || '#7d8590';
            const meta = getPreviewMeta(card);
            const desc = getPreviewText(card);
            return (
              <button
                key={card.id}
                className="card-preview"
                style={{ borderLeft: `3px solid ${color}` }}
                onClick={() => navigateToCard(card.id, true)}
              >
                <div className="card-preview-header">
                  <h3>
                    {card.name}
                    {!card.summary && <span title="No summary — re-scan to generate" style={{ marginLeft: 5, fontSize: 8, color: 'var(--text-dim, #555)', verticalAlign: 'middle' }}>●</span>}
                  </h3>
                  {profile && (
                    <span className="type-badge sm" style={{ background: color + '22', color, border: `1px solid ${color}55` }}>
                      {profile.icon} {profile.name}
                    </span>
                  )}
                </div>
                {meta && <div className="meta">{meta}</div>}
                {desc && <div className="desc">{desc}</div>}
                {card.tags?.length > 0 && (
                  <div className="tags">
                    {card.tags.map((t) => <span key={t} className="char-tag">{t}</span>)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : cols === 2 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 14 }}>
          {filtered.map((card) => {
            const profile = getProfile(card.profileId);
            const color = profile?.color || '#7d8590';
            return (
              <button
                key={card.id}
                className="card-preview"
                style={{ borderLeft: `3px solid ${color}`, padding: '8px 10px' }}
                onClick={() => navigateToCard(card.id, true)}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, textAlign: 'left' }}>
                  {card.name}
                </div>
                {profile && (
                  <div style={{ fontSize: 10, color, marginTop: 3 }}>{profile.icon} {profile.name}</div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginTop: 14 }}>
          {filtered.map((card) => {
            const profile = getProfile(card.profileId);
            const color = profile?.color || '#7d8590';
            const text = getPreviewText(card);
            return (
              <button
                key={card.id}
                className="card-preview"
                style={{ borderLeft: `3px solid ${color}`, padding: '7px 8px' }}
                onClick={() => navigateToCard(card.id, true)}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, textAlign: 'left', marginBottom: text ? 3 : 0 }}>
                  {card.name}
                </div>
                {text && (
                  <div style={{
                    fontSize: 10, color: 'var(--text-mid)', lineHeight: 1.4, textAlign: 'left',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>{text}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
