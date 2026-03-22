import { readdirSync, statSync } from 'fs';
import { resolve, join, relative, basename } from 'path';
import type { ToolDefinition } from './types';

const MAX_RESULTS = 200;

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function walk(dir: string, pattern: RegExp, results: string[], root: string): void {
  if (results.length >= MAX_RESULTS) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) break;
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      walk(fullPath, pattern, results, root);
    } else if (pattern.test(basename(entry))) {
      results.push(relative(root, fullPath));
    }
  }
}

export const searchFilesTool: ToolDefinition = {
  name: 'search_files',
  description: 'Search for files by name pattern within a directory tree. Supports * and ? wildcards.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Filename pattern to match (e.g. "*.ts", "README*"). Wildcards * and ? are supported.',
      },
      directory: {
        type: 'string',
        description: 'Directory to search in. Defaults to the current working directory.',
      },
    },
    required: ['pattern'],
  },
  async execute(args) {
    const pattern = String(args['pattern'] ?? '').trim();
    if (!pattern) return 'Error: pattern is required.';

    const dir = resolve(String(args['directory'] ?? '.'));
    try {
      statSync(dir);
    } catch {
      return `Error: directory not found: ${basename(dir)}`;
    }

    const regex = globToRegex(pattern);
    const results: string[] = [];
    walk(dir, regex, results, dir);

    if (results.length === 0) return 'No files found.';
    const output = results.join('\n');
    return results.length >= MAX_RESULTS
      ? `${output}\n... (results truncated at ${MAX_RESULTS})`
      : output;
  },
};
