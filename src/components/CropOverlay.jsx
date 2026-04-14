import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

const GOLD = '#c29a3e';
const GOLD_FILL = 'rgba(194,154,62,0.3)';
const MIN_RECT = 20;
const BRACKET_MAX_ARM = 18;
const X_R = 10; // ✕ button hit radius

function getXBtnCenter(r) {
  return { cx: r.x + r.width - X_R - 2, cy: r.y + X_R + 2 };
}

function drawCornerBrackets(ctx, x, y, w, h) {
  const arm = Math.max(6, Math.min(BRACKET_MAX_ARM, w * 0.25, h * 0.25));
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x, y + arm);       ctx.lineTo(x, y);         ctx.lineTo(x + arm, y);
  ctx.moveTo(x + w - arm, y);   ctx.lineTo(x + w, y);     ctx.lineTo(x + w, y + arm);
  ctx.moveTo(x, y + h - arm);   ctx.lineTo(x, y + h);     ctx.lineTo(x + arm, y + h);
  ctx.moveTo(x + w - arm, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - arm);
  ctx.stroke();
}

function drawXBtn(ctx, r) {
  const { cx, cy } = getXBtnCenter(r);
  ctx.fillStyle = 'rgba(20,14,8,0.88)';
  ctx.beginPath();
  ctx.arc(cx, cy, X_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const s = 4;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
  ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
  ctx.stroke();
}

export default function CropOverlay({ imgDataUrl, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(new Image());
  const stateRef = useRef({ dW: 0, dH: 0, drawing: false, startX: 0, startY: 0 });
  const currentRectRef = useRef(null); // in-progress draft while dragging
  const regionsRef = useRef([]);       // mirror of regions state for use in event handlers

  const [regions, setRegions] = useState([]);
  const [fullPage, setFullPage] = useState(true);

  useEffect(() => { regionsRef.current = regions; }, [regions]);

  const draw = useCallback((draftRect = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { dW, dH } = stateRef.current;
    ctx.clearRect(0, 0, dW, dH);
    ctx.drawImage(imgRef.current, 0, 0, dW, dH);

    const all = draftRect ? [...regionsRef.current, draftRect] : regionsRef.current;
    for (const r of all) {
      ctx.fillStyle = GOLD_FILL;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      drawCornerBrackets(ctx, r.x, r.y, r.width, r.height);
      if (r !== draftRect) drawXBtn(ctx, r);
    }
  }, []);

  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      const maxW = window.innerWidth;
      const maxH = window.innerHeight - 110;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const dW = Math.round(img.naturalWidth * scale);
      const dH = Math.round(img.naturalHeight * scale);
      stateRef.current.dW = dW;
      stateRef.current.dH = dH;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = dW;
        canvas.height = dH;
        canvas.style.width = dW + 'px';
        canvas.style.height = dH + 'px';
      }
      draw();
    };
    img.src = imgDataUrl;
  }, [imgDataUrl, draw]);

  useEffect(() => {
    draw(currentRectRef.current);
  }, [regions, draw]);

  function getPosOnCanvas(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - r.left, stateRef.current.dW)),
      y: Math.max(0, Math.min(e.clientY - r.top, stateRef.current.dH)),
    };
  }

  function hitTestXBtn(p) {
    for (const r of regionsRef.current) {
      const { cx, cy } = getXBtnCenter(r);
      const dx = p.x - cx, dy = p.y - cy;
      if (dx * dx + dy * dy <= (X_R + 4) * (X_R + 4)) return r.id;
    }
    return null;
  }

  function handlePointerDown(e) {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;

    const p = getPosOnCanvas(e);
    const hitId = hitTestXBtn(p);
    if (hitId) {
      setRegions((prev) => prev.filter((r) => r.id !== hitId));
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    stateRef.current.startX = p.x;
    stateRef.current.startY = p.y;
    stateRef.current.drawing = true;
    currentRectRef.current = null;
  }

  function handlePointerMove(e) {
    if (!stateRef.current.drawing) return;
    const p = getPosOnCanvas(e);
    const { startX, startY } = stateRef.current;
    const x = Math.min(startX, p.x);
    const y = Math.min(startY, p.y);
    const width = Math.abs(p.x - startX);
    const height = Math.abs(p.y - startY);
    if (width > 5 && height > 5) {
      currentRectRef.current = { id: '__draft', x, y, width, height };
      draw(currentRectRef.current);
    }
  }

  function handlePointerUp() {
    if (!stateRef.current.drawing) return;
    stateRef.current.drawing = false;
    const draft = currentRectRef.current;
    currentRectRef.current = null;
    if (draft && draft.width >= MIN_RECT && draft.height >= MIN_RECT) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      setRegions((prev) => [...prev, { id, x: draft.x, y: draft.y, width: draft.width, height: draft.height }]);
    } else {
      draw();
    }
  }

  function handleConfirm() {
    if (regions.length === 0) return;
    const img = imgRef.current;
    const { dW, dH } = stateRef.current;
    const scaleX = img.naturalWidth / dW;
    const scaleY = img.naturalHeight / dH;

    let images;
    if (fullPage) {
      // Bake overlays onto full-size offscreen canvas
      const off = document.createElement('canvas');
      off.width = img.naturalWidth;
      off.height = img.naturalHeight;
      const ctx = off.getContext('2d');
      ctx.drawImage(img, 0, 0);
      for (const r of regions) {
        const rx = r.x * scaleX, ry = r.y * scaleY;
        const rw = r.width * scaleX, rh = r.height * scaleY;
        ctx.fillStyle = GOLD_FILL;
        ctx.fillRect(rx, ry, rw, rh);
        drawCornerBrackets(ctx, rx, ry, rw, rh);
      }
      images = [{ base64: off.toDataURL('image/jpeg', 0.92).split(',')[1], mediaType: 'image/jpeg' }];
    } else {
      images = regions.map((r) => {
        const off = document.createElement('canvas');
        off.width = Math.round(r.width * scaleX);
        off.height = Math.round(r.height * scaleY);
        off.getContext('2d').drawImage(
          img,
          Math.round(r.x * scaleX), Math.round(r.y * scaleY), off.width, off.height,
          0, 0, off.width, off.height,
        );
        return { base64: off.toDataURL('image/jpeg', 0.92).split(',')[1], mediaType: 'image/jpeg' };
      });
    }

    onConfirm(images, fullPage);
  }

  const scanLabel = regions.length === 0 ? 'Scan Regions'
    : regions.length === 1 ? 'Scan 1 Region'
    : `Scan ${regions.length} Regions`;

  return createPortal(
    <div
      className="crop-overlay"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="crop-toolbar">
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>Select Area</span>
        <button
          className={'btn btn-sm ' + (fullPage ? 'btn-primary' : 'btn-secondary')}
          onClick={() => setFullPage((v) => !v)}
          style={{ minWidth: 84 }}
        >
          {fullPage ? 'Full Page' : 'Crop Only'}
        </button>
      </div>
      <div className="crop-canvas-wrap">
        <canvas ref={canvasRef} style={{ display: 'block' }} />
        {regions.length === 0 && (
          <div className="crop-hint">Draw rectangles to highlight regions</div>
        )}
      </div>
      <div style={{ padding: '12px 16px', background: 'var(--surface)', flexShrink: 0 }}>
        <button
          className="btn btn-primary btn-block"
          disabled={regions.length === 0}
          onClick={handleConfirm}
        >
          {scanLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}
