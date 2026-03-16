const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)/;

export function isNewerVersion(current: string, candidate: string): boolean {
  const c = VERSION_RE.exec(current);
  const n = VERSION_RE.exec(candidate);
  if (!c || !n) return false;

  const [, cMajor = 0, cMinor = 0, cPatch = 0] = c.map(Number);
  const [, nMajor = 0, nMinor = 0, nPatch = 0] = n.map(Number);

  if (nMajor !== cMajor) return nMajor > cMajor;
  if (nMinor !== cMinor) return nMinor > cMinor;
  return nPatch > cPatch;
}
