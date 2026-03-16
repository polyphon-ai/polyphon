import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

const DOWNLOAD_URL = 'https://polyphon.ai/#download';

export default function UpdateBanner() {
  const updateAvailable = useUIStore((s) => s.updateAvailable);
  const setUpdateAvailable = useUIStore((s) => s.setUpdateAvailable);
  const clearUpdate = useUIStore((s) => s.clearUpdate);

  useEffect(() => {
    // Handle the race: check finished before this component mounted
    window.polyphon.update.getState().then((info) => {
      if (info) setUpdateAvailable(info);
    });

    // Subscribe to future push events
    const unsubscribe = window.polyphon.update.onAvailable((info) => {
      setUpdateAvailable(info);
    });

    return unsubscribe;
  }, [setUpdateAvailable]);

  if (!updateAvailable) return null;

  const { version } = updateAvailable;

  function handleRemindLater() {
    window.polyphon.update.dismiss(version, false);
    clearUpdate();
  }

  function handleDismissPermanently() {
    window.polyphon.update.dismiss(version, true);
    clearUpdate();
  }

  function handleDownload() {
    window.polyphon.shell.openExternal(DOWNLOAD_URL);
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
          Download
        </button>
        <button
          onClick={handleDismissPermanently}
          className="px-3 py-1 rounded hover:bg-indigo-500 transition-colors"
        >
          Don't remind me again
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
