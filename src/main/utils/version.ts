const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)/;

export function isNewerVersion(current: string, candidate: string): boolean {
  const c = VERSION_RE.exec(current);
  const n = VERSION_RE.exec(candidate);
  if (!c || !n) return false;

  const [, cMajor, cMinor, cPatch] = c.map(Number);
  const [, nMajor, nMinor, nPatch] = n.map(Number);

  if (nMajor !== cMajor) return nMajor > cMajor;
  if (nMinor !== cMinor) return nMinor > cMinor;
  return nPatch > cPatch;
}
