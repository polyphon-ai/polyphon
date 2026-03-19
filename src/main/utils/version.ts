const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/;

const PRERELEASE_RANK: Record<string, number> = { alpha: 0, beta: 1 };
const STABLE_RANK = 2;

export function isNewerVersion(current: string, candidate: string): boolean {
  const c = VERSION_RE.exec(current);
  const n = VERSION_RE.exec(candidate);
  if (!c || !n) return false;

  const cMajor = Number(c[1]), cMinor = Number(c[2]), cPatch = Number(c[3]);
  const nMajor = Number(n[1]), nMinor = Number(n[2]), nPatch = Number(n[3]);

  if (nMajor !== cMajor) return nMajor > cMajor;
  if (nMinor !== cMinor) return nMinor > cMinor;
  if (nPatch !== cPatch) return nPatch > cPatch;

  // Same X.Y.Z — stable outranks beta outranks alpha
  const cRank = c[4] ? (PRERELEASE_RANK[c[4]] ?? 0) : STABLE_RANK;
  const nRank = n[4] ? (PRERELEASE_RANK[n[4]] ?? 0) : STABLE_RANK;
  if (nRank !== cRank) return nRank > cRank;

  // Same pre-release type — compare numeric suffix
  const cNum = c[5] !== undefined ? Number(c[5]) : 0;
  const nNum = n[5] !== undefined ? Number(n[5]) : 0;
  return nNum > cNum;
}
