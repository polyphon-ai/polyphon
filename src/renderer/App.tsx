import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Music2, Settings2, Archive, Plus, PanelLeftClose, PanelLeftOpen, Pencil, Check, X, Camera, Wand2, BookOpen, AlertTriangle, Trash2 } from 'lucide-react';
import wordmarkLightUrl from '../../assets/wordmark-light.svg?url';
import wordmarkDarkUrl from '../../assets/wordmark-dark.svg?url';
import iconLightUrl from '../../assets/icon-light-transparent.svg?url';
import iconDarkUrl from '../../assets/icon-dark-transparent.svg?url';
import { useUIStore } from './store/uiStore';
import { useSessionStore } from './store/sessionStore';
import { useCompositionStore } from './store/compositionStore';
import { useSettingsStore } from './store/settingsStore';
import SettingsPage from './components/Settings/SettingsPage';
import SessionView from './components/Session/SessionView';
import CompositionBuilder from './components/Composition/CompositionBuilder';
import type { Session, Composition } from '../shared/types';
import { PROVIDER_METADATA, SETTINGS_PROVIDERS } from '../shared/constants';
import { AvatarEditor } from './components/Settings/AvatarEditor';
import { HelpTooltip, ColorPicker } from './components/Shared';
import UpdateBanner from './components/Shared/UpdateBanner';
import PasswordPromptView from './components/PasswordPrompt/PasswordPromptView';
import { PasswordStrengthGauge, PasswordMatchIndicator } from './components/Settings/EncryptionSection';


function ArchiveToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-label="Show archived"
      className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none"
    >
      <span>Show archived</span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
          on ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

// ── Shared card action buttons ─────────────────────────────────────────────

function CardActions({
  archived,
  onArchive,
  onDelete,
}: {
  archived: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (confirmDelete) {
    return (
      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs text-gray-500 dark:text-gray-400">Delete?</span>
        <button
          onClick={onDelete}
          className="text-xs px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
        >
          Yes
        </button>
        <button
          onClick={() => setConfirmDelete(false)}
          className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onArchive}
        title={archived ? 'Unarchive' : 'Archive'}
        aria-label={archived ? 'Unarchive' : 'Archive'}
        className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Archive size={14} strokeWidth={1.75} />
      </button>
      <button
        onClick={() => setConfirmDelete(true)}
        title="Delete"
        className="p-1 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

// ── Session list ──────────────────────────────────────────────────────────────

type DateGroup = 'Today' | 'Yesterday' | 'This week' | 'This month' | 'Older';

function getDateGroup(ts: number): DateGroup {
  const now = new Date();
  const d = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = diff / 86400000;
  if (days <= 0) return 'Today';
  if (days <= 1) return 'Yesterday';
  if (days <= 6) return 'This week';
  if (days <= 30) return 'This month';
  return 'Older';
}

const DATE_GROUP_ORDER: DateGroup[] = ['Today', 'Yesterday', 'This week', 'This month', 'Older'];

function SessionRow({
  session,
  compositionName,
  onClick,
  onRename,
  onArchive,
  onDelete,
}: {
  session: Session;
  compositionName: string;
  onClick: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  function startRename(e: React.MouseEvent) {
    e.stopPropagation();
    setRenameValue(session.name);
    setIsRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.name) onRename(trimmed);
    setIsRenaming(false);
  }

  function cancelRename() {
    setIsRenaming(false);
  }

  const time = new Date(session.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      onClick={isRenaming ? undefined : onClick}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isRenaming ? (
            <input
              ref={inputRef}
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 text-sm font-medium bg-white dark:bg-gray-800 border border-indigo-400 rounded px-1.5 py-0.5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          ) : (
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {session.name}
            </span>
          )}
          <span
            className={`text-[10px] px-1.5 py-px rounded-full font-medium shrink-0 ${
              session.mode === 'conductor'
                ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                : 'bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400'
            }`}
          >
            {session.mode === 'conductor' ? 'Directed' : 'Broadcast'}
          </span>
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
          {compositionName}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {isRenaming ? (
          <>
            <button
              onClick={commitRename}
              className="p-1 rounded text-green-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Confirm rename"
            >
              <Check size={14} strokeWidth={1.75} />
            </button>
            <button
              onClick={cancelRename}
              className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Cancel rename"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={startRename}
              className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors opacity-0 group-hover:opacity-100"
              aria-label="Rename session"
            >
              <Pencil size={14} strokeWidth={1.75} />
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-600 mr-1">{time}</span>
            <CardActions archived={session.archived} onArchive={onArchive} onDelete={onDelete} />
          </>
        )}
      </div>
    </div>
  );
}

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

function SessionsList({
  onOpenSession,
}: {
  onOpenSession: (session: Session) => void;
}) {
  const { sessions, setSessions, removeSession, renameSession } = useSessionStore();
  const { compositions, setCompositions } = useCompositionStore();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerComp, setPickerComp] = useState<Composition | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const workingDir = useWorkingDirField();

  useEffect(() => {
    window.polyphon.session.list(showArchived).then(setSessions).catch(() => {});
    window.polyphon.composition.list().then(setCompositions).catch(() => {});
  }, [showArchived]);

  const compMap = Object.fromEntries(compositions.map((c) => [c.id, c]));

  async function handleArchiveSession(session: Session) {
    const next = !session.archived;
    await window.polyphon.session.archive(session.id, next).catch(() => {});
    removeSession(session.id);
  }

  async function handleDeleteSession(id: string) {
    await window.polyphon.session.delete(id).catch(() => {});
    removeSession(id);
  }

  async function handleCreate() {
    if (!pickerComp || !newName.trim()) return;
    setCreating(true);
    try {
      const session = await window.polyphon.session.create(
        pickerComp.id,
        newName.trim(),
        workingDir.resolvedDir,
      );
      setSessions([session, ...sessions]);
      setShowPicker(false);
      setPickerComp(null);
      setNewName('');
      workingDir.clear();
      onOpenSession(session);
    } finally {
      setCreating(false);
    }
  }

  function closePicker() {
    setShowPicker(false);
    setPickerComp(null);
    setNewName('');
    workingDir.clear();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Sessions
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Continue a conversation or start a new one.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ArchiveToggle on={showArchived} onChange={setShowArchived} />
          <button
            onClick={() => setShowPicker(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            New Session
          </button>
        </div>
      </div>

      {/* Composition picker modal */}
      {showPicker && (
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 z-30 flex items-center justify-center p-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              New Session
            </h3>

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
                          {c.voices.length} voice
                          {c.voices.length !== 1 ? 's' : ''} ·{' '}
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
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
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
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim() || workingDir.isBlocking}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm"
                >
                  {creating ? 'Creating…' : 'Start Session'}
                </button>
              </>
            )}

            <button
              onClick={closePicker}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600">
            <div className="text-4xl mb-3">◎</div>
            <div className="text-sm">
              {showArchived
                ? 'No archived sessions'
                : 'No sessions yet. Create a composition to conduct your first session.'}
            </div>
          </div>
        ) : (() => {
          const grouped = new Map<DateGroup, Session[]>();
          for (const s of sessions) {
            const g = getDateGroup(s.createdAt);
            if (!grouped.has(g)) grouped.set(g, []);
            grouped.get(g)!.push(s);
          }
          return DATE_GROUP_ORDER.filter((g) => grouped.has(g)).map((group) => (
            <div key={group} className="mb-6">
              <div className="text-xs font-medium text-gray-400 dark:text-gray-600 uppercase tracking-wider px-3 mb-1">
                {group}
              </div>
              {grouped.get(group)!.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  compositionName={compMap[s.compositionId]?.name ?? '—'}
                  onClick={() => !showArchived && onOpenSession(s)}
                  onRename={async (name) => {
                    await window.polyphon.session.rename(s.id, name).catch(() => {});
                    renameSession(s.id, name);
                  }}
                  onArchive={() => handleArchiveSession(s)}
                  onDelete={() => handleDeleteSession(s.id)}
                />
              ))}
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

// ── Composition list ──────────────────────────────────────────────────────────

function CompositionRow({
  composition,
  onClick,
  onArchive,
  onDelete,
}: {
  composition: Composition;
  onClick: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const time = new Date(composition.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {composition.name}
          </span>
          <span className={`text-[10px] px-1.5 py-px rounded-full font-medium shrink-0 ${
            composition.mode === 'conductor'
              ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
              : 'bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400'
          }`}>
            {composition.mode === 'conductor' ? 'Directed' : 'Broadcast'}
          </span>
        </div>
        {composition.voices.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {composition.voices.map((v) => (
              <span
                key={v.id}
                title={v.displayName}
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: v.color }}
              />
            ))}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate ml-0.5">
              {composition.voices.map((v) => v.displayName).join(', ')}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-gray-400 dark:text-gray-600 mr-1">{time}</span>
        <CardActions archived={composition.archived} onArchive={onArchive} onDelete={onDelete} />
      </div>
    </div>
  );
}

function CompositionsList({
  onNew,
  onEdit,
}: {
  onNew: () => void;
  onEdit: (c: Composition) => void;
}) {
  const { compositions, setCompositions, removeComposition } = useCompositionStore();
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    window.polyphon.composition.list(showArchived).then(setCompositions).catch(() => {});
  }, [showArchived]);

  async function handleArchiveComposition(composition: Composition) {
    const next = !composition.archived;
    await window.polyphon.composition.archive(composition.id, next).catch(() => {});
    removeComposition(composition.id);
  }

  async function handleDeleteComposition(id: string) {
    await window.polyphon.composition.delete(id).catch(() => {});
    removeComposition(id);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Compositions
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Saved multi-voice configurations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ArchiveToggle on={showArchived} onChange={setShowArchived} />
          <button
            onClick={onNew}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            New Composition
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {compositions.length === 0 ? (
          showArchived ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600">
              <div className="text-4xl mb-3">♪</div>
              <div className="text-sm">No archived compositions</div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 max-w-sm mx-auto text-center">
              <div className="text-5xl">♪</div>
              <div>
                <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Create your first composition
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
                  A composition defines the voices (AI agents) that will participate in a session. You need at least one composition before you can start a session.
                </div>
              </div>
              <button
                onClick={onNew}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                New Composition
              </button>
            </div>
          )
        ) : (
          <div>
            {[...compositions]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <CompositionRow
                  key={c.id}
                  composition={c}
                  onClick={() => !showArchived && onEdit(c)}
                  onArchive={() => handleArchiveComposition(c)}
                  onDelete={() => handleDeleteComposition(c.id)}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({
  onOpenSession,
  onNewComposition,
  onEditComposition,
  onSettings,
}: {
  onOpenSession: (session: Session) => void;
  onNewComposition: () => void;
  onEditComposition: (c: Composition) => void;
  onSettings: () => void;
}) {
  const { sessions, setSessions } = useSessionStore();
  const { compositions, setCompositions } = useCompositionStore();
  const { providerStatuses, cliTestStates, customProviders } = useSettingsStore();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerComp, setPickerComp] = useState<Composition | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const workingDir = useWorkingDirField();

  useEffect(() => {
    window.polyphon.session.list(false).then(setSessions).catch(() => {});
    window.polyphon.composition.list(false).then(setCompositions).catch(() => {});
  }, []);

  const recentSessions = sessions.slice(0, 5);
  const recentCompositions = compositions.slice(0, 3);
  const compMap = Object.fromEntries(compositions.map((c) => [c.id, c]));

  async function handleCreate() {
    if (!pickerComp || !newName.trim()) return;
    setCreating(true);
    try {
      const session = await window.polyphon.session.create(pickerComp.id, newName.trim(), workingDir.resolvedDir);
      setSessions([session, ...sessions]);
      setShowPicker(false);
      setPickerComp(null);
      setNewName('');
      workingDir.clear();
      onOpenSession(session);
    } finally {
      setCreating(false);
    }
  }

  function closePicker() {
    setShowPicker(false);
    setPickerComp(null);
    setNewName('');
    workingDir.clear();
  }

  return (
    <div className="h-full overflow-y-auto py-12 px-8 relative">
      <h1 className="sr-only">Polyphon</h1>
      <div className="max-w-2xl mx-auto space-y-10">
        {/* Recent Sessions */}
        <div>
          <div className="border-b border-gray-100 dark:border-gray-800 pb-2 mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Recent Sessions
            </h2>
            <div className="relative group">
              <button
                onClick={() => setShowPicker(true)}
                aria-label="+ New Session"
                className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Plus size={16} strokeWidth={1.75} />
              </button>
              <div className="absolute right-0 top-full mt-1 px-2 py-1 text-xs text-white bg-gray-800 dark:bg-gray-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                New Session
              </div>
            </div>
          </div>
          {recentSessions.length === 0 ? (
            <div>
              <p className="text-sm text-gray-400 dark:text-gray-600">No sessions yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                Start a new session to get going.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {recentSessions.map((s) => {
                const date = new Date(s.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                return (
                  <div
                    key={s.id}
                    onClick={() => onOpenSession(s)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate flex-1">
                      {s.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {compMap[s.compositionId]?.name ?? '—'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-px rounded-full font-medium shrink-0 ${
                      s.mode === 'conductor'
                        ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                        : 'bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400'
                    }`}>
                      {s.mode === 'conductor' ? 'Directed' : 'Broadcast'}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-600 shrink-0">{date}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Compositions */}
        <div>
          <div className="border-b border-gray-100 dark:border-gray-800 pb-2 mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Recent Compositions
            </h2>
            <div className="relative group">
              <button
                onClick={onNewComposition}
                aria-label="+ New Composition"
                className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Plus size={16} strokeWidth={1.75} />
              </button>
              <div className="absolute right-0 top-full mt-1 px-2 py-1 text-xs text-white bg-gray-800 dark:bg-gray-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                New Composition
              </div>
            </div>
          </div>
          {recentCompositions.length === 0 ? (
            <div>
              <p className="text-sm text-gray-400 dark:text-gray-600">No compositions yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                Create a composition to define your voice ensemble.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {recentCompositions.map((c) => {
                const date = new Date(c.createdAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setPickerComp(c);
                      setShowPicker(true);
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate flex-1">
                      {c.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.voices.map((v) => (
                        <span
                          key={v.id}
                          title={v.displayName}
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: v.color }}
                        />
                      ))}
                      <span className="text-xs text-gray-400 dark:text-gray-600 ml-1 truncate max-w-32">
                        {c.voices.map((v) => v.displayName).join(', ')}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-600 shrink-0">{date}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Provider status */}
        <div>
          <div className="border-b border-gray-100 dark:border-gray-800 pb-2 mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Providers
            </h2>
            <button
              onClick={onSettings}
              className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Manage →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SETTINGS_PROVIDERS.map((provider) => {
              const meta = PROVIDER_METADATA[provider];
              const status = providerStatuses[provider];
              const hasApi = meta?.supportedTypes.includes('api') ?? false;
              const hasCli = meta?.supportedTypes.includes('cli') ?? false;
              const apiReady = status?.apiKeyStatus != null && status.apiKeyStatus.status !== 'none';
              const cliState = cliTestStates[provider];
              const cliReady = cliState?.status === 'success';
              return (
                <div
                  key={provider}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium flex-1 truncate">
                    {meta?.name ?? provider}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasApi && (
                      <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        apiReady
                          ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${apiReady ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                        API
                      </span>
                    )}
                    {hasCli && (
                      <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        cliReady
                          ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cliReady ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                        CLI
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {customProviders.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {customProviders.map((cp) => {
                const apiReady = cp.apiKeyStatus != null && cp.apiKeyStatus.status !== 'none';
                const noKey = cp.apiKeyEnvVar == null || cp.apiKeyEnvVar === '';
                return (
                  <div
                    key={cp.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium flex-1 truncate">
                      {cp.name}
                    </span>
                    <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                      apiReady || noKey
                        ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${apiReady || noKey ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      API
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Composition picker modal */}
      {showPicker && (
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 z-30 flex items-center justify-center p-6">
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
                          {c.voices.length} voice
                          {c.voices.length !== 1 ? 's' : ''} ·{' '}
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
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
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
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim() || workingDir.isBlocking}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm"
                >
                  {creating ? 'Creating…' : 'Start Session'}
                </button>
              </>
            )}

            <button
              onClick={closePicker}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App(): React.JSX.Element {
  // Render password prompt if launched as the unlock window
  if (new URLSearchParams(window.location.search).get('view') === 'unlock') {
    return <PasswordPromptView />;
  }

  const { activeView, setView, theme } = useUIStore();
  const {
    activeSessionId,
    setActiveSession,
    sessions,
    setSessions,
    openSession,
    closeSession,
    streamingVoices,
    messages: sessionMessages,
  } = useSessionStore();
  const { compositions, setCompositions, upsertComposition } = useCompositionStore();
  const { load: loadSettings, userProfile, saveUserProfile } = useSettingsStore();

  // Local state for composition builder navigation
  const [editingComposition, setEditingComposition] =
    useState<Partial<Composition> | null>(null);

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Sidebar "new session" modal
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionPickerComp, setNewSessionPickerComp] = useState<Composition | null>(null);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionCreating, setNewSessionCreating] = useState(false);
  const sidebarWorkingDir = useWorkingDirField();


  // First-run onboarding modal
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingPronouns, setOnboardingPronouns] = useState('');
  const [onboardingContext, setOnboardingContext] = useState('');
  const [onboardingColor, setOnboardingColor] = useState('#6b7280');
  const [onboardingAvatar, setOnboardingAvatar] = useState('');
  const [onboardingPendingAvatar, setOnboardingPendingAvatar] = useState<string | null>(null);
  const [onboardingPasswordEnabled, setOnboardingPasswordEnabled] = useState(false);
  const [onboardingPassword, setOnboardingPassword] = useState('');
  const [onboardingPasswordConfirm, setOnboardingPasswordConfirm] = useState('');
  const [onboardingPasswordError, setOnboardingPasswordError] = useState('');

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const sidebarCompMap = Object.fromEntries(compositions.map((c) => [c.id, c]));

  const [keyRegeneratedWarning, setKeyRegeneratedWarning] = useState(false);

  // On startup, load settings, compositions, and sessions for the store
  useEffect(() => {
    loadSettings();
    window.polyphon.composition.list().then(setCompositions).catch(() => {});
    window.polyphon.session.list(false).then(setSessions).catch(() => {});
    const unsub = window.polyphon.encryption.onKeyRegeneratedWarning(() => {
      setKeyRegeneratedWarning(true);
    });
    return () => { unsub(); };
  }, []);

  // Show onboarding modal on first run (profile loaded but no name set yet)
  useEffect(() => {
    if (
      userProfile.updatedAt > 0 &&
      !userProfile.conductorName &&
      !localStorage.getItem('polyphon.onboardingComplete')
    ) {
      setShowOnboarding(true);
    }
  }, [userProfile.updatedAt, userProfile.conductorName]);

  async function handleOnboardingSave() {
    if (onboardingPasswordEnabled) {
      if (!onboardingPassword) {
        setOnboardingPasswordError('Password is required.');
        return;
      }
      if (onboardingPassword !== onboardingPasswordConfirm) {
        setOnboardingPasswordError('Passwords do not match.');
        return;
      }
      try {
        await window.polyphon.encryption.setPassword(onboardingPassword);
      } catch (err) {
        setOnboardingPasswordError(err instanceof Error ? err.message : 'Failed to set password.');
        return;
      }
    }
    saveUserProfile({
      conductorName: onboardingName.trim(),
      pronouns: onboardingPronouns,
      conductorContext: onboardingContext.trim() || userProfile.conductorContext,
      defaultTone: userProfile.defaultTone,
      conductorColor: onboardingColor,
      conductorAvatar: onboardingAvatar,
      preferMarkdown: userProfile.preferMarkdown,
    });
    localStorage.setItem('polyphon.onboardingComplete', '1');
    setShowOnboarding(false);
  }

  async function handleOnboardingPickAvatar() {
    try {
      const dataUrl = await window.polyphon.settings.pickAvatarFile();
      if (dataUrl) setOnboardingPendingAvatar(dataUrl);
    } catch {
      // file dialog cancelled or failed — no-op
    }
  }

  function handleOnboardingSkip() {
    localStorage.setItem('polyphon.onboardingComplete', '1');
    setShowOnboarding(false);
  }

  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(prefersDark: boolean) {
      if (theme === 'dark' || (theme === 'system' && prefersDark)) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches);

    if (theme === 'system') {
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  function handleOpenSession(session: Session) {
    if (!sessions.find((s) => s.id === session.id)) {
      setSessions([session, ...sessions]);
    }
    openSession(session.id);
    setView('session');
  }

  async function handleSidebarCreateSession() {
    if (!newSessionPickerComp || !newSessionName.trim()) return;
    setNewSessionCreating(true);
    try {
      const session = await window.polyphon.session.create(
        newSessionPickerComp.id,
        newSessionName.trim(),
        sidebarWorkingDir.resolvedDir,
      );
      setSessions([session, ...sessions]);
      setShowNewSessionModal(false);
      setNewSessionPickerComp(null);
      setNewSessionName('');
      sidebarWorkingDir.clear();
      handleOpenSession(session);
    } finally {
      setNewSessionCreating(false);
    }
  }

  function closeNewSessionModal() {
    setShowNewSessionModal(false);
    setNewSessionPickerComp(null);
    setNewSessionName('');
    sidebarWorkingDir.clear();
  }

  async function handleSaveComposition(
    data: Omit<Composition, 'id' | 'createdAt' | 'updatedAt' | 'archived'>,
  ) {
    try {
      if (editingComposition?.id) {
        const updated = await window.polyphon.composition.update(
          editingComposition.id,
          data,
        );
        if (updated) upsertComposition(updated as Composition);
      } else {
        const created = await window.polyphon.composition.create({ ...data, archived: false });
        if (created) upsertComposition(created as Composition);
      }
      setEditingComposition(null);
    } catch {
      // errors surface through the builder's validation UI
    }
  }

  const showBuilder =
    activeView === 'composition-builder' && editingComposition !== null;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden">
      <UpdateBanner />
      {keyRegeneratedWarning && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500 text-white text-sm shrink-0">
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} strokeWidth={1.75} />
            <span>Encryption key was regenerated. Previous messages may be unreadable. Go to Settings → Encryption to set a password.</span>
          </span>
          <button
            onClick={() => setKeyRegeneratedWarning(false)}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-amber-400 transition-colors shrink-0"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:px-4 focus-visible:py-2 focus-visible:rounded-lg focus-visible:shadow-lg focus-ring"
      >
        Skip to main content
      </a>

      {/* Sidebar */}
      <aside
        aria-label="Main navigation"
        className={`shrink-0 flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-200 ${
          sidebarCollapsed ? 'w-14' : 'w-56'
        }`}
      >
        {sidebarCollapsed ? (
          /* Collapsed sidebar */
          <div className="flex flex-col items-center h-full py-3 gap-1">
            <button
              onClick={() => setView('home')}
              title="Home"
              aria-label="Home"
              className="flex justify-center pt-3 pb-2 border-b border-gray-200 dark:border-gray-800 w-full"
            >
              <img src={iconLightUrl} alt="Polyphon" className="w-9 h-9 dark:hidden" />
              <img src={iconDarkUrl} alt="" aria-hidden className="w-9 h-9 hidden dark:block" />
            </button>
            <button
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Expand sidebar"
              aria-expanded={false}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <PanelLeftOpen size={16} strokeWidth={1.75} />
            </button>

            <nav className="flex flex-col items-center gap-1 flex-1 mt-2">
              <button
                onClick={() => {
                  setActiveSession(null);
                  setView('session');
                }}
                aria-label="Sessions"
                aria-current={activeView === 'session' ? 'page' : undefined}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  activeView === 'session'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <MessageSquare size={18} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => {
                  setEditingComposition(null);
                  setView('composition-builder');
                }}
                aria-label="Compositions"
                aria-current={activeView === 'composition-builder' ? 'page' : undefined}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  activeView === 'composition-builder'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Music2 size={18} strokeWidth={1.75} />
              </button>
            </nav>

            <button
              onClick={() => setView('settings')}
              aria-label="Settings"
              aria-current={activeView === 'settings' ? 'page' : undefined}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                activeView === 'settings'
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Settings2 size={18} strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          /* Expanded sidebar */
          <>
            <div className="px-4 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <button onClick={() => setView('home')} className="text-left">
                <img src={wordmarkLightUrl} alt="Polyphon" className="h-9 dark:hidden" />
                <img src={wordmarkDarkUrl} alt="" aria-hidden className="h-9 hidden dark:block" />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">One chat. Many voices.</p>
              </button>
              <button
                onClick={() => setSidebarCollapsed(true)}
                aria-label="Collapse sidebar"
                aria-expanded={true}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <PanelLeftClose size={16} strokeWidth={1.75} />
              </button>
            </div>

            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
              <div
                className={`flex items-center rounded-lg transition-colors ${
                  activeView === 'session'
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <button
                  onClick={() => {
                    setActiveSession(null);
                    setView('session');
                  }}
                  aria-current={activeView === 'session' ? 'page' : undefined}
                  className={`flex-1 flex items-center gap-2.5 px-3 py-2 text-sm transition-colors rounded-lg ${
                    activeView === 'session'
                      ? 'text-gray-900 dark:text-gray-100 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <MessageSquare size={18} strokeWidth={1.75} />
                  Sessions
                </button>
                <button
                  onClick={() => setShowNewSessionModal(true)}
                  title="New session"
                  aria-label="New session"
                  className="shrink-0 w-6 h-6 mr-1.5 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Plus size={16} strokeWidth={1.75} />
                </button>
              </div>
              {sessions.length > 0 && (
                <div className="mt-1 border-t border-gray-200 dark:border-gray-800">
                  {sessions.map((sess) => {
                    const isActive = sess.id === activeSessionId;
                    const isStreaming =
                      isActive && (streamingVoices[sess.id]?.size ?? 0) > 0;
                    const comp = sidebarCompMap[sess.compositionId];
                    const voices = comp?.voices ?? [];
                    const msgs = sessionMessages[sess.id];
                    const lastNonSystem = msgs ? [...msgs].reverse().find((m) => m.role !== 'system') : undefined;
                    const awaitingInput = !isStreaming && lastNonSystem?.role === 'voice';
                    return (
                      <div
                        key={sess.id}
                        onClick={() => handleOpenSession(sess)}
                        className={`pl-7 pr-2 py-1.5 border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-gray-100 dark:bg-gray-800'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="flex-1 text-xs font-medium truncate text-gray-700 dark:text-gray-300">
                            {sess.name}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-600 shrink-0">
                            {sess.mode === 'conductor' ? 'Directed' : 'Broadcast'}
                          </span>
                          {isStreaming && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" title="Voices responding" />
                          )}
                          {awaitingInput && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" title="Waiting for your input" />
                          )}
                        </div>
                        {voices.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            {voices.map((v) => (
                              <span
                                key={v.id}
                                title={v.displayName}
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: v.color }}
                              />
                            ))}
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 truncate ml-0.5">
                              {voices.map((v) => v.displayName).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div
                className={`flex items-center rounded-lg transition-colors ${
                  activeView === 'composition-builder'
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <button
                  onClick={() => {
                    setEditingComposition(null);
                    setView('composition-builder');
                  }}
                  aria-current={activeView === 'composition-builder' ? 'page' : undefined}
                  className={`flex-1 flex items-center gap-2.5 px-3 py-2 text-sm transition-colors rounded-lg ${
                    activeView === 'composition-builder'
                      ? 'text-gray-900 dark:text-gray-100 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <Music2 size={18} strokeWidth={1.75} />
                  Compositions
                </button>
                <button
                  onClick={() => { setEditingComposition({}); setView('composition-builder'); }}
                  title="New composition"
                  aria-label="New composition"
                  className="shrink-0 w-6 h-6 mr-1.5 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Plus size={16} strokeWidth={1.75} />
                </button>
              </div>
              {compositions.length > 0 && (
                <div className="mt-1 border-t border-gray-200 dark:border-gray-800">
                  {[...compositions].sort((a, b) => a.name.localeCompare(b.name)).map((comp) => {
                    const isActive = activeView === 'composition-builder' && editingComposition?.id === comp.id;
                    return (
                      <div
                        key={comp.id}
                        onClick={() => { setEditingComposition(comp); setView('composition-builder'); }}
                        className={`pl-7 pr-2 py-1.5 border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-gray-100 dark:bg-gray-800'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="flex-1 text-xs font-medium truncate text-gray-700 dark:text-gray-300">
                            {comp.name}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-600 shrink-0">
                            {comp.mode === 'conductor' ? 'Directed' : 'Broadcast'}
                          </span>
                        </div>
                        {comp.voices.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            {comp.voices.map((v) => (
                              <span
                                key={v.id}
                                title={v.displayName}
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: v.color }}
                              />
                            ))}
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 truncate ml-0.5">
                              {comp.voices.map((v) => v.displayName).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </nav>

            <div className="px-2 py-3 border-t border-gray-200 dark:border-gray-800 space-y-0.5">
              <button
                onClick={() => window.polyphon.shell.openExternal('https://polyphon.ai/docs/')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <BookOpen size={18} strokeWidth={1.75} />
                Documentation
              </button>
              <button
                onClick={() => setView('settings')}
                aria-current={activeView === 'settings' ? 'page' : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeView === 'settings'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Settings2 size={18} strokeWidth={1.75} />
                Settings
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Sidebar: New Session modal */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">New Session</h3>

            {!newSessionPickerComp ? (
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
                        onClick={() => setNewSessionPickerComp(c)}
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
                    onClick={() => setNewSessionPickerComp(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    ←
                  </button>
                  <span className="text-sm text-gray-500">
                    Using:{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {newSessionPickerComp.name}
                    </span>
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Session name
                  </label>
                  <input
                    type="text"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSidebarCreateSession()}
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
                      value={sidebarWorkingDir.input}
                      onChange={(e) => sidebarWorkingDir.handleChange(e.target.value)}
                      placeholder="/path/to/project"
                      className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const dir = await window.polyphon.session.pickWorkingDir();
                        if (dir) sidebarWorkingDir.setFromPicker(dir);
                      }}
                      className="shrink-0 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl transition-colors text-gray-700 dark:text-gray-300"
                    >
                      Browse
                    </button>
                    {sidebarWorkingDir.input && (
                      <button
                        type="button"
                        onClick={sidebarWorkingDir.clear}
                        aria-label="Clear working directory"
                        className="shrink-0 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        <X size={14} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                  {sidebarWorkingDir.status === 'checking' && (
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">Checking…</p>
                  )}
                  {sidebarWorkingDir.status === 'valid' && (
                    <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">Valid directory</p>
                  )}
                  {sidebarWorkingDir.status === 'invalid' && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">Directory not found</p>
                  )}
                </div>
                <button
                  onClick={handleSidebarCreateSession}
                  disabled={newSessionCreating || !newSessionName.trim() || sidebarWorkingDir.isBlocking}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors text-sm"
                >
                  {newSessionCreating ? 'Creating…' : 'Start Session'}
                </button>
              </>
            )}

            <button
              onClick={closeNewSessionModal}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* First-run onboarding modal */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-8 space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Welcome to Polyphon</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Tell us how you'd like to be addressed by your voices.
              </p>
            </div>

            <div className="space-y-5">
              {/* Avatar + color */}
              <div className="flex items-center gap-5">
                <div className="relative shrink-0 group/avatar">
                  <button
                    onClick={handleOnboardingPickAvatar}
                    aria-label="Upload photo"
                    style={!onboardingAvatar ? { backgroundColor: onboardingColor } : undefined}
                    className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    {onboardingAvatar ? (
                      <img src={onboardingAvatar} alt="Your avatar" className="w-full h-full object-cover" />
                    ) : (
                      <Wand2 size={26} strokeWidth={1.5} className="text-white/80" />
                    )}
                    <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                      <Camera size={18} strokeWidth={1.75} className="text-white" />
                    </span>
                  </button>
                  {onboardingAvatar && (
                    <button
                      onClick={() => setOnboardingAvatar('')}
                      aria-label="Remove photo"
                      className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-red-500 dark:hover:bg-red-500 text-gray-600 dark:text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                    >
                      <X size={10} strokeWidth={2.5} />
                    </button>
                  )}
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Choose display color for your voice
                    <HelpTooltip text="Your messages and icon appear in this color throughout Polyphon. It's reserved so no voice can share it." />
                  </label>
                  <ColorPicker value={onboardingColor} onChange={setOnboardingColor} includeGray />
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    What should we call you?
                    <HelpTooltip text="Voices will use this name when addressing you in conversation." />
                  </label>
                  <span className="text-xs text-gray-400">{onboardingName.length}/25</span>
                </div>
                <input
                  type="text"
                  value={onboardingName}
                  onChange={(e) => setOnboardingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onboardingName.trim() && handleOnboardingSave()}
                  placeholder="e.g. Corey"
                  maxLength={25}
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Your preferred pronouns
                  <HelpTooltip text="Injected into every voice's system prompt so they refer to you correctly." />
                </label>
                <select
                  value={onboardingPronouns}
                  onChange={(e) => setOnboardingPronouns(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select pronouns…</option>
                  <option value="she/her">she/her</option>
                  <option value="he/him">he/him</option>
                  <option value="they/them">they/them</option>
                  <option value="she/they">she/they</option>
                  <option value="he/they">he/they</option>
                  <option value="ze/zir">ze/zir</option>
                  <option value="xe/xem">xe/xem</option>
                  <option value="any/all">any/all</option>
                  <option value="prefer not to say">prefer not to say</option>
                </select>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    About you <span className="font-normal text-gray-400">(optional)</span>
                    <HelpTooltip text="Background context shared with every voice at the start of each session to help them tailor their responses." />
                  </label>
                  <span className="text-xs text-gray-400">{onboardingContext.length}/250</span>
                </div>
                <textarea
                  value={onboardingContext}
                  onChange={(e) => setOnboardingContext(e.target.value)}
                  placeholder="e.g. Senior backend engineer working on a distributed payments system."
                  rows={3}
                  maxLength={250}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Password protection */}
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onboardingPasswordEnabled}
                    onChange={(e) => {
                      setOnboardingPasswordEnabled(e.target.checked);
                      setOnboardingPasswordError('');
                      setOnboardingPassword('');
                      setOnboardingPasswordConfirm('');
                    }}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                    Password protect your data
                    <span className="font-normal text-gray-400">(optional)</span>
                    <HelpTooltip text="Your data is always encrypted, but without a password the encryption key is stored unprotected on disk. Setting a password encrypts the key itself for stronger protection." />
                  </span>
                </label>

                {onboardingPasswordEnabled && (
                  <div className="space-y-2 pl-6">
                    <input
                      type="password"
                      placeholder="Password"
                      value={onboardingPassword}
                      onChange={(e) => { setOnboardingPassword(e.target.value); setOnboardingPasswordError(''); }}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <PasswordStrengthGauge password={onboardingPassword} />
                    <input
                      type="password"
                      placeholder="Confirm password"
                      value={onboardingPasswordConfirm}
                      onChange={(e) => { setOnboardingPasswordConfirm(e.target.value); setOnboardingPasswordError(''); }}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <PasswordMatchIndicator pw={onboardingPassword} pw2={onboardingPasswordConfirm} />
                    {onboardingPasswordError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{onboardingPasswordError}</p>
                    )}
                    <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-3 py-2">
                      <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        If you forget your password, your encrypted data is unrecoverable. There is no reset or recovery mechanism.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleOnboardingSave}
                disabled={!onboardingName.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm"
              >
                Get started
              </button>
              <button
                onClick={handleOnboardingSkip}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding avatar editor */}
      {onboardingPendingAvatar && (
        <AvatarEditor
          src={onboardingPendingAvatar}
          onConfirm={(dataUrl) => {
            setOnboardingAvatar(dataUrl);
            setOnboardingPendingAvatar(null);
          }}
          onCancel={() => setOnboardingPendingAvatar(null)}
        />
      )}

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-hidden">
        {activeView === 'home' && (
          <Dashboard
            onOpenSession={handleOpenSession}
            onNewComposition={() => {
              setEditingComposition({});
              setView('composition-builder');
            }}
            onEditComposition={(c) => {
              setEditingComposition(c);
              setView('composition-builder');
            }}
            onSettings={() => setView('settings')}
          />
        )}

        {activeView === 'settings' && <SettingsPage />}

        {activeView === 'session' && (
          <>
            {activeSession ? (
              <SessionView
                session={activeSession}
                onBack={() => closeSession(activeSession.id)}
              />
            ) : (
              <SessionsList onOpenSession={handleOpenSession} />
            )}
          </>
        )}

        {activeView === 'composition-builder' && (
          <>
            {showBuilder ? (
              <CompositionBuilder
                initial={editingComposition}
                onSave={handleSaveComposition}
                onCancel={() => setEditingComposition(null)}
              />
            ) : (
              <CompositionsList
                onNew={() => setEditingComposition({})}
                onEdit={(c) => setEditingComposition(c)}
              />
            )}
          </>
        )}
      </main>
      </div>
    </div>
  );
}
