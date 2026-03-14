import React, { useEffect, useRef } from 'react';
import type { ExpiryStatus } from '../../../shared/types';
import wordmarkLightUrl from '../../../../assets/wordmark-light.svg?url';
import wordmarkDarkUrl from '../../../../assets/wordmark-dark.svg?url';

function ChannelBadge({ channel }: { channel: 'alpha' | 'beta' | 'release' }) {
  const label = channel === 'alpha' ? 'Alpha Build' : 'Beta Build';
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
      {label}
    </span>
  );
}

export default function ExpiryScreen({ status }: { status: ExpiryStatus }) {
  const downloadRef = useRef<HTMLButtonElement>(null);

  // Focus download button on mount for keyboard accessibility
  useEffect(() => {
    downloadRef.current?.focus();
  }, []);

  const buildDate = new Date(status.buildTimestamp).toLocaleDateString();
  const expiryDate = new Date(status.expiryTimestamp).toLocaleDateString();

  function handleDownload() {
    window.polyphon.shell.openExternal(status.downloadUrl);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-950 p-8 font-sans">
      <div className="flex flex-col items-center gap-6 max-w-md w-full text-center">
        {/* Wordmark */}
        <img
          src={wordmarkLightUrl}
          alt="Polyphon"
          className="h-8 dark:hidden"
        />
        <img
          src={wordmarkDarkUrl}
          alt="Polyphon"
          className="h-8 hidden dark:block"
        />

        <ChannelBadge channel={status.channel} />

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            This build has expired
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Alpha and Beta builds expire after 28 days to ensure you're always on a current version.
          </p>
        </div>

        <div className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Build date</span>
            <span className="text-gray-900 dark:text-gray-100">{buildDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Expired on</span>
            <span className="text-gray-900 dark:text-gray-100">{expiryDate}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <button
            ref={downloadRef}
            onClick={handleDownload}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
          >
            Download the latest build →
          </button>
          <button
            onClick={() => {
              // TODO: wire to feedback URL before first alpha release
            }}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
          >
            Share feedback
          </button>
        </div>
      </div>
    </div>
  );
}
