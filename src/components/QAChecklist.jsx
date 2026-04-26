import React, { useState, useRef, useEffect } from 'react';

function AutoTextarea({ defaultValue, onChange, placeholder }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) resizeTextarea(ref.current);
  }, []);

  function resizeTextarea(el) {
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const maxHeight = lineHeight * 6;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function handleInput(e) {
    resizeTextarea(e.target);
    onChange(e.target.value);
  }

  return (
    <textarea
      ref={ref}
      defaultValue={defaultValue}
      onInput={handleInput}
      placeholder={placeholder}
      style={{
        fontSize: 16,
        minHeight: 48,
        resize: 'none',
        overflowY: 'hidden',
        lineHeight: '1.5',
        width: '100%',
      }}
    />
  );
}

export default function QAChecklist({ checklist, qaState, onStateChange, onReset }) {
  const [expanded, setExpanded] = useState(false);
  const [openNotes, setOpenNotes] = useState({});
  const [toast, setToast] = useState('');
  const [resetKey, setResetKey] = useState(0);

  const itemStates = qaState?.itemStates || {};
  const generalNotes = qaState?.generalNotes || '';

  const checkedCount = checklist.items.filter((item) => itemStates[item.id]?.checked).length;
  const total = checklist.items.length;

  function getItemState(itemId) {
    return itemStates[itemId] || { checked: false, note: '' };
  }

  function handleToggleCheck(itemId) {
    const current = getItemState(itemId);
    const newItemStates = {
      ...itemStates,
      [itemId]: { ...current, checked: !current.checked },
    };
    onStateChange(checklist.id, { itemStates: newItemStates, generalNotes });
  }

  function handleNoteChange(itemId, note) {
    const current = getItemState(itemId);
    const newItemStates = {
      ...itemStates,
      [itemId]: { ...current, note },
    };
    onStateChange(checklist.id, { itemStates: newItemStates, generalNotes });
  }

  function handleGeneralNotesChange(notes) {
    onStateChange(checklist.id, { itemStates, generalNotes: notes });
  }

  function handleReset() {
    if (!confirm(`Reset all checks and notes for "${checklist.featureName}"?`)) return;
    setOpenNotes({});
    setResetKey((k) => k + 1);
    onReset(checklist.id);
  }

  async function handleExport() {
    const date = new Date().toLocaleDateString('en-CA');
    const lines = [];
    lines.push(`## QA Report: ${checklist.featureName}`);
    lines.push(`Tested: ${date}`);
    lines.push(`Implemented: ${checklist.implementedDate}`);
    lines.push('');
    lines.push('### Checklist');
    for (const item of checklist.items) {
      const s = getItemState(item.id);
      const mark = s.checked ? '[x]' : '[ ]';
      const suffix = s.checked ? '' : ' (not yet verified)';
      lines.push(`- ${mark} ${item.text}${suffix}`);
      if (s.note?.trim()) {
        lines.push(`  - Note: ${s.note.trim()}`);
      }
    }
    if (generalNotes.trim()) {
      lines.push('');
      lines.push('### General Notes');
      lines.push(generalNotes.trim());
    }
    const markdown = lines.join('\n');

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(markdown);
        showToast('Copied to clipboard');
        return;
      } catch {
        // fall through to legacy
      }
    }

    try {
      const el = document.createElement('textarea');
      el.value = markdown;
      el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      showToast(ok ? 'Copied to clipboard' : 'Copy failed — check clipboard permissions');
    } catch {
      showToast('Copy failed — check clipboard permissions');
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      marginBottom: 10,
      overflow: 'hidden',
    }}>
      {/* Header / toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '14px 16px',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          minHeight: 44,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            color: 'var(--text)',
            lineHeight: 1.2,
            marginBottom: 3,
          }}>
            {checklist.featureName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {checklist.implementedDate} · {checkedCount}/{total} checked
          </div>
        </div>
        <div style={{
          fontSize: 18,
          color: checkedCount === total && total > 0 ? 'var(--accent)' : 'var(--text-dim)',
          flexShrink: 0,
        }}>
          {expanded ? '▲' : '▼'}
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
          {/* Summary */}
          <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: 8 }}>
            {checklist.summary}
          </div>
          {checklist.deviations && (
            <div style={{
              fontSize: 12,
              color: 'var(--text-dim)',
              lineHeight: 1.4,
              marginBottom: 12,
              fontStyle: 'italic',
            }}>
              Deviations: {checklist.deviations}
            </div>
          )}

          {/* Checklist items */}
          <div style={{ marginBottom: 16 }}>
            {checklist.items.map((item) => {
              const s = getItemState(item.id);
              const noteOpen = !!openNotes[item.id];
              return (
                <div key={item.id} style={{ marginBottom: 6 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    minHeight: 44,
                  }}>
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleCheck(item.id)}
                      style={{
                        flexShrink: 0,
                        width: 26,
                        height: 26,
                        marginTop: 2,
                        borderRadius: 6,
                        border: s.checked
                          ? '2px solid var(--accent)'
                          : '2px solid var(--border)',
                        background: s.checked ? 'var(--accent)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {s.checked ? '✓' : ''}
                    </button>

                    {/* Item text */}
                    <div style={{
                      flex: 1,
                      fontSize: 14,
                      color: s.checked ? 'var(--text-mid)' : 'var(--text)',
                      lineHeight: 1.4,
                      paddingTop: 4,
                      textDecoration: s.checked ? 'line-through' : 'none',
                      opacity: s.checked ? 0.7 : 1,
                    }}>
                      {item.text}
                    </div>

                    {/* Note toggle */}
                    <button
                      onClick={() => setOpenNotes((n) => ({ ...n, [item.id]: !n[item.id] }))}
                      title="Add note"
                      style={{
                        flexShrink: 0,
                        width: 32,
                        height: 32,
                        marginTop: 0,
                        background: s.note?.trim()
                          ? 'var(--accent-glow)'
                          : 'transparent',
                        border: '1px solid ' + (s.note?.trim() ? 'var(--accent)' : 'var(--border)'),
                        borderRadius: 6,
                        color: s.note?.trim() ? 'var(--accent)' : 'var(--text-dim)',
                        cursor: 'pointer',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ✎
                    </button>
                  </div>

                  {/* Note textarea */}
                  {noteOpen && (
                    <div style={{ paddingLeft: 36, paddingTop: 6 }}>
                      <AutoTextarea
                        key={`${checklist.id}-note-${item.id}-${resetKey}`}
                        defaultValue={s.note || ''}
                        onChange={(val) => handleNoteChange(item.id, val)}
                        placeholder="Note a bug, question, or observation..."
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* General notes */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 6,
            }}>
              General Notes
            </div>
            <AutoTextarea
              key={`${checklist.id}-general-${resetKey}`}
              defaultValue={generalNotes}
              onChange={handleGeneralNotesChange}
              placeholder="Overall feedback, anything that doesn't fit a specific item..."
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleExport}
              style={{ minHeight: 44, flex: 1 }}
            >
              Export Report
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleReset}
              style={{ minHeight: 44 }}
            >
              Reset
            </button>
          </div>

          {/* Toast */}
          {toast && (
            <div style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'var(--accent-glow)',
              border: '1px solid var(--accent)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--accent)',
              textAlign: 'center',
            }}>
              {toast}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
