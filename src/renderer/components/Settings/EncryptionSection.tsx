import React, { useEffect, useState } from 'react';
import { Lock, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import type { EncryptionStatus } from '../../../shared/types';

type FormMode = 'idle' | 'set-password' | 'change-password' | 'remove-password';

function StatusBadge({ status }: { status: EncryptionStatus }) {
  if (status.mode === 'e2e-test') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Shield size={14} strokeWidth={1.75} />
        <span>Test mode (encryption disabled)</span>
      </div>
    );
  }
  if (status.passwordSet) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
        <Lock size={14} strokeWidth={1.75} />
        <span>Password-protected</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
      <CheckCircle size={14} strokeWidth={1.75} />
      <span>Protected by system keychain</span>
    </div>
  );
}

export default function EncryptionSection() {
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('idle');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwOld, setPwOld] = useState('');
  const [linuxNoticeDismissed, setLinuxNoticeDismissed] = useState(false);
  const [linuxNoticeVisible, setLinuxNoticeVisible] = useState(false);

  async function loadStatus() {
    try {
      const s = await window.polyphon.encryption.getStatus();
      setStatus(s);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadStatus();
    const unsub = window.polyphon.encryption.onLinuxNotice(() => {
      setLinuxNoticeVisible(true);
    });
    return () => { unsub(); };
  }, []);

  function resetForm() {
    setFormMode('idle');
    setError('');
    setSuccess('');
    setPw('');
    setPw2('');
    setPwOld('');
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw !== pw2) { setError('Passwords do not match.'); return; }
    if (!pw) { setError('Password is required.'); return; }
    try {
      await window.polyphon.encryption.setPassword(pw);
      setSuccess('Password set successfully.');
      resetForm();
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password.');
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw !== pw2) { setError('New passwords do not match.'); return; }
    if (!pw) { setError('New password is required.'); return; }
    try {
      await window.polyphon.encryption.changePassword(pwOld, pw);
      setSuccess('Password changed successfully.');
      resetForm();
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect current password or operation failed.');
    }
  }

  async function handleRemovePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!pw) { setError('Current password is required to confirm removal.'); return; }
    try {
      await window.polyphon.encryption.removePassword(pw);
      setSuccess('Password removed. Database key is now protected by the system keychain.');
      resetForm();
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect password or operation failed.');
    }
  }

  async function dismissLinuxNotice() {
    setLinuxNoticeDismissed(true);
    setLinuxNoticeVisible(false);
    await window.polyphon.encryption.dismissLinuxNotice();
    loadStatus();
  }

  if (!status) return null;

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Database Encryption</span>
          <StatusBadge status={status} />
        </div>

        {status.linuxBasicText && !status.passwordSet && !linuxNoticeDismissed && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">Weak keychain backend (basic_text). </span>
              Setting a password provides stronger at-rest protection on this system.
            </div>
          </div>
        )}

        {linuxNoticeVisible && !linuxNoticeDismissed && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
              <span>Polyphon is using a basic text keychain backend on this Linux system. Consider setting a password for stronger encryption.</span>
            </div>
            <button onClick={dismissLinuxNotice} className="shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400">Dismiss</button>
          </div>
        )}

        {formMode === 'idle' && status.mode !== 'e2e-test' && (
          <div className="flex gap-2 flex-wrap">
            {!status.passwordSet && (
              <button
                onClick={() => { setFormMode('set-password'); setError(''); setSuccess(''); }}
                className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Set password
              </button>
            )}
            {status.passwordSet && (
              <>
                <button
                  onClick={() => { setFormMode('change-password'); setError(''); setSuccess(''); }}
                  className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Change password
                </button>
                <button
                  onClick={() => { setFormMode('remove-password'); setError(''); setSuccess(''); }}
                  className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Remove password
                </button>
              </>
            )}
          </div>
        )}

        {success && formMode === 'idle' && (
          <p className="text-xs text-green-700 dark:text-green-400">{success}</p>
        )}
      </div>

      {/* Irrecoverability warning */}
      <div className="rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
        <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
        <span><strong>Warning:</strong> If you forget your password, your encrypted data is unrecoverable. There is no reset or recovery mechanism.</span>
      </div>

      {/* Set password form */}
      {formMode === 'set-password' && (
        <form onSubmit={handleSetPassword} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Set a password</p>
          <div className="space-y-2">
            <input
              type="password"
              placeholder="New password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Save</button>
            <button type="button" onClick={resetForm} className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Change password form */}
      {formMode === 'change-password' && (
        <form onSubmit={handleChangePassword} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Change password</p>
          <div className="space-y-2">
            <input
              type="password"
              placeholder="Current password"
              value={pwOld}
              onChange={(e) => setPwOld(e.target.value)}
              className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <input
              type="password"
              placeholder="New password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Save</button>
            <button type="button" onClick={resetForm} className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Remove password form */}
      {formMode === 'remove-password' && (
        <form onSubmit={handleRemovePassword} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Remove password</p>
          <input
            type="password"
            placeholder="Current password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors">Remove</button>
            <button type="button" onClick={resetForm} className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
