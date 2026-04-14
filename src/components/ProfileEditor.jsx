import React, { useState, useEffect } from 'react';
import { useApp } from '../context';
import { PROFILE_COLORS, DND_PROFILE, genId } from '../db';
import { buildPrompt } from '../api';

export default function ProfileEditor() {
  const { state, dispatch, saveProfile, addProfile, removeProfile } = useApp();
  const profile = state.profiles.find((p) => p.id === state.editingProfileId);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (profile) {
      setDraft(JSON.parse(JSON.stringify(profile)));
    } else {
      dispatch({ type: 'STOP_EDITING_PROFILE' });
    }
  }, [profile?.id]);

  // Auto-save — must be before any early returns to satisfy Rules of Hooks
  useEffect(() => {
    if (!draft || !profile) return;
    const timer = setTimeout(() => saveProfile(draft), 500);
    return () => clearTimeout(timer);
  }, [draft]);

  if (!profile || !draft) return null;

  function update(fn) {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
  }

  async function duplicate() {
    const dup = { ...JSON.parse(JSON.stringify(draft)), id: genId(), name: draft.name + ' (copy)', builtIn: false };
    const np = await addProfile(dup);
    dispatch({ type: 'EDIT_PROFILE', id: np.id });
  }

  return (
    <div className="section fade-in">
      <button className="back-btn" onClick={() => dispatch({ type: 'STOP_EDITING_PROFILE' })}>← Back</button>
      <h2 className="section-title">Edit Profile</h2>

      {/* Name & Icon */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          value={draft.icon}
          style={{ width: 50, textAlign: 'center', fontSize: 18 }}
          onChange={(e) => update((d) => { d.icon = e.target.value; })}
        />
        <input
          type="text"
          value={draft.name}
          placeholder="Profile name..."
          style={{ flex: 1 }}
          onChange={(e) => update((d) => { d.name = e.target.value; })}
        />
      </div>

      {/* Color */}
      <div className="edit-field">
        <label>Color</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PROFILE_COLORS.map((c) => (
            <button
              key={c}
              style={{
                width: 30, height: 30, borderRadius: 6, background: c, cursor: 'pointer',
                border: draft.color === c ? '2px solid var(--text)' : '2px solid transparent',
              }}
              onClick={() => update((d) => { d.color = c; })}
            />
          ))}
        </div>
      </div>

      {/* Sections */}
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', margin: '16px 0 8px' }}>
        Sections (priority order)
      </label>

      {draft.sections.map((sec, i) => (
        <div key={i} className="section-edit-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {i > 0 && (
              <button style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                onClick={() => update((d) => {
                  [d.sections[i - 1], d.sections[i]] = [d.sections[i], d.sections[i - 1]];
                  d.sections.forEach((s, idx) => { s.priority = idx + 1; });
                })}>▲</button>
            )}
            {i < draft.sections.length - 1 && (
              <button style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                onClick={() => update((d) => {
                  [d.sections[i], d.sections[i + 1]] = [d.sections[i + 1], d.sections[i]];
                  d.sections.forEach((s, idx) => { s.priority = idx + 1; });
                })}>▼</button>
            )}
          </div>

          <div className="section-edit-info">
            <input
              type="text"
              value={sec.name}
              placeholder="Section name..."
              style={{ fontSize: 13, padding: '6px 8px', marginBottom: 4, width: '100%' }}
              onChange={(e) => update((d) => { d.sections[i].name = e.target.value; })}
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn btn-sm" style={{
                padding: '2px 8px', fontSize: 10,
                background: sec.type === 'text' ? 'var(--accent-glow)' : 'var(--surface)',
                border: `1px solid ${sec.type === 'text' ? 'var(--accent)' : 'var(--border)'}`,
                color: sec.type === 'text' ? 'var(--accent)' : 'var(--text-dim)',
              }} onClick={() => update((d) => { d.sections[i].type = 'text'; })}>📝 Text</button>
              <button className="btn btn-sm" style={{
                padding: '2px 8px', fontSize: 10,
                background: sec.type === 'key-value' ? 'var(--accent-glow)' : 'var(--surface)',
                border: `1px solid ${sec.type === 'key-value' ? 'var(--accent)' : 'var(--border)'}`,
                color: sec.type === 'key-value' ? 'var(--accent)' : 'var(--text-dim)',
              }} onClick={() => update((d) => { d.sections[i].type = 'key-value'; })}>📊 KV</button>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                P{i + 1}{i < 2 ? ' · expanded' : ' · collapsed'}
              </span>
            </div>
          </div>

          <button
            style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 16, cursor: 'pointer' }}
            onClick={() => update((d) => {
              d.sections.splice(i, 1);
              d.sections.forEach((s, idx) => { s.priority = idx + 1; });
            })}
          >×</button>
        </div>
      ))}

      <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }}
        onClick={() => update((d) => {
          d.sections.push({ name: '', type: 'text', priority: d.sections.length + 1 });
        })}>+ Add Section</button>

      {/* Additional Instructions */}
      <div className="edit-field" style={{ marginTop: 16 }}>
        <label>Additional Instructions</label>
        <textarea
          rows={4}
          value={draft.scanInstructions || ''}
          placeholder='Extra instructions appended to the assembled prompt. E.g.: "Prioritize practical gameplay tips over raw stat numbers."'
          onChange={(e) => update((d) => { d.scanInstructions = e.target.value; })}
        />
      </div>

      {/* Custom prompt toggle */}
      <div className="edit-field" style={{ marginTop: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={!!draft.useCustomPrompt}
            onChange={(e) => update((d) => { d.useCustomPrompt = e.target.checked; })}
          />
          Use custom prompt instead
        </label>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
          Replaces the assembled prompt entirely. The sections above are preserved so you can toggle back.
        </p>
      </div>

      {draft.useCustomPrompt ? (
        <div className="edit-field">
          <label>Custom Prompt</label>
          <textarea
            rows={8}
            value={draft.customPrompt || ''}
            placeholder="Enter the full prompt to send to the API when scanning with this profile..."
            onChange={(e) => update((d) => { d.customPrompt = e.target.value; })}
          />
        </div>
      ) : (
        <div className="edit-field">
          <label>Assembled Prompt Preview</label>
          <textarea
            rows={7}
            readOnly
            value={buildPrompt(draft)}
            style={{ opacity: 0.6, cursor: 'default', fontSize: 11, fontFamily: 'monospace', resize: 'none' }}
          />
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Read-only. This is the exact prompt sent to the API when scanning.
          </p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={duplicate}>Duplicate</button>
        {draft.builtIn ? (
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
            if (confirm('Revert to the default D&D 5e profile? All customisations will be lost.')) {
              const reverted = JSON.parse(JSON.stringify(DND_PROFILE));
              setDraft(reverted);
              saveProfile(reverted);
            }
          }}>Revert to Default</button>
        ) : (
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => {
            if (confirm(`Delete "${draft.name}"? Cards will keep their data but become unlinked.`)) {
              removeProfile(draft.id);
            }
          }}>Delete</button>
        )}
      </div>
    </div>
  );
}
