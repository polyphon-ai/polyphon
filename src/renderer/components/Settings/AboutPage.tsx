import React, { useEffect, useState } from 'react';
import type { ExpiryStatus } from '../../../shared/types';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

function Countdown({ expiryTimestamp }: { expiryTimestamp: number }) {
  const [msRemaining, setMsRemaining] = useState(() =>
    Math.max(0, expiryTimestamp - Date.now()),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setMsRemaining(Math.max(0, expiryTimestamp - Date.now()));
    }, 60_000);
    return () => clearInterval(id);
  }, [expiryTimestamp]);

  const days = Math.floor(msRemaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor(msRemaining / (60 * 60 * 1000));
  const showHours = days < 2;

  let label: string;
  if (showHours) {
    label = hours === 0 ? 'Expired' : `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    label = `${days} day${days !== 1 ? 's' : ''}`;
  }

  return (
    <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
  );
}

export default function AboutPage({ status }: { status: ExpiryStatus | null }) {
  const version =
    typeof (globalThis as any).__APP_VERSION__ !== 'undefined'
      ? (globalThis as any).__APP_VERSION__
      : status?.version ?? 'unknown';

  const buildDate =
    status && status.buildTimestamp > 0 ? formatDate(status.buildTimestamp) : '—';

  function handleDownload() {
    if (status?.downloadUrl) {
      window.polyphon.shell.openExternal(status.downloadUrl);
    }
  }

  if (status === null) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500">Loading…</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Polyphon</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Version {version}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Build date: {buildDate}</p>
      </div>

      {status.channel === 'release' ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You're running a release build.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
              {status.channel === 'alpha' ? 'Alpha Build' : 'Beta Build'}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Expires on</span>
              <span className="text-gray-900 dark:text-gray-100">
                {formatDate(status.expiryTimestamp)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Time remaining</span>
              {status.expired ? (
                <span className="font-medium text-red-600 dark:text-red-400">Expired</span>
              ) : (
                <Countdown expiryTimestamp={status.expiryTimestamp} />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={handleDownload}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
            >
              Download the latest build →
            </button>
            <button
              onClick={() => {
                // TODO: wire to feedback URL before first alpha release
              }}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
            >
              Share feedback
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
