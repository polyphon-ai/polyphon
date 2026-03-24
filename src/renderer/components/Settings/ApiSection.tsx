import React, { useEffect, useState } from 'react';
import { Network, AlertTriangle, RotateCw, Eye, EyeOff, Copy, Check, Terminal } from 'lucide-react';
import type { ApiStatus } from '../../../shared/types';

export default function ApiSection() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [togglingRemote, setTogglingRemote] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateConfirm, setRotateConfirm] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.polyphon.api.getStatus().then((s) => {
      setStatus(s);
      setLoading(false);
    });

    const unsub = window.polyphon.api.onStatusChanged((s) => {
      setStatus(s);
    });
    return () => { unsub(); };
  }, []);

  // Fetch token when enabled
  useEffect(() => {
    if (status?.enabled) {
      window.polyphon.api.getToken().then(setToken);
    } else {
      setToken(null);
      setTokenVisible(false);
    }
  }, [status?.enabled, status?.tokenFingerprint]);

  const handleToggle = async () => {
    if (!status || toggling) return;
    setToggling(true);
    try {
      const updated = await window.polyphon.api.setEnabled(!status.enabled);
      setStatus(updated);
    } finally {
      setToggling(false);
    }
  };

  const handleRemoteToggle = async () => {
    if (!status || togglingRemote) return;
    setTogglingRemote(true);
    try {
      const updated = await window.polyphon.api.setRemoteAccess(!status.remoteAccessEnabled);
      setStatus(updated);
    } finally {
      setTogglingRemote(false);
    }
  };

  const handleRotate = async () => {
    if (rotating) return;
    if (!rotateConfirm) {
      setRotateConfirm(true);
      setTimeout(() => setRotateConfirm(false), 5000);
      return;
    }
    setRotateConfirm(false);
    setRotating(true);
    setTokenVisible(false);
    try {
      const updated = await window.polyphon.api.rotateToken();
      setStatus(updated);
    } finally {
      setRotating(false);
    }
  };

  const handleCopyToken = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 py-4">
        Loading API status…
      </div>
    );
  }

  const isEnabled = status?.enabled ?? false;
  const isRunning = status?.running ?? false;
  const isRemote = status?.remoteAccessEnabled ?? false;
  const port = status?.port ?? 7432;
  const host = isRemote ? '0.0.0.0' : '127.0.0.1';

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Network size={16} strokeWidth={1.75} className="text-gray-500 dark:text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              API Server
            </span>
            {isRunning ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 rounded px-1.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                Running on {host}:{port}
              </span>
            ) : isEnabled ? (
              <span className="text-xs text-gray-400 dark:text-gray-500">Stopped</span>
            ) : null}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Expose a local JSON-RPC server so scripts and terminal tools can control Polyphon without opening the UI.
          </p>
          {status?.startupError && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle size={12} strokeWidth={1.75} />
              {status.startupError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          aria-checked={isEnabled}
          role="switch"
          className={[
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
            isEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700',
            toggling ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          <span
            className={[
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              isEnabled ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      {/* CLI info — always visible */}
      <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Terminal size={14} strokeWidth={1.75} className="text-gray-500 dark:text-gray-400 shrink-0" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">poly CLI</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          <code className="font-mono text-gray-700 dark:text-gray-300">poly</code> is a companion command-line tool
          for scripting Polyphon from your terminal or CI pipeline — list compositions, start sessions, stream
          voice responses, export transcripts, and more.
        </p>
        <div className="space-y-1.5">
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">Install</p>
          <code className="block font-mono text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded px-3 py-2">
            npm install -g @polyphon-ai/poly
          </code>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">Usage</p>
          <div className="font-mono text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded px-3 py-2 space-y-1">
            <div>poly status</div>
            <div>poly compositions list</div>
            <div>poly run --composition &lt;id&gt; --prompt "…" --stream</div>
            <div>poly sessions export &lt;id&gt; --format markdown</div>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          When the API server is active, <code className="font-mono">poly</code> connects automatically —
          no extra configuration needed.
        </p>
      </div>

      {isEnabled && (
        <>
          {/* API Key */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">API Key</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This key authenticates every connection to the API server. Treat it like a password —
                don't share it or check it into version control.
              </p>
            </div>

            {/* Token display */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <code className="flex-1 font-mono text-xs text-gray-700 dark:text-gray-300 min-w-0 truncate select-all">
                  {token
                    ? (tokenVisible ? token : '•'.repeat(24) + token.slice(-8))
                    : '…loading'}
                </code>
                <button
                  type="button"
                  onClick={() => setTokenVisible((v) => !v)}
                  title={tokenVisible ? 'Hide key' : 'Reveal key'}
                  className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {tokenVisible
                    ? <EyeOff size={14} strokeWidth={1.75} />
                    : <Eye size={14} strokeWidth={1.75} />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyToken}
                  title="Copy key"
                  className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {copied
                    ? <Check size={14} strokeWidth={1.75} className="text-green-500" />
                    : <Copy size={14} strokeWidth={1.75} />}
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
              Full key stored in <code className="font-mono">api.key</code> in the Polyphon app data directory.
              The <code className="font-mono">poly</code> CLI reads it automatically on macOS, Linux, and Windows.
            </p>

            {/* Rotate */}
            <div className="flex items-center justify-between gap-4">
              <div>
                {rotateConfirm && (
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle size={12} strokeWidth={1.75} />
                    Rotates the key and disconnects all active connections. Click again to confirm.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleRotate}
                disabled={rotating}
                className={[
                  'shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors',
                  rotateConfirm
                    ? 'border-red-300 text-red-600 bg-red-50 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:bg-red-950/30 dark:hover:bg-red-950/60'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                  rotating ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <RotateCw size={12} strokeWidth={1.75} className={rotating ? 'animate-spin' : ''} />
                {rotateConfirm ? 'Confirm rotate' : 'Rotate key'}
              </button>
            </div>
          </div>

          {/* Remote access toggle */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5">
                  Remote Access
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Bind to <code className="font-mono">0.0.0.0</code> instead of <code className="font-mono">127.0.0.1</code>{' '}
                  so other machines on your network can connect. Requires TLS termination (nginx, Caddy) to encrypt traffic.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoteToggle}
                disabled={togglingRemote}
                aria-checked={isRemote}
                role="switch"
                className={[
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
                  isRemote ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700',
                  togglingRemote ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    isRemote ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>

            {isRemote && (
              <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
                <span>
                  Remote access exposes the API to your network without encryption. Add TLS termination
                  (nginx, Caddy) before exposing to untrusted networks. The API key is the only
                  authentication mechanism.
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
