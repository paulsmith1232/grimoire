import React, { useState, useRef } from 'react';
import { useApp } from '../context';
import { insertLink } from '../linking';
import { genId } from '../db';

export default function CardEditor({ card, onSave, onCancel }) {
  const { state, addCard } = useApp();
  const [draft, setDraft] = useState(JSON.parse(JSON.stringify(card)));
  const [linkModal, setLinkModal] = useState(null); // { sectionIndex, start, end, selectedText }
  const [expandedSections, setExpandedSections] = useState(new Set());
  const textareaRefs = useRef({});

  function toggleExpand(i) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function updateDraft(fn) {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
  }

  function handleLinkSelection(sectionIndex) {
    const textarea = textareaRefs.current[sectionIndex];
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return; // no selection
    const selectedText = textarea.value.slice(start, end).trim();
    if (!selectedText) return;
    setLinkModal({ sectionIndex, start, end, selectedText });
  }

  function applyLink(targetCardId) {
    if (!linkModal) return;
    const { sectionIndex, start, end, selectedText } = linkModal;
    updateDraft((d) => {
      const sec = d.sections[sectionIndex];
      sec.content = insertLink(sec.content, start, end, targetCardId, selectedText);
    });
    setLinkModal(null);
  }

  async function createStubAndLink() {
    if (!linkModal) return;
    const stubCard = await addCard({
      name: linkModal.selectedText,
      profileId: draft.profileId || '',
      sections: [{ name: 'Description', type: 'text', content: '', priority: 1 }],
      tags: [],
    });
    applyLink(stubCard.id);
  }

  return (
    <div className="fade-in">
      {/* Name */}
      <div className="edit-field">
        <label>Name</label>
        <input
          type="text"
          value={draft.name || ''}
          placeholder="Card name..."
          onChange={(e) => updateDraft((d) => { d.name = e.target.value; })}
        />
      </div>

      {/* Profile */}
      <div className="edit-field">
        <label>Profile</label>
        <select
          value={draft.profileId || ''}
          onChange={(e) => updateDraft((d) => { d.profileId = e.target.value; })}
        >
          <option value="">— No profile —</option>
          {state.profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
          ))}
        </select>
      </div>

      {/* Source */}
      <div className="edit-field">
        <label>Source</label>
        <input
          type="text"
          value={draft.source || ''}
          placeholder="Source material..."
          onChange={(e) => updateDraft((d) => { d.source = e.target.value; })}
        />
      </div>

      {/* Sections */}
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', margin: '8px 0' }}>
        Sections
      </label>

      {draft.sections.map((sec, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
          {/* Section header */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            {i > 0 && (
              <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => {
                updateDraft((d) => {
                  [d.sections[i - 1], d.sections[i]] = [d.sections[i], d.sections[i - 1]];
                  d.sections.forEach((s, idx) => { s.priority = idx + 1; });
                });
              }}>↑</button>
            )}
            {i < draft.sections.length - 1 && (
              <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => {
                updateDraft((d) => {
                  [d.sections[i], d.sections[i + 1]] = [d.sections[i + 1], d.sections[i]];
                  d.sections.forEach((s, idx) => { s.priority = idx + 1; });
                });
              }}>↓</button>
            )}
            <input
              type="text"
              value={sec.name}
              placeholder="Section name..."
              style={{ flex: 1 }}
              onChange={(e) => updateDraft((d) => { d.sections[i].name = e.target.value; })}
            />
            <button className="btn btn-secondary btn-sm" onClick={() => {
              updateDraft((d) => {
                d.sections[i].type = d.sections[i].type === 'text' ? 'key-value' : 'text';
                if (d.sections[i].type === 'key-value' && !d.sections[i].keyValues) d.sections[i].keyValues = {};
                if (d.sections[i].type === 'text' && !d.sections[i].content) d.sections[i].content = '';
              });
            }}>{sec.type === 'text' ? '📝 Text' : '📊 KV'}</button>
            <button
              style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}
              onClick={() => updateDraft((d) => {
                d.sections.splice(i, 1);
                d.sections.forEach((s, idx) => { s.priority = idx + 1; });
              })}
            >×</button>
          </div>

          {/* Section content */}
          {sec.type === 'text' ? (
            <div>
              <textarea
                ref={(el) => { textareaRefs.current[i] = el; }}
                rows={expandedSections.has(i) ? 12 : 3}
                value={sec.content || ''}
                placeholder="Section content... Select text and tap 🔗 to link"
                onChange={(e) => updateDraft((d) => { d.sections[i].content = e.target.value; })}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleLinkSelection(i)}
                  title="Select text above, then tap to create a link"
                >🔗 Link</button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggleExpand(i)}
                  title={expandedSections.has(i) ? 'Collapse section' : 'Expand section'}
                >{expandedSections.has(i) ? '↕ Collapse' : '↕ Expand'}</button>
              </div>
            </div>
          ) : (
            <KeyValueEditor
              keyValues={sec.keyValues || {}}
              onChange={(kv) => updateDraft((d) => { d.sections[i].keyValues = kv; })}
            />
          )}

          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
            Priority {i + 1}{i < 2 ? ' — shown expanded' : ' — collapsed'}
          </div>
        </div>
      ))}

      <button className="btn btn-secondary btn-sm" onClick={() => {
        updateDraft((d) => {
          d.sections.push({ name: '', type: 'text', content: '', priority: d.sections.length + 1 });
        });
      }}>+ Add Section</button>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onSave(draft)}>Save</button>
      </div>

      {/* Link assignment modal */}
      {linkModal && (
        <LinkModal
          selectedText={linkModal.selectedText}
          cards={state.cards.filter((c) => c.id !== draft.id)}
          onSelect={applyLink}
          onCreateStub={createStubAndLink}
          onClose={() => setLinkModal(null)}
        />
      )}
    </div>
  );
}

function KeyValueEditor({ keyValues, onChange }) {
  const entries = Object.entries(keyValues);

  function update(fn) {
    const next = { ...keyValues };
    fn(next);
    onChange(next);
  }

  return (
    <div>
      {entries.map(([key, val], i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <input
            type="text"
            value={key}
            placeholder="Key"
            style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
            onChange={(e) => {
              const newKey = e.target.value;
              const newKv = {};
              for (const [k, v] of Object.entries(keyValues)) {
                newKv[k === key ? newKey : k] = v;
              }
              onChange(newKv);
            }}
          />
          <input
            type="text"
            value={val}
            placeholder="Value"
            style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
            onChange={(e) => update((kv) => { kv[key] = e.target.value; })}
          />
          <button
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}
            onClick={() => update((kv) => { delete kv[key]; })}
          >×</button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" style={{ marginTop: 4 }} onClick={() => update((kv) => { kv[''] = ''; })}>
        + Add
      </button>
    </div>
  );
}

function LinkModal({ selectedText, cards, onSelect, onCreateStub, onClose }) {
  const [search, setSearch] = useState('');

  const filtered = cards.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '70vh', display: 'flex', flexDirection: 'column', padding: '16px 16px 0',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Link "{selectedText}"</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Choose a card to link to</div>
          </div>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer' }} onClick={onClose}>×</button>
        </div>

        <input
          type="search"
          placeholder="Search cards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 8 }}
          autoFocus
        />

        <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 16 }}>
          {/* Create stub option */}
          <button
            className="card-preview"
            style={{ marginBottom: 6, borderLeft: '3px solid var(--accent)' }}
            onClick={onCreateStub}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>✨</span>
              <div>
                <h3 style={{ fontSize: 14 }}>Create new card: "{selectedText}"</h3>
                <div className="meta">Creates a stub card you can fill in later</div>
              </div>
            </div>
          </button>

          {filtered.map((card) => (
            <button
              key={card.id}
              className="card-preview"
              style={{ marginBottom: 4 }}
              onClick={() => onSelect(card.id)}
            >
              <h3 style={{ fontSize: 14 }}>{card.name}</h3>
            </button>
          ))}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>
              No cards match. Use the create option above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
