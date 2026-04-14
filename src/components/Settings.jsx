import React, { useRef } from 'react';
import { useApp } from '../context';
import { exportToJSON, importFromJSON, createBackup, DND_PROFILE } from '../db';
import db from '../db';

export default function Settings() {
  const { state, setApiKey, reloadAll } = useApp();
  const fileRef = useRef(null);

  function handleExport() {
    const json = exportToJSON(state.cards, state.profiles, state.tags);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grimoire-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importFromJSON(text);
      await reloadAll();
      alert(`Imported ${result.cardCount} cards, ${result.profileCount} profiles.`);
    } catch {
      alert('Invalid backup file.');
    }
  }

  async function handleBackup() {
    await createBackup();
    alert('Backup saved to IndexedDB.');
  }

  async function handleClearAll() {
    if (!confirm('Delete ALL data? This cannot be undone.')) return;
    await db.cards.clear();
    await db.profiles.clear();
    await db.tags.clear();
    await db.profiles.put({ ...DND_PROFILE });
    await reloadAll();
  }

  return (
    <div className="section fade-in">
      <h2 className="section-title">Settings</h2>

      {/* API Key */}
      <div className="setting-group">
        <label>Anthropic API Key</label>
        <input
          type="password"
          placeholder="sk-ant-..."
          value={state.apiKey}
          onChange={(e) => setApiKey(e.target.value.trim())}
        />
        <div style={{ marginTop: 8 }}>
          <span className={'api-status ' + (state.apiKey ? 'ok' : 'missing')}>
            {state.apiKey ? '✓ Key saved' : '✗ No key set'}
          </span>
        </div>
        <p className="help">Required for scanning. Get a key at console.anthropic.com. Stored locally in IndexedDB.</p>
      </div>

      {/* Stats */}
      <div className="setting-group">
        <label>Library Stats</label>
        <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.8 }}>
          Total cards: {state.cards.length}<br />
          Profiles: {state.profiles.length}<br />
          Tags: {state.tags.length}
        </div>
      </div>

      {/* Data Management */}
      <div className="setting-group">
        <label>Data Management</label>
        <p className="help" style={{ marginBottom: 10, marginTop: 0 }}>
          Your data is stored in IndexedDB (more durable than localStorage). Auto-backups are saved every 10 changes. Export regularly for extra safety.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>Export JSON</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>Import JSON</button>
          <button className="btn btn-secondary btn-sm" onClick={handleBackup}>Backup Now</button>
          <button className="btn btn-sm" style={{ background: 'none', border: '1px solid #c25e5e55', color: 'var(--danger)' }} onClick={handleClearAll}>
            Clear All
          </button>
        </div>
      </div>

      {/* About */}
      <div className="setting-group">
        <label>About</label>
        <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6 }}>
          Grimoire v5.0<br />
          React + IndexedDB. Card linking & knowledge graph.<br />
          Build your personal reference library.
        </div>
      </div>
    </div>
  );
}
