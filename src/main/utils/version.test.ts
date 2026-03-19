import { describe, it, expect } from 'vitest';
import { isNewerVersion } from './version';

describe('isNewerVersion', () => {
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

  it('returns false for pre-release suffix on candidate (not strictly newer than release)', () => {
    expect(isNewerVersion('0.2.0', '0.2.0-beta.1')).toBe(false);
  });

  it('returns false for malformed current version', () => {
    expect(isNewerVersion('not-a-version', '1.0.0')).toBe(false);
  });

  it('returns false for malformed candidate version', () => {
    expect(isNewerVersion('1.0.0', 'not-a-version')).toBe(false);
  });

  it('returns false for both malformed', () => {
    expect(isNewerVersion('', '')).toBe(false);
  });

  it('strips leading v prefix via regex (does not match, returns false)', () => {
    // Callers should strip "v" before calling; raw "v1.0.0" is treated as malformed
    expect(isNewerVersion('1.0.0', 'v1.0.1')).toBe(false);
  });
});
