import React, { useState, useEffect } from 'react';
import type { UpdateChannel } from '../../../shared/types';
import { ExternalLink, Bug, Lightbulb, MessageSquare, ShieldAlert, RefreshCw, CheckCircle, Download, RotateCcw, ChevronDown } from 'lucide-react';
import wordmarkLightUrl from '../../../../assets/wordmark-light.svg?url';
import wordmarkDarkUrl from '../../../../assets/wordmark-dark.svg?url';


type CheckState = 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'downloading' | 'ready';

export default function AboutPage() {
  const version =
    typeof (globalThis as any).__APP_VERSION__ !== 'undefined'
      ? (globalThis as any).__APP_VERSION__
      : 'unknown';

  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [channel, setChannel] = useState<UpdateChannel>('stable');

  useEffect(() => {
    window.polyphon.update.getChannel().then(setChannel);
  }, []);

  async function handleChannelChange(next: UpdateChannel) {
    setChannel(next);
    // Clear any stale update notification — channel change triggers a fresh check
    setCheckState('idle');
    setAvailableVersion(null);
    await window.polyphon.update.setChannel(next);
  }

  function handleDocs() {
    window.polyphon.shell.openExternal('https://polyphon.ai/docs');
  }

  async function handleCheckNow() {
    setCheckState('checking');
    try {
      const result = await window.polyphon.update.checkNow();
      if (result) {
        setAvailableVersion(result.version);
        setCheckState('update-available');
      } else {
        setCheckState('up-to-date');
      }
    } catch {
      setCheckState('idle');
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5 relative overflow-hidden"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Decorative staff lines */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden
          style={{ opacity: 0.04 }}
        >
          {[20, 32, 44, 56, 68].map((pct) => (
            <div
              key={pct}
              style={{
                position: 'absolute',
                top: `${pct}%`,
                left: 0,
                right: 0,
                height: 1,
                background: 'var(--color-text-primary)',
              }}
            />
          ))}
        </div>

        <div className="relative flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <img src={wordmarkLightUrl} alt="Polyphon" className="h-14 dark:hidden" />
              <img src={wordmarkDarkUrl} alt="Polyphon" className="h-14 hidden dark:block" />
              <span
                className="text-xs font-mono px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--color-brand-light)',
                  color: 'var(--color-brand)',
                  border: '1px solid color-mix(in oklch, var(--color-brand) 20%, transparent)',
                }}
              >
                v{version}
              </span>
            </div>

            <p
              className="mt-1 text-sm italic"
              style={{ color: 'var(--color-text-muted)' }}
            >
              One chat. Many voices.
            </p>

            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Polyphon is a desktop app for orchestrating conversations between
              multiple AI agents simultaneously. Agents respond to you and to each
              other — like an ensemble playing in harmony, with you as conductor.
            </p>
          </div>
        </div>
      </div>

      {/* ── Updates ──────────────────────────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Check for updates row */}
        <div className="p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Updates
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {checkState === 'idle' || checkState === 'checking'
              ? 'Check for the latest version'
              : checkState === 'update-available' && availableVersion
              ? `v${availableVersion} is available`
              : `Currently on v${version}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {checkState === 'up-to-date' && (
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                background: 'color-mix(in oklch, #10b981 12%, transparent)',
                color: '#10b981',
                border: '1px solid color-mix(in oklch, #10b981 30%, transparent)',
              }}
            >
              <CheckCircle size={13} strokeWidth={1.75} />
              No updates available
            </span>
          )}
          {checkState === 'update-available' && availableVersion && (
            <button
              onClick={() => {
                setCheckState('downloading');
                window.polyphon.update.download().then(() => setCheckState('ready')).catch(() => setCheckState('update-available'));
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-ring"
              style={{
                background: 'var(--color-brand)',
                color: '#fff',
                border: '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '0.88';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              }}
            >
              <Download size={13} strokeWidth={1.75} />
              Update Now
            </button>
          )}
          {checkState === 'downloading' && (
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                background: 'color-mix(in oklch, var(--color-brand) 12%, transparent)',
                color: 'var(--color-brand)',
                border: '1px solid color-mix(in oklch, var(--color-brand) 30%, transparent)',
              }}
            >
              <RefreshCw size={13} strokeWidth={1.75} className="animate-spin" />
              Downloading…
            </span>
          )}
          {checkState === 'ready' && (
            <button
              onClick={() => window.polyphon.update.install()}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-ring"
              style={{
                background: '#10b981',
                color: '#fff',
                border: '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '0.88';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              }}
            >
              <RotateCcw size={13} strokeWidth={1.75} />
              Restart & Install
            </button>
          )}
          <button
            onClick={handleCheckNow}
            disabled={checkState === 'checking'}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--color-surface-overlay)',
              border: '1px solid var(--color-border-strong)',
              color: 'var(--color-text-primary)',
            }}
            onMouseEnter={(e) => {
              if (checkState !== 'checking') {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-brand-light)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-brand)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-brand)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-overlay)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border-strong)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)';
            }}
          >
            <RefreshCw
              size={13}
              strokeWidth={1.75}
              className={checkState === 'checking' ? 'animate-spin' : ''}
            />
            {checkState === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
        </div>

        {/* Channel selector row */}
        <div
          className="flex items-center justify-between gap-4 px-4 py-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Update channel
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {channel === 'stable'
                ? 'Receive only stable releases'
                : 'Receive stable and pre-release builds'}
            </p>
          </div>
          <div className="relative shrink-0">
            <select
              value={channel}
              onChange={(e) => handleChannelChange(e.target.value as UpdateChannel)}
              className="text-sm rounded-lg pl-2.5 pr-7 py-1.5 focus-ring appearance-none cursor-pointer"
              style={{
                background: 'var(--color-surface-overlay)',
                border: '1px solid var(--color-border-strong)',
                color: 'var(--color-text-primary)',
                minWidth: '7rem',
              }}
            >
              <option value="stable">Stable</option>
              <option value="preview">Preview</option>
            </select>
            <ChevronDown
              size={13}
              strokeWidth={1.75}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-muted)' }}
            />
          </div>
        </div>
      </div>

      {/* ── Resources ────────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-4 flex items-center justify-between gap-4"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Documentation
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Guides, provider setup, and configuration reference
          </p>
        </div>
        <button
          onClick={handleDocs}
          className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-ring"
          style={{
            background: 'var(--color-surface-overlay)',
            border: '1px solid var(--color-border-strong)',
            color: 'var(--color-text-primary)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-brand-light)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-brand)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-brand)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-overlay)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border-strong)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)';
          }}
        >
          polyphon.ai
          <ExternalLink size={13} strokeWidth={1.75} />
        </button>
      </div>

      {/* ── Community ────────────────────────────────────────────────── */}
      <div>
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--color-border)' }}
        >
          {[
            {
              icon: <Bug size={14} strokeWidth={1.75} />,
              label: 'File a bug',
              description: 'Report unexpected behavior or crashes',
              url: 'https://github.com/polyphon-ai/releases/issues/new?template=bug_report.md',
            },
            {
              icon: <Lightbulb size={14} strokeWidth={1.75} />,
              label: 'Request a feature',
              description: 'Suggest improvements or new capabilities',
              url: 'https://github.com/polyphon-ai/releases/issues/new?template=feature_request.md',
            },
            {
              icon: <MessageSquare size={14} strokeWidth={1.75} />,
              label: 'Join the discussion',
              description: 'Ask questions, share ideas, and connect with others',
              url: 'https://github.com/polyphon-ai/releases/discussions',
            },
            {
              icon: <ShieldAlert size={14} strokeWidth={1.75} />,
              label: 'Report a vulnerability',
              description: 'Privately disclose a security issue',
              url: 'https://github.com/polyphon-ai/releases/security/advisories/new',
            },
          ].map((item, i) => (
            <button
              key={item.label}
              onClick={() => window.polyphon.shell.openExternal(item.url)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors focus-ring"
              style={{
                background: i % 2 === 0 ? 'var(--color-surface-raised)' : 'var(--color-surface)',
                borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
                color: 'var(--color-text-primary)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-brand-light)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  i % 2 === 0 ? 'var(--color-surface-raised)' : 'var(--color-surface)';
              }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {item.label}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {item.description}
                </p>
              </div>
              <ExternalLink size={13} strokeWidth={1.75} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Social ───────────────────────────────────────────────────── */}
      <button
        onClick={() => window.polyphon.shell.openExternal('https://x.com/PolyphonAI')}
        className="w-full flex items-center gap-2 rounded-xl px-4 py-3 transition-colors focus-ring"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-brand-light)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-brand)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-raised)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)';
        }}
      >
        <span style={{ color: 'var(--color-text-muted)' }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14} aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </span>
        <div className="text-left min-w-0">
          <p className="text-xs font-medium leading-none" style={{ color: 'var(--color-text-primary)' }}>
            @PolyphonAI
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            X / Twitter
          </p>
        </div>
        <ExternalLink size={12} strokeWidth={1.75} style={{ color: 'var(--color-text-muted)', marginLeft: 'auto', flexShrink: 0 }} />
      </button>

    </div>
  );
}
