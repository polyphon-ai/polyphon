export type OutputFormat = 'human' | 'json';

export function outputResult(data: unknown, format: OutputFormat): void {
  if (format === 'json') {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    if (typeof data === 'string') {
      process.stdout.write(data + '\n');
    } else {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    }
  }
}

export function outputError(err: unknown, format: OutputFormat): void {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as any)?.code ?? -1;
  if (format === 'json') {
    process.stderr.write(JSON.stringify({ error: { code, message } }) + '\n');
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }
}

export function formatComposition(c: any): string {
  const voices = (c.voices ?? []).map((v: any) => `  - ${v.displayName} (${v.provider})`).join('\n');
  return `${c.name} [${c.id}]\n  mode: ${c.mode}\n${voices}`;
}

export function formatSession(s: any): string {
  const date = new Date(s.createdAt).toLocaleString();
  return `${s.name} [${s.id}]\n  composition: ${s.compositionId}\n  created: ${date}`;
}

export function formatMessage(m: any): string {
  const speaker =
    m.role === 'conductor' ? 'You' : m.role === 'system' ? '[system]' : (m.voiceName ?? m.voiceId ?? 'Voice');
  return `${speaker}: ${m.content}`;
}
