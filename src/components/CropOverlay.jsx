import React, { useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function CropOverlay({ imgDataUrl, onCrop, onSendFull, onCancel }) {
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(new Image());
  const stateRef = useRef({ rect: null, drawing: false, startX: 0, startY: 0, dW: 0, dH: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = imgRef.current;
    const { dW, dH, rect } = stateRef.current;

    ctx.clearRect(0, 0, dW, dH);
    ctx.drawImage(img, 0, 0, dW, dH);

    if (rect) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, dW, rect.y);
      ctx.fillRect(0, rect.y + rect.h, dW, dH - rect.y - rect.h);
      ctx.fillRect(0, rect.y, rect.x, rect.h);
      ctx.fillRect(rect.x + rect.w, rect.y, dW - rect.x - rect.w, rect.h);
      ctx.strokeStyle = '#c29a3e';
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = '#c29a3e';
      for (const [cx, cy] of [
        [rect.x, rect.y], [rect.x + rect.w, rect.y],
        [rect.x, rect.y + rect.h], [rect.x + rect.w, rect.y + rect.h],
      ]) {
        ctx.fillRect(cx - 5, cy - 5, 10, 10);
      }
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

  function getPosOnCanvas(e) {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - r.left, stateRef.current.dW)),
      y: Math.max(0, Math.min(e.clientY - r.top, stateRef.current.dH)),
    };
  }

  function handlePointerDown(e) {
    // Only start a drag if the pointer is on the canvas
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;

    // Capture the pointer: all subsequent events for this pointerID come to this
    // element regardless of where the finger moves, preventing leakage to the nav.
    e.currentTarget.setPointerCapture(e.pointerId);

    const p = getPosOnCanvas(e);
    stateRef.current.startX = p.x;
    stateRef.current.startY = p.y;
    stateRef.current.drawing = true;
    stateRef.current.rect = null;
    draw();
  }

  function handlePointerMove(e) {
    if (!stateRef.current.drawing) return;
    const p = getPosOnCanvas(e);
    const { startX, startY } = stateRef.current;
    const x = Math.min(startX, p.x);
    const y = Math.min(startY, p.y);
    const w = Math.abs(p.x - startX);
    const h = Math.abs(p.y - startY);
    if (w > 5 && h > 5) {
      stateRef.current.rect = { x, y, w, h };
      draw();
    }
  }

  function handlePointerUp() {
    // Pointer capture is released automatically on pointerup
    stateRef.current.drawing = false;
  }

  function handleScan() {
    const { rect, dW, dH } = stateRef.current;
    if (!rect) {
      alert('Draw a rectangle first, or tap "Full Page".');
      return;
    }
    onCrop(rect, dW, dH, imgRef.current);
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="crop-overlay"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="crop-toolbar">
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>Select Area</span>
        <button className="btn btn-primary btn-sm" onClick={onSendFull}>Full Page</button>
      </div>
      <div className="crop-canvas-wrap">
        <canvas ref={canvasRef} style={{ display: 'block' }} />
        {!stateRef.current.rect && (
          <div className="crop-hint">Draw a rectangle around the text</div>
        )}
      </div>
      <div style={{ padding: '12px 16px', background: 'var(--surface)', flexShrink: 0 }}>
        <button className="btn btn-primary btn-block" onClick={handleScan}>Scan Selection</button>
      </div>
    </div>,
    document.body
  );
}
