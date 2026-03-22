import { renameSync, copyFileSync, unlinkSync, statSync, mkdirSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import type { ToolDefinition } from './types';

export const moveFileTool: ToolDefinition = {
  name: 'move_file',
  description:
    'Move or rename a file.',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Path to the file to move.' },
      destination: { type: 'string', description: 'Destination path (including filename).' },
    },
    required: ['source', 'destination'],
  },
  async execute(args) {
    const src = resolve(String(args['source'] ?? ''));
    const dest = resolve(String(args['destination'] ?? ''));

    if (!src || !dest) return 'Error: source and destination are required.';
    if (src === dest) return 'Error: source and destination are the same path.';

    try {
      statSync(src);
    } catch {
      return `Error: source file not found: ${basename(src)}`;
    }

    try {
      mkdirSync(dirname(dest), { recursive: false });
    } catch {
      // Parent already exists or is too deep — let the rename/copy reveal the real error
    }

    try {
      renameSync(src, dest);
      return `Moved to ${dest}`;
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'EXDEV') {
        try {
          copyFileSync(src, dest);
          unlinkSync(src);
          return `Moved to ${dest}`;
        } catch (err2) {
          return `Error: ${err2 instanceof Error ? err2.message : String(err2)}`;
        }
      }
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
