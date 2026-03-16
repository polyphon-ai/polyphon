/**
 * generate-narration.ts
 *
 * Reads a *-cues.json file produced by take-videos.ts and uses Claude to write
 * one or two narration sentences per cue, then outputs a WebVTT subtitle file
 * that an AI TTS pipeline can consume directly.
 *
 * Usage:
 *   npx tsx scripts/generate-narration.ts                          # all cues files
 *   npx tsx scripts/generate-narration.ts <path/to/foo-cues.json>  # single file
 *   make narration
 *   make narration-walkthrough
 *
 * Output: alongside each *-cues.json → *-narration.vtt
 *
 * Requirements:
 *   ANTHROPIC_API_KEY must be set in the environment.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Cue {
  t: number;
  label: string;
  context: string;
}

interface NarratedCue extends Cue {
  endT: number;
  narration: string;
}

// ── Claude narration generation ───────────────────────────────────────────────

const client = new Anthropic();

async function generateNarration(cues: Cue[], videoTitle: string): Promise<NarratedCue[]> {
  // Skip cues whose window is too short to narrate without overlapping the next clip.
  // A clip needs at least MIN_WINDOW_S seconds to say anything meaningful and still
  // leave a clean gap before the following cue starts.
  const MIN_WINDOW_S = 2.5;
  const narratableCues = cues.filter((c, i) => {
    const next = cues[i + 1];
    const windowS = next ? next.t - c.t : Infinity;
    return windowS >= MIN_WINDOW_S;
  });

  const cueList = narratableCues
    .map((c, i) => {
      const next = narratableCues[i + 1] ?? cues[cues.indexOf(c) + 1];
      const windowS = next ? (next.t - c.t).toFixed(1) : '?';
      // Target word count: 75% of the available window at 2.5 wps gives the viewer
      // continuous narration without rushing, and avoids long silences mid-clip.
      const targetWords =
        windowS === '?'
          ? '10–15'
          : `~${Math.max(6, Math.round(parseFloat(windowS) * 2.5 * 0.75))}`;
      return `${i + 1}. [${c.t}s, ${windowS}s available, target ${targetWords} words] ${c.label}: ${c.context}`;
    })
    .join('\n');

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are writing narration for a screen recording of Polyphon — an Electron desktop app for orchestrating conversations between multiple AI voices simultaneously. The product tagline is "One chat. Many minds."

Video: "${videoTitle}"

Below are timestamped cues. Each cue describes what is happening on screen at that moment. Write natural-sounding narration for each cue. The narration will be read aloud by a text-to-speech voice, so it must:
- TARGET the word count shown — a speaker reads roughly 2.5 words per second, so hitting the target fills most of the available window and avoids dead-air silence while the video plays
- Use the available time to describe both WHAT the viewer sees and WHY it matters — longer windows let you explain the feature in more depth
- Sound natural when spoken, not robotic
- Use present tense
- Vary sentence structure — don't start every sentence the same way

Cues:
${cueList}

Respond with ONLY a JSON array — no prose, no markdown fences. Each element must have exactly these keys:
{ "label": "<the cue label>", "narration": "<the narration text>" }`,
      },
    ],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`No JSON array found in Claude response:\n${raw}`);

  const narrations: Array<{ label: string; narration: string }> = JSON.parse(jsonMatch[0]);
  const byLabel = new Map(narrations.map((n) => [n.label, n.narration]));

  return cues.map((cue, i) => {
    const next = cues[i + 1];
    // End time: next cue start minus a 0.1s gap, or estimate from word count
    const narrationText = byLabel.get(cue.label) ?? '';
    const wordCount = narrationText.split(/\s+/).filter(Boolean).length;
    const estimatedDuration = Math.max(2, wordCount / 2.5);
    const endT = next ? Math.max(cue.t + 1, next.t - 0.1) : cue.t + estimatedDuration;
    return { ...cue, endT: parseFloat(endT.toFixed(3)), narration: narrationText };
  });
}

// ── WebVTT formatting ─────────────────────────────────────────────────────────

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

function toWebVTT(cues: NarratedCue[]): string {
  const lines: string[] = ['WEBVTT', ''];
  for (const cue of cues) {
    if (!cue.narration.trim()) continue;
    lines.push(`NOTE ${cue.label}`);
    lines.push(`${formatVttTime(cue.t)} --> ${formatVttTime(cue.endT)}`);
    lines.push(cue.narration.trim());
    lines.push('');
  }
  return lines.join('\n');
}

// ── Per-file processing ───────────────────────────────────────────────────────

function deriveTitleFromPath(cuesPath: string): string {
  return path
    .basename(cuesPath, '-cues.json')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function processCuesFile(cuesPath: string): Promise<void> {
  const absPath = path.resolve(cuesPath);
  const cues: Cue[] = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const title = deriveTitleFromPath(absPath);

  console.log(`\nGenerating narration for: ${path.basename(absPath)} (${cues.length} cues)`);
  console.log(`  Video title: "${title}"`);

  const narrated = await generateNarration(cues, title);

  const vttPath = absPath.replace(/-cues\.json$/, '-narration.vtt');
  fs.writeFileSync(vttPath, toWebVTT(narrated), 'utf8');
  console.log(`  → ${path.basename(vttPath)}`);

  const jsonPath = absPath.replace(/-cues\.json$/, '-narrated.json');
  fs.writeFileSync(jsonPath, JSON.stringify(narrated, null, 2) + '\n', 'utf8');
  console.log(`  → ${path.basename(jsonPath)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  let targets: string[];

  if (args.length > 0) {
    targets = args;
  } else {
    // Discover all cues files under site/static/videos/
    const repoRoot = path.join(__dirname, '..');
    const pattern = path.join(repoRoot, 'site', 'static', 'videos', '**', '*-cues.json');
    targets = await glob(pattern);
    if (targets.length === 0) {
      console.error('\nNo *-cues.json files found. Run `make videos` first.\n');
      process.exit(1);
    }
    console.log(`Found ${targets.length} cues file(s).`);
  }

  for (const target of targets) {
    await processCuesFile(target);
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
