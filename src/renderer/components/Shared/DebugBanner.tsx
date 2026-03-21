import React, { useEffect, useState } from 'react';
import { Bug, X } from 'lucide-react';

export default function DebugBanner() {
  const [debugEnabled, setDebugEnabled] = useState(false);

  useEffect(() => {
    window.polyphon.logs.getDebugEnabled().then(setDebugEnabled);
  }, []);

  if (!debugEnabled) return null;

  async function handleTurnOff() {
    await window.polyphon.logs.setDebugEnabled(false);
    setDebugEnabled(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 shrink-0 text-sm"
      style={{ background: 'var(--color-warning-bg, oklch(97% 0.04 85))', borderBottom: '1px solid oklch(85% 0.08 85)', color: 'oklch(35% 0.1 60)' }}
    >
      <span className="flex items-center gap-2">
        <Bug size={14} strokeWidth={1.75} />
        Debug logging is active — log files may grow large.
      </span>
      <button
        onClick={handleTurnOff}
        className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded transition-colors shrink-0"
        style={{ background: 'oklch(90% 0.06 85)', color: 'oklch(30% 0.1 60)' }}
      >
        <X size={12} strokeWidth={1.75} />
        Turn off
      </button>
    </div>
  );
}
