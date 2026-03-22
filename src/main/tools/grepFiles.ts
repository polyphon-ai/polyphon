import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, join, relative, basename } from 'path';
import type { ToolDefinition } from './types';

const MAX_MATCHES = 100;
const MAX_FILE_BYTES = 1024 * 1024;

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function collectFiles(dir: string, filePattern: RegExp, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      collectFiles(fullPath, filePattern, out);
    } else if (filePattern.test(basename(entry))) {
      out.push(fullPath);
    }
  }
}

export const grepFilesTool: ToolDefinition = {
  name: 'grep_files',
  description:
    'Search file contents for a pattern within a directory tree. Returns matching lines with file path and line number.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for in file contents.',
      },
      directory: {
        type: 'string',
        description: 'Directory to search in.',
      },
      file_pattern: {
        type: 'string',
        description:
          'Optional glob to filter which files are searched (e.g. "*.ts", "*.md"). Defaults to all files.',
      },
      case_sensitive: {
        type: 'string',
        description: 'Set to "true" for case-sensitive matching. Defaults to case-insensitive.',
      },
    },
    required: ['pattern', 'directory'],
  },
  async execute(args) {
    const pattern = String(args['pattern'] ?? '').trim();
    if (!pattern) return 'Error: pattern is required.';

    const dir = resolve(String(args['directory'] ?? '.'));
    const fileGlob = args['file_pattern'] ? String(args['file_pattern']) : '*';
    const caseSensitive = String(args['case_sensitive'] ?? '').toLowerCase() === 'true';

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, caseSensitive ? '' : 'i');
    } catch {
      return `Error: invalid regular expression: ${pattern}`;
    }

    try {
      statSync(dir);
    } catch {
      return `Error: directory not found: ${basename(dir)}`;
    }

    const fileRegex = globToRegex(fileGlob);
    const files: string[] = [];
    collectFiles(dir, fileRegex, files);

    const matches: string[] = [];
    for (const file of files) {
      if (matches.length >= MAX_MATCHES) break;
      let content: string;
      try {
        const buf = readFileSync(file);
        if (buf.length > MAX_FILE_BYTES) continue;
        content = buf.toString('utf-8');
      } catch {
        continue;
      }
      const lines = content.split('\n');
      const relPath = relative(dir, file);
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= MAX_MATCHES) break;
        if (regex.test(lines[i]!)) {
          matches.push(`${relPath}:${i + 1}: ${lines[i]}`);
        }
      }
    }

    if (matches.length === 0) return 'No matches found.';
    const output = matches.join('\n');
    return matches.length >= MAX_MATCHES
      ? `${output}\n... (results truncated at ${MAX_MATCHES} matches)`
      : output;
  },
};
