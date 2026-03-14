import { useRef, useEffect, useState, useCallback } from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

const PREVIEW = 200;

interface Props {
  src: string;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}

export function AvatarEditor({ src, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const el = new Image();
    el.onload = () => {
      const fitScale = Math.max(PREVIEW / el.width, PREVIEW / el.height);
      setScale(fitScale);
      setOffset({ x: 0, y: 0 });
      setRotation(0);
      setImg(el);
    };
    el.src = src;
  }, [src]);

  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const c = PREVIEW / 2;
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(c + offset.x, c + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }, [img, rotation, scale, offset]);

  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + e.clientX - drag.current.startX, y: drag.current.oy + e.clientY - drag.current.startY });
  }, []);

  const onMouseUp = useCallback(() => { drag.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.2, Math.min(6, s * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  const handleConfirm = () => {
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = 200;
    out.height = 200;
    const ctx = out.getContext('2d')!;
    ctx.save();
    ctx.beginPath();
    ctx.arc(100, 100, 100, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(100 + offset.x, 100 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    onConfirm(out.toDataURL('image/png'));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-80 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Adjust photo</h2>

        <div className="flex justify-center">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={PREVIEW}
              height={PREVIEW}
              className="rounded-full cursor-grab active:cursor-grabbing select-none block"
              style={{ width: PREVIEW, height: PREVIEW }}
              onMouseDown={onMouseDown}
              onWheel={handleWheel}
            />
            <div className="absolute inset-0 rounded-full ring-2 ring-indigo-500/40 pointer-events-none" />
          </div>
        </div>

        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Drag to reposition · Scroll to zoom
        </p>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            title="Rotate left"
          >
            <RotateCcw size={16} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            title="Rotate right"
          >
            <RotateCw size={16} strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-2 flex-1 ml-1">
            <ZoomOut size={14} strokeWidth={1.75} className="text-gray-400 shrink-0" />
            <input
              type="range"
              min={0.2}
              max={6}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="flex-1 accent-indigo-500"
            />
            <ZoomIn size={14} strokeWidth={1.75} className="text-gray-400 shrink-0" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!img}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-sm text-white font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
