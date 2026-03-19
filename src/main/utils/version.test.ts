import { describe, it, expect } from 'vitest';
import { isNewerVersion } from './version';

describe('isNewerVersion', () => {
  // ── stable vs stable ─────────────────────────────────────────────────────

  it('returns false for the same version', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
  });

  it('returns true for a patch bump', () => {
    expect(isNewerVersion('1.2.3', '1.2.4')).toBe(true);
  });

  it('returns false when candidate has lower patch', () => {
    expect(isNewerVersion('1.2.3', '1.2.2')).toBe(false);
  });

  it('returns true for a minor bump', () => {
    expect(isNewerVersion('1.2.3', '1.3.0')).toBe(true);
  });

  it('returns false when candidate has lower minor', () => {
    expect(isNewerVersion('1.3.0', '1.2.9')).toBe(false);
  });

  it('returns true for a major bump', () => {
    expect(isNewerVersion('1.2.3', '2.0.0')).toBe(true);
  });

  it('returns false when candidate has lower major', () => {
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(false);
  });

  // ── pre-release vs pre-release ────────────────────────────────────────────

  it('alpha.2 is newer than alpha.1 with same X.Y.Z', () => {
    expect(isNewerVersion('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(true);
  });

  it('alpha.1 is not newer than alpha.2', () => {
    expect(isNewerVersion('1.0.0-alpha.2', '1.0.0-alpha.1')).toBe(false);
  });

  it('same alpha version is not newer', () => {
    expect(isNewerVersion('1.0.0-alpha.3', '1.0.0-alpha.3')).toBe(false);
  });

  it('beta is newer than alpha with same X.Y.Z', () => {
    expect(isNewerVersion('1.0.0-alpha.5', '1.0.0-beta.1')).toBe(true);
  });

  it('alpha is not newer than beta', () => {
    expect(isNewerVersion('1.0.0-beta.1', '1.0.0-alpha.5')).toBe(false);
  });

  it('beta.2 is newer than beta.1', () => {
    expect(isNewerVersion('1.0.0-beta.1', '1.0.0-beta.2')).toBe(true);
  });

  // ── pre-release vs stable ─────────────────────────────────────────────────

  it('stable is newer than alpha with same X.Y.Z', () => {
    expect(isNewerVersion('1.0.0-alpha.5', '1.0.0')).toBe(true);
  });

  it('stable is newer than beta with same X.Y.Z', () => {
    expect(isNewerVersion('1.0.0-beta.2', '1.0.0')).toBe(true);
  });

  it('alpha is not newer than stable with same X.Y.Z', () => {
    expect(isNewerVersion('1.0.0', '1.0.0-alpha.1')).toBe(false);
  });

  it('beta is not newer than stable with same X.Y.Z', () => {
    expect(isNewerVersion('1.0.0', '1.0.0-beta.1')).toBe(false);
  });

  // ── X.Y.Z bump takes precedence over pre-release rank ────────────────────

  it('higher X.Y.Z alpha is newer than lower X.Y.Z stable', () => {
    expect(isNewerVersion('1.0.0', '1.0.1-alpha.1')).toBe(true);
  });

  it('lower X.Y.Z stable is not newer than higher X.Y.Z alpha', () => {
    expect(isNewerVersion('1.0.1-alpha.1', '1.0.0')).toBe(false);
  });

  // ── malformed inputs ──────────────────────────────────────────────────────

  it('returns false for malformed current version', () => {
    expect(isNewerVersion('not-a-version', '1.0.0')).toBe(false);
  });

  it('returns false for malformed candidate version', () => {
    expect(isNewerVersion('1.0.0', 'not-a-version')).toBe(false);
  });

  it('returns false for both malformed', () => {
    expect(isNewerVersion('', '')).toBe(false);
  });

  it('raw "v1.0.1" is treated as malformed (callers must strip the prefix)', () => {
    expect(isNewerVersion('1.0.0', 'v1.0.1')).toBe(false);
  });

  it('"1.0.0-rc.1" is malformed (only alpha/beta are accepted)', () => {
    expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(false);
  });
});
