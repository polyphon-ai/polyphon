import React, { useEffect, useState } from 'react';
import { X, Download, RotateCcw, AlertTriangle } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

export default function UpdateBanner() {
  const updateAvailable = useUIStore((s) => s.updateAvailable);
  const downloadProgress = useUIStore((s) => s.updateDownloadProgress);
  const updateReadyToInstall = useUIStore((s) => s.updateReadyToInstall);
  const setUpdateAvailable = useUIStore((s) => s.setUpdateAvailable);
  const setUpdateDownloadProgress = useUIStore((s) => s.setUpdateDownloadProgress);
  const setUpdateReadyToInstall = useUIStore((s) => s.setUpdateReadyToInstall);
  const clearUpdate = useUIStore((s) => s.clearUpdate);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    // Handle the race: check finished before this component mounted
    window.polyphon.update.getState().then((info) => {
      if (info) setUpdateAvailable(info);
    });

    const unsubAvailable = window.polyphon.update.onAvailable((info) => {
      setDownloadError(null);
      setUpdateAvailable(info);
    });

    const unsubProgress = window.polyphon.update.onDownloadProgress((progress) => {
      setUpdateDownloadProgress(progress);
    });

    const unsubReady = window.polyphon.update.onReadyToInstall((info) => {
      setUpdateReadyToInstall(info);
    });

    const unsubError = window.polyphon.update.onError((message) => {
      setDownloadError(message);
    });

    return () => {
      unsubAvailable();
      unsubProgress();
      unsubReady();
      unsubError();
    };
  }, [setUpdateAvailable, setUpdateDownloadProgress, setUpdateReadyToInstall]);

  // "Restart & Install" state — download complete
  if (updateReadyToInstall) {
    const { version } = updateReadyToInstall;
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-green-700 text-white text-sm shrink-0">
        <span className="font-medium">Polyphon v{version} is ready to install</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => window.polyphon.update.install()}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-white text-green-800 font-medium hover:bg-green-50 transition-colors"
          >
            <RotateCcw size={14} strokeWidth={1.75} />
            Restart & Install
          </button>
          <button
            onClick={clearUpdate}
            aria-label="Install on next restart"
            className="p-1 rounded hover:bg-green-600 transition-colors"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    );
  }

  // Downloading state — show progress bar
  if (downloadProgress) {
    const pct = Math.round(downloadProgress.percent);
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-indigo-600 text-white text-sm shrink-0">
        <span className="font-medium shrink-0">Downloading update…</span>
        <div className="flex-1 bg-indigo-400/50 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-white h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums">{pct}%</span>
      </div>
    );
  }

  // Update available state — prompt to download
  if (!updateAvailable) return null;

  const { version } = updateAvailable;

  function handleDownload() {
    setDownloadError(null);
    window.polyphon.update.download();
  }

  function handleRemindLater() {
    window.polyphon.update.dismiss(version, false);
    clearUpdate();
  }

  function handleDismissPermanently() {
    window.polyphon.update.dismiss(version, true);
    clearUpdate();
  }

  if (downloadError) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-700 text-white text-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
          <span className="font-medium truncate">Update failed: {downloadError}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-white text-red-700 font-medium hover:bg-red-50 transition-colors"
          >
            <Download size={14} strokeWidth={1.75} />
            Retry
          </button>
          <button
            onClick={() => setDownloadError(null)}
            aria-label="Dismiss error"
            className="p-1 rounded hover:bg-red-600 transition-colors"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-indigo-600 text-white text-sm shrink-0">
      <span className="font-medium">Polyphon v{version} is available</span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-white text-indigo-700 font-medium hover:bg-indigo-50 transition-colors"
        >
          <Download size={14} strokeWidth={1.75} />
          Update Now
        </button>
        <button
          onClick={handleDismissPermanently}
          className="px-3 py-1 rounded hover:bg-indigo-500 transition-colors"
        >
          Skip this version
        </button>
        <button
          onClick={handleRemindLater}
          aria-label="Remind me later"
          className="p-1 rounded hover:bg-indigo-500 transition-colors"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
