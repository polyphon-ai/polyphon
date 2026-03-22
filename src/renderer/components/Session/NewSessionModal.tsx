import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { HelpTooltip } from '../Shared';
import type { Composition, Session } from '../../../shared/types';

type WorkingDirStatus = 'idle' | 'checking' | 'valid' | 'invalid';

function useWorkingDirField() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<WorkingDirStatus>('idle');
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(value: string) {
    setInput(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value.trim()) { setStatus('idle'); return; }
    setStatus('checking');
    timerRef.current = setTimeout(async () => {
      const ok = await window.polyphon.session.validateWorkingDir(value.trim());
      setStatus(ok ? 'valid' : 'invalid');
    }, 1500);
  }

  function setFromPicker(dir: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setInput(dir);
    setStatus('valid');
  }

  function clear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setInput('');
    setStatus('idle');
  }

  const resolvedDir = status === 'valid' ? input.trim() : null;
  const isBlocking = status === 'checking' || status === 'invalid';

  return { input, status, resolvedDir, isBlocking, handleChange, setFromPicker, clear };
}

export function NewSessionModal({
  open,
  compositions,
  initialComposition = null,
  onClose,
  onCreated,
}: {
  open: boolean;
  compositions: Composition[];
  initialComposition?: Composition | null;
  onClose: () => void;
  onCreated: (session: Session) => void;
}) {
  const [pickerComp, setPickerComp] = useState<Composition | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [sandboxed, setSandboxed] = useState(false);
  const workingDir = useWorkingDirField();

  useEffect(() => {
    if (open) {
      setPickerComp(initialComposition ?? null);
      setName('');
      setSandboxed(false);
      workingDir.clear();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function handleCreate() {
    if (!pickerComp || !name.trim()) return;
    setCreating(true);
    try {
      const session = await window.polyphon.session.create(
        pickerComp.id,
        name.trim(),
        workingDir.resolvedDir,
        sandboxed,
      );
      onCreated(session);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">New Session</h3>

        {!pickerComp ? (
          <>
            <p className="text-sm text-gray-500">Choose a composition:</p>
            {compositions.length === 0 ? (
              <div className="text-sm text-gray-400 dark:text-gray-600 text-center py-6">
                No compositions yet. Create one in{' '}
                <span className="font-medium">Compositions</span>.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {compositions.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setPickerComp(c)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors"
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {c.name}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                      {c.voices.length} voice{c.voices.length !== 1 ? 's' : ''} ·{' '}
                      {c.mode === 'conductor' ? 'Directed' : 'Broadcast'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPickerComp(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ←
              </button>
              <span className="text-sm text-gray-500">
                Using:{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {pickerComp.name}
                </span>
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Session name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="My session"
                autoFocus
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Working directory <span className="font-normal text-gray-400 dark:text-gray-600">(optional)</span>
                <HelpTooltip text="CLI voices (claude, codex, copilot) will be spawned in this directory." />
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={workingDir.input}
                  onChange={(e) => workingDir.handleChange(e.target.value)}
                  placeholder="/path/to/project"
                  className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const dir = await window.polyphon.session.pickWorkingDir();
                    if (dir) workingDir.setFromPicker(dir);
                  }}
                  className="shrink-0 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl transition-colors text-gray-700 dark:text-gray-300"
                >
                  Browse
                </button>
                {workingDir.input && (
                  <button
                    type="button"
                    onClick={workingDir.clear}
                    aria-label="Clear working directory"
                    className="shrink-0 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                )}
              </div>
              {workingDir.status === 'checking' && (
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">Checking…</p>
              )}
              {workingDir.status === 'valid' && (
                <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">Valid directory</p>
              )}
              {workingDir.status === 'invalid' && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">Directory not found</p>
              )}
            </div>
            {workingDir.status === 'valid' && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sandboxed}
                  onChange={(e) => setSandboxed(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  Sandbox API voices to this directory
                </span>
                <HelpTooltip text="Restricts all file system tool calls from API voices to this directory. Voices cannot read, write, or list files outside of it." />
              </label>
            )}
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim() || workingDir.isBlocking}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm"
            >
              {creating ? 'Creating…' : 'Start Session'}
            </button>
          </>
        )}

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
