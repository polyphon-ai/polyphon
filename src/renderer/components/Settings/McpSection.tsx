import React, { useEffect, useState } from 'react';
import { Server, AlertTriangle, Copy, Check } from 'lucide-react';
import type { McpStatus } from '../../../shared/types';

export default function McpSection() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.polyphon.mcp.getStatus().then((s) => {
      setStatus(s);
      setLoading(false);
    });

    const unsub = window.polyphon.mcp.onStatusChanged((s) => {
      setStatus(s);
    });
    return () => { unsub(); };
  }, []);

  const handleToggle = async () => {
    if (!status || toggling) return;
    setToggling(true);
    try {
      const updated = await window.polyphon.mcp.setEnabled(!status.enabled);
      setStatus(updated);
    } finally {
      setToggling(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText('polyphon --mcp-server --headless').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 py-4">
        Loading MCP status…
      </div>
    );
  }

  const isRunning = status?.running ?? false;
  const isEnabled = status?.enabled ?? false;

  return (
    <div className="space-y-4">
      {/* Toggle row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Server size={16} strokeWidth={1.75} className="text-gray-500 dark:text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              MCP Server
            </span>
            {isRunning && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 rounded px-1.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                Running
              </span>
            )}
            {!isRunning && isEnabled && (
              <span className="text-xs text-gray-400 dark:text-gray-500">Stopped</span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Expose Polyphon as an MCP tool server for Claude Code, Cursor, and other AI agents.
            When enabled, the server auto-starts on next launch.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          aria-checked={isEnabled}
          role="switch"
          className={[
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
            isEnabled
              ? 'bg-indigo-600'
              : 'bg-gray-200 dark:bg-gray-700',
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

      {/* Warning when write-capable tools could be invoked */}
      <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
        <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
        <span>
          MCP agents can use any tools enabled on a composition's voices, including{' '}
          <code className="font-mono">write_file</code> and{' '}
          <code className="font-mono">run_command</code>. Only enable if you trust the agents connecting to this server.
        </span>
      </div>

      {/* Connect instructions */}
      {isRunning && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Connect an MCP client:</p>
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
            <code className="flex-1 text-xs font-mono text-gray-800 dark:text-gray-200 select-all">
              polyphon --mcp-server --headless
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              title="Copy command"
            >
              {copied
                ? <Check size={14} strokeWidth={1.75} className="text-green-500" />
                : <Copy size={14} strokeWidth={1.75} />
              }
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Add this as an MCP server in your Claude Code, Cursor, or other agent configuration.
            Replace <code className="font-mono">polyphon</code> with the full path to the app binary if needed.
          </p>
        </div>
      )}
    </div>
  );
}
