import { readdirSync, lstatSync } from 'fs';
import { resolve, join, relative, basename } from 'path';
import type { ToolDefinition } from './types';

const MAX_ENTRIES = 500;
const MAX_DEPTH = 3;

function sanitize(msg: string, dirPath: string): string {
  return msg.replace(dirPath, basename(dirPath));
}

function collect(
  dir: string,
  root: string,
  depth: number,
  entries: string[],
): boolean {
  if (depth > MAX_DEPTH) return false;
  if (entries.length >= MAX_ENTRIES) return true;

  let items: string[];
  try {
    items = readdirSync(dir).sort();
  } catch {
    // Permission denied or unreadable — skip silently
    return entries.length >= MAX_ENTRIES;
  }

  for (const item of items) {
    if (entries.length >= MAX_ENTRIES) return true;

    const fullPath = join(dir, item);
    const relPath = relative(root, fullPath);

    let stat;
    try {
      stat = lstatSync(fullPath);
    } catch {
      // Permission denied — skip silently
      continue;
    }

    if (stat.isSymbolicLink()) {
      // Skip symlinked entries (do not follow)
      continue;
    }

    entries.push(relPath);

    if (stat.isDirectory()) {
      const truncated = collect(fullPath, root, depth + 1, entries);
      if (truncated) return true;
    }
  }

  return entries.length >= MAX_ENTRIES;
}

export const listDirectoryTool: ToolDefinition = {
  name: 'list_directory',
  description:
    'List the contents of a directory recursively (up to depth 3, max 500 entries). ' +
    'Returns relative paths sorted alphabetically. Symlinks and permission-denied entries are skipped.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the directory to list.',
      },
    },
    required: ['path'],
  },
  async execute(args) {
    const rawPath = String(args['path'] ?? '');
    const dirPath = resolve(rawPath);

    try {
      const stat = lstatSync(dirPath);
      if (!stat.isDirectory()) {
        return `Error: ${basename(dirPath)} is not a directory.`;
      }
    } catch (err) {
      const name = basename(dirPath);
      if (err instanceof Error) {
        return `Error: ${sanitize(err.message, dirPath)}`;
      }
      return `Error listing ${name}: unknown error`;
    }

    const entries: string[] = [];
    const truncated = collect(dirPath, dirPath, 1, entries);

    if (entries.length === 0) {
      return '(empty directory)';
    }

    const lines = entries.join('\n');
    return truncated ? lines + '\n... (listing truncated)' : lines;
  },
};
