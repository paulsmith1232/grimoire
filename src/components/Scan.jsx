import React, { useState, useRef } from 'react';
import { useApp } from '../context';
import { parseCardImage, parseBatchImages, resolveBatchLinks } from '../api';
import { genId, buildCardIndex } from '../db';
import CropOverlay from './CropOverlay';
import CardEditor from './CardEditor';
import BatchReview from './BatchReview';

export default function Scan() {
  const { state, dispatch, addCard, saveCard, setScanProfileId, setScanQueue } = useApp();
  const [status, setStatus] = useState('idle'); // idle | cropping | processing | preview | batch-review | saved | error
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [imgData, setImgData] = useState(null); // current image being cropped: { dataUrl, base64, mediaType }
  const [fullPageMode, setFullPageMode] = useState(false);
  const [scanInstructions, setScanInstructions] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [batchNew, setBatchNew] = useState([]);
  const [batchUpdates, setBatchUpdates] = useState([]);
  const [batchUsage, setBatchUsage] = useState(null);
  const [tokenWarning, setTokenWarning] = useState(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const profile = state.profiles.find((p) => p.id === state.scanProfileId);

  const queue = state.scanQueue;
  const setQueue = setScanQueue;

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Load via blob URL into an <img> element. Chrome 81+ and Safari 14.2+ apply
    // EXIF orientation automatically here (both naturalWidth/Height and drawImage),
    // which is more consistent than createImageBitmap({imageOrientation}).
    // Drawing to canvas re-encodes without EXIF, so CropOverlay receives a clean image.
    const url = URL.createObjectURL(file);
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Downscale to max 1500px on the long edge — phone cameras capture at 3000-4000px+
        // which creates multi-MB payloads that fail in transit. 1500px is plenty for Claude
        // to read printed text, and reduces payload by ~4-8x.
        const MAX = 1500;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setImgData({ dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
        setStatus('cropping');
        resolve();
      };
      img.src = url;
    });
  }

  function handleCropConfirm(images, fullPage) {
    setFullPageMode(fullPage);
    setQueue([...queue, ...images]);
    // Delay unmounting so the touch sequence finishes while the overlay still covers the screen.
    setTimeout(() => { setImgData(null); setStatus('idle'); }, 150);
  }

  async function processQueue() {
    setStatus('processing');
    try {
      const result = await parseCardImage(queue, state.apiKey, profile, {
        fullPageWithRegions: fullPageMode && queue.length === 1,
        scanInstructions,
      });
      setPreview({
        ...result,
        id: genId(),
        profileId: state.scanProfileId,
        tags: [],
        createdAt: Date.now(),
        sections: result.sections || [],
      });
      setStatus('preview');
      setScanInstructions(''); // cleared on success; preserved on error for retry
    } catch (err) {
      setError(err.message || "Couldn't parse image.");
      setStatus('error');
    }
  }

  async function processBatchQueue() {
    // Vision token estimate: ~1600 tokens per image (Claude's vision pricing for typical phone photos)
    // plus system prompt (~1500 tokens). This is approximate but much closer than byte-counting.
    const estimatedTokens = queue.length * 1600 + 1500;
    if (estimatedTokens > 30000) {
      setTokenWarning(estimatedTokens);
      return;
    }
    await runBatch();
  }

  async function runBatch() {
    setTokenWarning(null);
    setStatus('processing');
    try {
      // Index cards from all profiles so new cards can link across profiles
      // (e.g. a character-profile card linking to a D&D 5e rulebook card).
      const existingCards = await buildCardIndex(state.profiles.map((p) => p.id));
      const { cards, usage } = await parseBatchImages(queue, state.apiKey, profile, state.tags, existingCards, {});
      const stamped = cards.map((c) => ({
        ...c,
        id: genId(),
        profileId: state.scanProfileId,
        tags: c.tags || [],
        createdAt: Date.now(),
        sections: c.sections || [],
      }));
      resolveBatchLinks(stamped, existingCards);

      // Split into new cards vs updates to existing cards (name match, case-insensitive)
      const existingByName = {};
      for (const ec of existingCards) {
        if (ec.name) existingByName[ec.name.toLowerCase()] = ec;
      }
      const newCards = [];
      const updateItems = [];
      for (const card of stamped) {
        const match = existingByName[card.name.toLowerCase()];
        if (match) {
          // Find the full existing card from state
          const fullExisting = state.cards.find((c) => c.id === match.id);
          if (fullExisting) {
            updateItems.push({ incomingCard: card, existingCard: fullExisting });
          } else {
            newCards.push(card);
          }
        } else {
          newCards.push(card);
        }
      }

      setBatchNew(newCards);
      setBatchUpdates(updateItems);
      setBatchUsage(usage);
      setStatus('batch-review');
      setScanInstructions('');
    } catch (err) {
      const msg = err.message || "Couldn't parse images.";
      setError(msg);
      setStatus('error');
    }
  }

  function reset() {
    setStatus('idle');
    setError('');
    setPreview(null);
    setImgData(null);
    setQueue([]);
    setFullPageMode(false);
    setBatchNew([]);
    setBatchUpdates([]);
    setBatchUsage(null);
    setTokenWarning(null);
  }

  // Crop overlay
  if (status === 'cropping' && imgData) {
    return (
      <CropOverlay
        imgDataUrl={imgData.dataUrl}
        onConfirm={handleCropConfirm}
        onCancel={() => { setImgData(null); setStatus('idle'); }}
      />
    );
  }

  return (
    <div className="section fade-in">
      <h2 className="section-title">Scan a Page</h2>

      {/* Profile picker */}
      <div className="edit-field" style={{ marginBottom: 12 }}>
        <label>Scan Profile</label>
        <select
          value={state.scanProfileId || ''}
          onChange={(e) => setScanProfileId(e.target.value)}
        >
          {state.profiles.length === 0
            ? <option value="">No profiles — create one first</option>
            : state.profiles.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)
          }
        </select>
      </div>

      {profile && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.4 }}>
          Fields: {(profile.fields || []).map((f) => f.label).join(', ')}
        </div>
      )}

      {/* No API key */}
      {!state.apiKey && (
        <div className="setting-group" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔑</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>API key required</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Add your Anthropic API key in Settings.</div>
        </div>
      )}

      {/* No profile */}
      {state.apiKey && !profile && (
        <div className="setting-group" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📐</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>No profile selected</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Create a scan profile in the Profiles tab.</div>
        </div>
      )}

      {/* Idle / Error — show scan buttons */}
      {state.apiKey && profile && (status === 'idle' || status === 'error') && (
        <>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelect} />
          <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />

          {queue.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', overflowX: 'auto', gap: 8, paddingBottom: 4 }}>
                {queue.map((img, i) => (
                  <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                    <img
                      src={`data:${img.mediaType};base64,${img.base64}`}
                      alt={`Photo ${i + 1}`}
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid var(--border)' }}
                    />
                    <button
                      onClick={() => setQueue(queue.filter((_, j) => j !== i))}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        color: '#fff', fontSize: 13, lineHeight: 1,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 0,
                      }}
                      aria-label={`Remove photo ${i + 1}`}
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="scan-zone" onClick={() => cameraRef.current?.click()}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>
              {queue.length > 0 ? 'Take Another Photo' : 'Take Photo'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Then crop or send full page</div>
          </button>

          <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => galleryRef.current?.click()}>
            Choose from Library
          </button>

          {/* Collapsible per-scan instructions */}
          {!showInstructions ? (
            <button
              style={{
                display: 'block', width: '100%', marginTop: 10,
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px',
                color: 'var(--text-mid)', fontSize: 15,
                textAlign: 'left', cursor: 'pointer', minHeight: 44,
              }}
              onClick={() => setShowInstructions(true)}
            >
              ＋ Add instructions
            </button>
          ) : (
            <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Additional Instructions</span>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 18, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setShowInstructions(false)}
                >✕</button>
              </div>
              <textarea
                value={scanInstructions}
                rows={2}
                placeholder="e.g. 'This is from the 2024 PHB, focus on mechanical effects'"
                style={{ width: '100%', fontSize: 16, resize: 'none', overflowY: 'auto', maxHeight: 168, boxSizing: 'border-box' }}
                onChange={(e) => {
                  setScanInstructions(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 168) + 'px';
                }}
              />
            </div>
          )}

          {queue.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <button
                className="btn"
                style={{ width: '100%', background: 'var(--accent)', color: '#1a1714', fontWeight: 700 }}
                onClick={processQueue}
              >
                Generate Card{queue.length > 1 ? ` from ${queue.length} Photos` : ''}
              </button>
              <button
                className="btn btn-secondary"
                style={{ width: '100%', fontWeight: 700 }}
                onClick={processBatchQueue}
              >
                ✦ Generate Wiki ({queue.length} photo{queue.length !== 1 ? 's' : ''})
              </button>
            </div>
          )}

          {tokenWarning && (
            <div style={{ marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Large batch</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
                This will send approximately {Math.round(tokenWarning / 1000)}k tokens to Claude. Continue?
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ flex: 1 }} onClick={runBatch}>Continue</button>
                <button className="btn" style={{ flex: 1 }} onClick={() => setTokenWarning(null)}>Cancel</button>
              </div>
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</p>
          )}
        </>
      )}

      {/* Processing */}
      {status === 'processing' && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 28, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }}>📖</div>
          <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>Reading your page...</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Extracting card details</div>
        </div>
      )}

      {/* Saved */}
      {status === 'saved' && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600, marginBottom: 20 }}>
            {(batchNew.length + batchUpdates.length) > 0
            ? `${batchNew.length + batchUpdates.length} card${batchNew.length + batchUpdates.length !== 1 ? 's' : ''} saved!`
            : 'Card saved!'}
          </div>
          <button className="btn" style={{ width: '100%', marginBottom: 10 }} onClick={reset}>Scan Another</button>
          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { reset(); dispatch({ type: 'SET_TAB', tab: 'library' }); }}>Go to Library</button>
        </div>
      )}

      {/* Preview */}
      {status === 'preview' && preview && (
        <>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text)', marginBottom: 12 }}>Review & Edit</h3>
          <CardEditor
            card={preview}
            onSave={async (draft) => {
              await addCard(draft);
              setStatus('saved');
            }}
            onCancel={reset}
          />
        </>
      )}

      {/* Batch review */}
      {status === 'batch-review' && (
        <BatchReview
          newCards={batchNew}
          updateItems={batchUpdates}
          usage={batchUsage}
          onSave={async ({ newCards, updates }) => {
            for (const card of newCards) {
              await addCard(card);
            }
            for (const { existingCard, incomingCard, sectionChoices } of updates) {
              const merged = { ...existingCard };
              const existingSections = [...(existingCard.sections || [])];
              for (const sec of incomingCard.sections || []) {
                const choice = sectionChoices[sec.name] || 'append';
                const existingIdx = existingSections.findIndex((s) => s.name === sec.name);
                if (choice === 'keep') {
                  // leave existing section untouched
                } else if (choice === 'replace' || existingIdx === -1) {
                  if (existingIdx !== -1) existingSections[existingIdx] = sec;
                  else existingSections.push(sec);
                } else if (choice === 'append') {
                  if (existingIdx !== -1) {
                    const existing = existingSections[existingIdx];
                    if (existing.type === 'text' && sec.content) {
                      existingSections[existingIdx] = { ...existing, content: existing.content + '\n\n' + sec.content };
                    } else if (existing.type === 'key-value' && sec.keyValues) {
                      existingSections[existingIdx] = { ...existing, keyValues: { ...existing.keyValues, ...sec.keyValues } };
                    }
                  } else {
                    existingSections.push(sec);
                  }
                }
              }
              merged.sections = existingSections;
              if (incomingCard.summary && !existingCard.summary) merged.summary = incomingCard.summary;
              await saveCard(merged);
            }
            setStatus('saved');
          }}
          onCancel={reset}
        />
      )}
    </div>
  );
}
