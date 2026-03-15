/**
 * Generates site/static/images/og-default.png (1200×630)
 * from the polyphon icon and wordmark SVG assets.
 * Run once: node scripts/generate-og-image.mjs
 */
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const geistSans = join(root, 'node_modules/geist/dist/fonts/geist-sans');

const semiBoldB64 = readFileSync(join(geistSans, 'Geist-SemiBold.ttf')).toString('base64');
const regularB64  = readFileSync(join(geistSans, 'Geist-Regular.ttf')).toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <style>
      @font-face {
        font-family: 'Geist Sans';
        font-weight: 600;
        src: url('data:font/ttf;base64,${semiBoldB64}') format('truetype');
      }
      @font-face {
        font-family: 'Geist Sans';
        font-weight: 400;
        src: url('data:font/ttf;base64,${regularB64}') format('truetype');
      }
    </style>
    <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#a5b4fc"/>
    </linearGradient>
    <radialGradient id="bg" cx="28%" cy="50%" r="55%">
      <stop offset="0%"   stop-color="#161728"/>
      <stop offset="100%" stop-color="#0e0f1e"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Icon: 280×280, vertically centered (y=175) -->
  <svg x="64" y="175" width="280" height="280" viewBox="40 40 600 600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="ic">
        <rect x="40" y="40" width="600" height="600" rx="128"/>
      </clipPath>
    </defs>
    <rect x="40" y="40" width="600" height="600" rx="128" fill="#0e0f1e"/>
    <g clip-path="url(#ic)">
      <path d="M 490 40 A 150 150 0 0 0 640 190" fill="none" stroke="#4338ca" stroke-width="28" stroke-linecap="round" opacity="0.95"/>
      <path d="M 370 40 A 270 270 0 0 0 640 310" fill="none" stroke="#4f46e5" stroke-width="25" stroke-linecap="round" opacity="0.85"/>
      <path d="M 248 40 A 392 392 0 0 0 640 432" fill="none" stroke="#6366f1" stroke-width="22" stroke-linecap="round" opacity="0.75"/>
      <path d="M 122 40 A 518 518 0 0 0 640 558" fill="none" stroke="#818cf8" stroke-width="19" stroke-linecap="round" opacity="0.60"/>
      <path d="M  40 118 A 522 522 0 0 0 562 640" fill="none" stroke="#a5b4fc" stroke-width="16" stroke-linecap="round" opacity="0.42"/>
      <path d="M  40 490 A 150 150 0 0 1 190 640" fill="none" stroke="#7c3aed" stroke-width="28" stroke-linecap="round" opacity="0.92"/>
      <path d="M  40 368 A 272 272 0 0 1 312 640" fill="none" stroke="#8b5cf6" stroke-width="25" stroke-linecap="round" opacity="0.82"/>
      <path d="M  40 246 A 394 394 0 0 1 434 640" fill="none" stroke="#06b6d4" stroke-width="22" stroke-linecap="round" opacity="0.70"/>
      <path d="M  40 122 A 518 518 0 0 1 558 640" fill="none" stroke="#22d3ee" stroke-width="19" stroke-linecap="round" opacity="0.54"/>
      <circle cx="390" cy="330" r="42" fill="#a78bfa" opacity="0.15"/>
      <circle cx="390" cy="330" r="21" fill="#c4b5fd" opacity="0.25"/>
      <circle cx="390" cy="330" r="7"  fill="#e9d5ff" opacity="0.85"/>
    </g>
  </svg>

  <!-- Wordmark -->
  <text x="420" y="296"
        font-family="Geist Sans, system-ui, sans-serif"
        font-size="96" font-weight="600" letter-spacing="-3"
        fill="url(#wg)">Polyphon</text>

  <!-- Tagline -->
  <text x="424" y="374"
        font-family="Geist Sans, system-ui, sans-serif"
        font-size="40" font-weight="400" letter-spacing="-0.5"
        fill="#94a3b8">One chat. Many minds.</text>

  <!-- URL -->
  <text x="1140" y="606"
        font-family="Geist Sans, system-ui, sans-serif"
        font-size="22" font-weight="400"
        fill="#4b5563" text-anchor="end">polyphon.ai</text>
</svg>`;

const outDir = join(root, 'site/static/images');
mkdirSync(outDir, { recursive: true });

const outPath = join(outDir, 'og-default.png');
await sharp(Buffer.from(svg)).png().toFile(outPath);

console.log(`og-default.png written to ${outPath}`);
