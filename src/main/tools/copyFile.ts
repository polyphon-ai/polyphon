import { copyFileSync, statSync, mkdirSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import type { ToolDefinition } from './types';

export const copyFileTool: ToolDefinition = {
  name: 'copy_file',
  description:
    'Copy a file to a new location.',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Path to the file to copy.' },
      destination: { type: 'string', description: 'Destination path (including filename).' },
    },
    required: ['source', 'destination'],
  },
  async execute(args) {
    const src = resolve(String(args['source'] ?? ''));
    const dest = resolve(String(args['destination'] ?? ''));

    if (!src || !dest) return 'Error: source and destination are required.';

    try {
      statSync(src);
    } catch {
      return `Error: source file not found: ${basename(src)}`;
    }

    try {
      mkdirSync(dirname(dest), { recursive: false });
    } catch {
      // Parent already exists or is too deep
    }

    try {
      copyFileSync(src, dest);
      return `Copied to ${dest}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
