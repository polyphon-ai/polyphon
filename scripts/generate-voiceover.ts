/**
 * generate-voiceover.ts
 *
 * Reads *-narration.vtt files produced by generate-narration.ts, synthesizes
 * per-cue audio with the OpenAI TTS API, then mixes the result into the source
 * MP4 to produce *-with-voice.mp4.
 *
 * Usage:
 *   npx tsx scripts/generate-voiceover.ts [options] [path/to/foo-narration.vtt ...]
 *   make voiceover
 *   make voiceover-docs
 *   make voiceover-walkthrough
 *
 * Options:
 *   --voice <name>   TTS voice to use (default: nova)
 *                    Choices: alloy  ash  ballad  coral  echo  fable
 *                             nova  onyx  sage  shimmer  verse
 *   --model <name>   TTS model to use (default: tts-1-hd)
 *                    Choices: tts-1  tts-1-hd  gpt-4o-mini-tts
 *
 * Output: alongside each *-narration.vtt → *-with-voice.mp4
 *
 * Requirements:
 *   OPENAI_API_KEY must be set in the environment.
 *   ffmpeg must be installed (brew install ffmpeg).
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { glob } from 'glob';
import os from 'os';
import { randomUUID } from 'crypto';

// ── Types & constants ──────────────────────────────────────────────────────────

const VALID_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
  'nova', 'onyx', 'sage', 'shimmer', 'verse',
] as const;
type Voice = (typeof VALID_VOICES)[number];

interface VttCue {
  label: string;
  startS: number;
  endS: number;
  text: string;
}

interface ScheduledClip {
  path: string;
  startS: number;
  durationS: number;
  label: string;
}

// ── VTT parsing ───────────────────────────────────────────────────────────────

function parseVttTime(t: string): number {
  const [h, m, s] = t.trim().split(':');
  return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
}

function parseVtt(vttPath: string): VttCue[] {
  const content = fs.readFileSync(vttPath, 'utf8');
  const cues: VttCue[] = [];

  for (const block of content.split(/\n{2,}/)) {
    const lines = block.trim().split('\n');
    let label = '';
    let startS = 0;
    let endS = 0;
    const textLines: string[] = [];
    let foundTime = false;

    for (const line of lines) {
      if (line.startsWith('NOTE ')) {
        label = line.slice(5).trim();
      } else if (!foundTime && line.includes(' --> ')) {
        const [a, b] = line.split(' --> ');
        startS = parseVttTime(a);
        endS = parseVttTime(b);
        foundTime = true;
      } else if (foundTime && line.trim()) {
        textLines.push(line.trim());
      }
    }

    if (foundTime && textLines.length > 0) {
      cues.push({ label, startS, endS, text: textLines.join(' ') });
    }
  }

  return cues;
}

// ── TTS ───────────────────────────────────────────────────────────────────────

// TTS pronunciation fixes — applied only to the audio input, not the VTT files.
// "Polyphon" without a trailing 'e' is misread as "poly-fon"; "Polyphone" gets it right.
function applyPronunciationFixes(text: string): string {
  return text.replace(/\bPolyphon\b/g, 'Polyphone');
}

async function synthesizeCue(
  client: OpenAI,
  text: string,
  outPath: string,
  voice: Voice,
  model: string,
): Promise<void> {
  const response = await client.audio.speech.create({
    model,
    voice,
    input: applyPronunciationFixes(text),
    response_format: 'mp3',
  });
  const buf = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

// ── Audio duration ────────────────────────────────────────────────────────────

function getMediaDuration(clipPath: string): number {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', clipPath],
    { encoding: 'utf8' },
  );
  return parseFloat(result.stdout.trim());
}

// ── ffmpeg mixing ─────────────────────────────────────────────────────────────

function mixVoiceover(
  videoPath: string,
  clips: ScheduledClip[],
  outputPath: string,
): void {
  // Build inputs: video first, then each clip
  const inputArgs = ['-i', videoPath, ...clips.flatMap((c) => ['-i', c.path])];

  // Delay each clip to its cue start time, then amix everything together
  const delayFilters = clips.map((c, i) => {
    const ms = Math.round(c.startS * 1000);
    return `[${i + 1}:a]adelay=${ms}|${ms}[d${i}]`;
  });
  const mixInputs = clips.map((_, i) => `[d${i}]`).join('');
  const filterComplex = [
    ...delayFilters,
    `${mixInputs}amix=inputs=${clips.length}:duration=longest:normalize=0[aout]`,
  ].join(';');

  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    outputPath,
  ];

  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg exited with code ${result.status}`);
  }
}

function scheduleClipStart(
  cue: VttCue,
  durationS: number,
  lead: number,
  previousClipEndS: number,
): { startS: number; overlapAvoidedS: number; lateByS: number } {
  const desiredStartS = Math.max(0, cue.startS - lead);
  const startS = Math.max(desiredStartS, previousClipEndS);
  const overlapAvoidedS = Math.max(0, previousClipEndS - desiredStartS);
  const lateByS = Math.max(0, startS - cue.startS);
  return { startS, overlapAvoidedS, lateByS };
}

// ── Per-file processing ───────────────────────────────────────────────────────

async function processVttFile(
  vttPath: string,
  voice: Voice,
  model: string,
  lead: number,
  client: OpenAI,
): Promise<void> {
  const absVtt = path.resolve(vttPath);
  const dir = path.dirname(absVtt);
  const base = path.basename(absVtt, '-narration.vtt');

  const videoPath = path.join(dir, `${base}.mp4`);
  if (!fs.existsSync(videoPath)) {
    console.error(`  ✗ Source video not found: ${videoPath}`);
    return;
  }

  if (!fs.existsSync(absVtt)) {
    console.warn(`  ⚠ Narration file not found (run \`make narration\` first): ${path.basename(absVtt)}`);
    return;
  }

  const cues = parseVtt(absVtt);
  if (cues.length === 0) {
    console.error(`  ✗ No cues found in ${path.basename(absVtt)}`);
    return;
  }

  console.log(`\nProcessing: ${path.basename(absVtt)} (${cues.length} cues, voice: ${voice})`);

  const tmpDir = path.join(os.tmpdir(), `polyphon-vo-${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const clips: ScheduledClip[] = [];
    const videoDurationS = getMediaDuration(videoPath);
    let previousClipEndS = 0;

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const clipPath = path.join(tmpDir, `clip-${String(i).padStart(3, '0')}.mp3`);
      process.stdout.write(`  [${i + 1}/${cues.length}] ${cue.label}…`);
      await synthesizeCue(client, cue.text, clipPath, voice, model);

      const durationS = getMediaDuration(clipPath);
      const { startS, overlapAvoidedS, lateByS } = scheduleClipStart(
        cue,
        durationS,
        lead,
        previousClipEndS,
      );
      const endS = startS + durationS;
      const windowEndS = i < cues.length - 1 ? cues[i + 1].startS : cue.endS;
      const overflowS = Math.max(0, endS - windowEndS);
      const pastVideoS = Math.max(0, endS - videoDurationS);

      process.stdout.write(` ✓ (${durationS.toFixed(1)}s @ ${startS.toFixed(2)}s)\n`);
      if (overlapAvoidedS > 0) {
        console.warn(`    overlap avoided: shifted later by ${overlapAvoidedS.toFixed(2)}s`);
      }
      if (lateByS > 0) {
        console.warn(`    starts after cue by ${lateByS.toFixed(2)}s`);
      }
      if (overflowS > 0) {
        console.warn(`    exceeds cue window by ${overflowS.toFixed(2)}s`);
      }
      if (pastVideoS > 0) {
        console.warn(`    extends past video end by ${pastVideoS.toFixed(2)}s`);
      }

      clips.push({ path: clipPath, startS, durationS, label: cue.label });
      previousClipEndS = endS;
    }

    const outputPath = path.join(dir, `${base}-with-voice.mp4`);
    console.log(`  Mixing ${clips.length} clips → ${path.basename(outputPath)}…`);
    mixVoiceover(videoPath, clips, outputPath);
    console.log(`  → ${outputPath}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(): { voice: Voice; model: string; lead: number; targets: string[] } {
  const argv = process.argv.slice(2);
  let voice: Voice = 'nova';
  let model = 'tts-1-hd';
  let lead = 0; // seconds to shift clips earlier than their cue timestamp
  const targets: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--voice') {
      const v = argv[++i];
      if (!VALID_VOICES.includes(v as Voice)) {
        console.error(`Invalid voice: "${v}". Valid voices: ${VALID_VOICES.join(', ')}`);
        process.exit(1);
      }
      voice = v as Voice;
    } else if (argv[i] === '--model') {
      model = argv[++i];
    } else if (argv[i] === '--lead') {
      lead = parseFloat(argv[++i]);
    } else {
      targets.push(argv[i]);
    }
  }

  return { voice, model, lead, targets };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { voice, model, lead, targets } = parseArgs();
  const client = new OpenAI();

  let vttFiles: string[];

  if (targets.length > 0) {
    vttFiles = targets;
  } else {
    const repoRoot = path.join(__dirname, '..');
    const pattern = path.join(repoRoot, 'site', 'static', 'videos', '**', '*-narration.vtt');
    vttFiles = await glob(pattern);
    if (vttFiles.length === 0) {
      console.error('\nNo *-narration.vtt files found. Run `make narration` first.\n');
      process.exit(1);
    }
    console.log(`Found ${vttFiles.length} narration file(s).`);
  }

  console.log(`Voice: ${voice}  Model: ${model}  Lead: ${lead}s\n`);

  for (const f of vttFiles) {
    await processVttFile(f, voice, model, lead, client);
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
