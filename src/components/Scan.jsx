import React, { useState, useRef } from 'react';
import { useApp } from '../context';
import { parseCardImage } from '../api';
import { genId } from '../db';
import CropOverlay from './CropOverlay';
import CardEditor from './CardEditor';

export default function Scan() {
  const { state, dispatch, addCard, setScanProfileId } = useApp();
  const [status, setStatus] = useState('idle'); // idle | cropping | processing | preview | saved | error
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [imgData, setImgData] = useState(null); // current image being cropped: { dataUrl, base64, mediaType }
  const [queue, setQueue] = useState([]); // accumulated images: [{ base64, mediaType }]
  const [fullPageMode, setFullPageMode] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const profile = state.profiles.find((p) => p.id === state.scanProfileId);

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
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
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
    setQueue((q) => [...q, ...images]);
    // Delay unmounting so the touch sequence finishes while the overlay still covers the screen.
    setTimeout(() => { setImgData(null); setStatus('idle'); }, 150);
  }

  async function processQueue() {
    setStatus('processing');
    try {
      const result = await parseCardImage(queue, state.apiKey, profile, { fullPageWithRegions: fullPageMode && queue.length === 1 });
      setPreview({
        ...result,
        id: genId(),
        profileId: state.scanProfileId,
        tags: [],
        createdAt: Date.now(),
        sections: result.sections || [],
      });
      setStatus('preview');
    } catch (err) {
      setError(err.message || "Couldn't parse image.");
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
          Sections: {profile.sections.map((s) => s.name).join(', ')}
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
            <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
              {queue.length} photo{queue.length > 1 ? 's' : ''} queued
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

          {queue.length > 0 && (
            <button className="btn" style={{ width: '100%', marginTop: 10, background: 'var(--accent)', color: '#1a1714', fontWeight: 700 }} onClick={processQueue}>
              Generate Card{queue.length > 1 ? ` from ${queue.length} Photos` : ''}
            </button>
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
          <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600, marginBottom: 20 }}>Card saved!</div>
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
    </div>
  );
}
