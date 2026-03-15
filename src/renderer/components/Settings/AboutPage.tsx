import React, { useEffect, useState } from 'react';
import { ExternalLink, Download, Music2, Bug, Lightbulb, MessageSquare, ShieldAlert } from 'lucide-react';
import type { ExpiryStatus } from '../../../shared/types';
import wordmarkLightUrl from '../../../../assets/wordmark-light.svg?url';
import wordmarkDarkUrl from '../../../../assets/wordmark-dark.svg?url';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
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
    <span className="font-medium text-[var(--color-text-primary)]">{label}</span>
  );
}

// Animated waveform bars — references the @keyframes waveform in index.css
function WaveformBars({ urgency = 'normal' }: { urgency?: 'normal' | 'warning' | 'critical' }) {
  const color =
    urgency === 'critical'
      ? 'var(--color-danger)'
      : urgency === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-brand)';

  const heights = [10, 16, 24, 18, 12, 20, 14];
  const delays = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9];

  return (
    <div className="flex items-end gap-[2px]" style={{ height: 24 }} aria-hidden>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 2,
            background: color,
            animation: `waveform 1.2s ease-in-out ${delays[i]}s infinite`,
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </div>
  );
}

const GLOSSARY: Array<{ term: string; description: string }> = [
  {
    term: 'Voice',
    description: 'An AI agent participating in your session. Each voice has its own provider, model, and personality.',
  },
  {
    term: 'Session',
    description: 'A conversation thread where voices respond to you and to each other in real time.',
  },
  {
    term: 'Composition',
    description: 'A saved configuration of voices. Load a composition to instantly recreate your preferred ensemble.',
  },
  {
    term: 'Round',
    description: 'One full cycle in which every voice in the session has responded.',
  },
  {
    term: 'Conductor',
    description: 'You. The human directing the ensemble, setting the tone, and guiding the conversation.',
  },
  {
    term: 'Tone',
    description: 'A personality preset that shapes how a voice communicates — its style, formality, and approach. Applied per-voice in a composition.',
  },
  {
    term: 'Broadcast',
    description: 'A session mode where your message is sent to all voices at once. The alternative is directing a message at a specific voice.',
  },
  {
    term: 'Directed',
    description: 'A session mode where you address one voice at a time. Only the targeted voice responds, keeping the conversation focused.',
  },
  {
    term: 'Provider',
    description: 'The AI service powering a voice — Anthropic, OpenAI, Gemini, a local CLI tool, or a custom OpenAI-compatible endpoint.',
  },
];

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

  function handleDocs() {
    window.polyphon.shell.openExternal('https://polyphon.ai/docs');
  }

  // Urgency tier for expiry display
  const urgency =
    status && !status.expired
      ? status.daysRemaining <= 2
        ? 'critical'
        : status.daysRemaining <= 7
          ? 'warning'
          : 'normal'
      : 'critical';

  const isPreRelease = status?.channel === 'alpha' || status?.channel === 'beta';
  const isDev = status?.channel === 'dev';

  if (status === null) {
    return (
      <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>
    );
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
              {isPreRelease && (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background:
                      status.channel === 'alpha'
                        ? 'oklch(95% 0.05 45)'
                        : 'oklch(95% 0.05 148)',
                    color:
                      status.channel === 'alpha'
                        ? 'oklch(48% 0.18 45)'
                        : 'oklch(40% 0.16 148)',
                    border: `1px solid ${status.channel === 'alpha' ? 'oklch(85% 0.08 45)' : 'oklch(85% 0.08 148)'}`,
                  }}
                >
                  {status.channel === 'alpha' ? 'Alpha Build' : 'Beta Build'}
                </span>
              )}
              {isDev && (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: 'oklch(95% 0.03 255)',
                    color: 'oklch(45% 0.12 255)',
                    border: '1px solid oklch(85% 0.06 255)',
                  }}
                >
                  Dev Build
                </span>
              )}
            </div>

            <p
              className="mt-1 text-sm italic"
              style={{ color: 'var(--color-text-muted)' }}
            >
              One chat. Many minds.
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

      {/* ── Glossary ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Music2
            size={14}
            strokeWidth={1.75}
            style={{ color: 'var(--color-text-muted)' }}
          />
          <h3
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-text-muted)' }}
          >
            The Ensemble
          </h3>
        </div>

        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: '1px solid var(--color-border)',
          }}
        >
          {GLOSSARY.map((entry, i) => (
            <div
              key={entry.term}
              className="flex gap-3 px-4 py-3 text-sm"
              style={{
                background: i % 2 === 0 ? 'var(--color-surface-raised)' : 'var(--color-surface)',
                borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
              }}
            >
              <div className="shrink-0 w-24">
                <span
                  className="font-semibold"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {entry.term}
                </span>
              </div>
              <p style={{ color: 'var(--color-text-secondary)' }} className="leading-snug">
                {entry.description}
              </p>
            </div>
          ))}
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

      {/* ── Build info / expiry ──────────────────────────────────────── */}
      {status.channel === 'release' || status.channel === 'dev' ? (
        <div
          className="rounded-xl p-4"
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {status.channel === 'dev'
              ? 'You\'re running a development build.'
              : 'You\'re running a release build.'}
          </p>
          {status.channel !== 'dev' && (
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Built {buildDate}
            </p>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: `1px solid ${urgency === 'critical' ? 'var(--color-danger)' : urgency === 'warning' ? 'var(--color-warning)' : 'var(--color-border)'}`,
          }}
        >
          {/* Expiry header */}
          <div
            className="px-4 pt-4 pb-3 flex items-center justify-between"
            style={{
              background:
                urgency === 'critical'
                  ? 'oklch(from var(--color-danger) l c h / 0.06)'
                  : urgency === 'warning'
                    ? 'oklch(from var(--color-warning) l c h / 0.06)'
                    : 'var(--color-surface-raised)',
            }}
          >
            <div className="flex items-center gap-2">
              <WaveformBars urgency={urgency} />
              <div>
                <p
                  className="text-sm font-semibold leading-none"
                  style={{
                    color:
                      urgency === 'critical'
                        ? 'var(--color-danger)'
                        : urgency === 'warning'
                          ? 'var(--color-warning)'
                          : 'var(--color-text-primary)',
                  }}
                >
                  {status.expired ? 'Build expired' : 'Time remaining'}
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Expires {formatDate(status.expiryTimestamp)}
                </p>
              </div>
            </div>

            <div className="text-right">
              <p
                className="text-2xl font-semibold tabular-nums leading-none"
                style={{
                  color:
                    urgency === 'critical'
                      ? 'var(--color-danger)'
                      : urgency === 'warning'
                        ? 'var(--color-warning)'
                        : 'var(--color-brand)',
                }}
              >
                {status.expired ? (
                  'Expired'
                ) : (
                  <Countdown expiryTimestamp={status.expiryTimestamp} />
                )}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Built {buildDate}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          {!status.expired && (
            <div
              style={{
                height: 3,
                background: 'var(--color-border)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (status.daysRemaining / 28) * 100)}%`,
                  background:
                    urgency === 'critical'
                      ? 'var(--color-danger)'
                      : urgency === 'warning'
                        ? 'var(--color-warning)'
                        : 'var(--color-brand)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          )}

          {/* Actions */}
          <div
            className="px-4 py-3 flex flex-col gap-2"
            style={{ background: 'var(--color-surface-raised)' }}
          >
            <p
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Alpha builds expire 28 days after release. Download the latest to keep going.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus-ring"
                style={{ background: 'var(--color-brand)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-brand-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-brand)';
                }}
              >
                <Download size={14} strokeWidth={1.75} />
                Download latest build
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
