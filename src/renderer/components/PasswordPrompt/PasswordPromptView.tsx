import React, { useRef, useState } from 'react';
import { Lock } from 'lucide-react';

export default function PasswordPromptView() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || unlocking) return;
    setError('');
    setUnlocking(true);

    try {
      const result = await window.polyphon.encryption.unlockAttempt(password);
      if (result.ok) {
        // Main process will close this window and open the main window
        setPassword('');
      } else {
        setError(result.error ?? 'Incorrect password. Please try again.');
        setPassword('');
        setUnlocking(false);
        inputRef.current?.focus();
      }
    } catch {
      setError('An error occurred. Please try again.');
      setPassword('');
      setUnlocking(false);
    }
  }

  function handleQuit() {
    // Closes the unlock window which triggers app.quit() in the main process
    window.close();
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
            <Lock size={20} strokeWidth={1.75} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Polyphon</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Enter your password to unlock</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            disabled={unlocking}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password || unlocking}
            className="w-full py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {unlocking ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>

        <button
          onClick={handleQuit}
          className="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          Quit Polyphon
        </button>
      </div>
    </div>
  );
}
