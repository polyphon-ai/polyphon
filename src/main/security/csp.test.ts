import { describe, it, expect } from 'vitest';
import { buildCspHeader } from './csp';

describe('buildCspHeader — production (isDev=false)', () => {
  it("contains default-src 'none'", () => {
    expect(buildCspHeader(false)).toContain("default-src 'none'");
  });

  it("contains script-src 'self'", () => {
    expect(buildCspHeader(false)).toContain("script-src 'self'");
  });

  it("contains connect-src 'none'", () => {
    expect(buildCspHeader(false)).toContain("connect-src 'none'");
  });

  it("contains object-src 'none'", () => {
    expect(buildCspHeader(false)).toContain("object-src 'none'");
  });

  it("contains worker-src 'none'", () => {
    expect(buildCspHeader(false)).toContain("worker-src 'none'");
  });

  it("contains media-src 'none'", () => {
    expect(buildCspHeader(false)).toContain("media-src 'none'");
  });

  it("contains style-src 'self'", () => {
    expect(buildCspHeader(false)).toContain("style-src 'self'");
  });

  it("does not contain 'unsafe-eval'", () => {
    expect(buildCspHeader(false)).not.toContain("'unsafe-eval'");
  });

  it("does not contain 'unsafe-inline'", () => {
    expect(buildCspHeader(false)).not.toContain("'unsafe-inline'");
  });

  it('ignores devServerUrl when isDev is false', () => {
    const policy = buildCspHeader(false, 'http://localhost:5173');
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('localhost:5173');
    expect(policy).toContain("connect-src 'none'");
  });
});

describe('buildCspHeader — development (isDev=true)', () => {
  const devUrl = 'http://localhost:5173';
  const policy = buildCspHeader(true, devUrl);

  it("contains 'unsafe-eval'", () => {
    expect(policy).toContain("'unsafe-eval'");
  });

  it("contains 'unsafe-inline'", () => {
    expect(policy).toContain("'unsafe-inline'");
  });

  it('derives connect-src from exact devServerUrl origin (not a wildcard)', () => {
    expect(policy).toContain('ws://localhost:5173');
    expect(policy).not.toContain('ws://localhost:*');
    expect(policy).not.toContain('ws://*');
  });

  it('includes http origin in connect-src', () => {
    expect(policy).toContain('http://localhost:5173');
  });

  it('works without devServerUrl (no ws origin injected)', () => {
    const p = buildCspHeader(true);
    expect(p).toContain("'unsafe-eval'");
    expect(p).not.toContain('ws://');
  });

  it('handles non-default ports correctly', () => {
    const p = buildCspHeader(true, 'http://localhost:9000');
    expect(p).toContain('ws://localhost:9000');
    expect(p).not.toContain('ws://localhost:5173');
  });
});
