import React, { useState } from 'react';
import { useApp } from '../context';

export default function Tags() {
  const { state, addTag, removeTag } = useApp();
  const [input, setInput] = useState('');

  async function handleAdd() {
    const name = input.trim();
    if (name && !state.tags.includes(name)) {
      await addTag(name);
      setInput('');
    }
  }

  return (
    <div className="section fade-in">
      <h2 className="section-title">Tags</h2>
      <p className="section-desc">
        Create tags for characters, games, categories — anything you want to group cards by.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="New tag..."
          value={input}
          style={{ flex: 1 }}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button className="btn btn-primary" onClick={handleAdd}>Add</button>
      </div>

      {state.tags.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🏷</div>
          <div className="sub">No tags yet. Add one above!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.tags.map((name) => {
            const cnt = state.cards.filter((c) => (c.tags || []).includes(name)).length;
            return (
              <div key={name} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px',
              }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text)' }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{cnt} card{cnt !== 1 ? 's' : ''}</div>
                </div>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}
                  onClick={() => { if (confirm(`Remove "${name}"?`)) removeTag(name); }}
                >×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
