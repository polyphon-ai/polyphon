import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { Session } from '../../../shared/types';

type ExportFormat = 'markdown' | 'json' | 'plaintext';

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'markdown', label: 'Markdown', description: '.md — formatted for readability' },
  { value: 'plaintext', label: 'Plain Text', description: '.txt — simple line-by-line transcript' },
  { value: 'json', label: 'JSON', description: '.json — structured data with all fields' },
];

export function ExportModal({
  open,
  session,
  onClose,
}: {
  open: boolean;
  session: Session;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [acknowledged, setAcknowledged] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleExport() {
    if (!acknowledged) return;
    setExporting(true);
    setError(null);
    try {
      const result = await window.polyphon.session.export(session.id, format);
      if (result.ok) {
        onClose();
      } else if (result.error && result.error !== 'Cancelled') {
        setError(result.error);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Export Transcript</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
            {session.name}
          </p>
        </div>

        {/* Format picker */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Format</p>
          {FORMAT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                format === opt.value
                  ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="export-format"
                value={opt.value}
                checked={format === opt.value}
                onChange={() => setFormat(opt.value)}
                className="mt-0.5 h-3.5 w-3.5 text-indigo-600 border-gray-300 dark:border-gray-600 focus:ring-indigo-500 shrink-0"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Security warning */}
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 px-4 py-3">
          <ShieldAlert size={16} strokeWidth={1.75} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            Exported transcripts are <strong>not encrypted</strong>. The file will be saved
            in plain text and may contain sensitive information from your conversation.
            You are responsible for securing the exported file.
          </p>
        </div>

        {/* Acknowledgement checkbox */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 shrink-0"
          />
          <span className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
            I understand this export will not be encrypted and I will secure the file myself.
          </span>
        </label>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={!acknowledged || exporting}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm"
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
