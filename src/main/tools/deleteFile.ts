import { unlinkSync, statSync } from 'fs';
import { resolve, basename } from 'path';
import type { ToolDefinition } from './types';

export const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description:
    'Permanently delete a file.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to delete.' },
    },
    required: ['path'],
  },
  async execute(args) {
    const filePath = resolve(String(args['path'] ?? ''));

    try {
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        return `Error: ${basename(filePath)} is a directory; delete_file only removes files.`;
      }
    } catch {
      return `Error: file not found: ${basename(filePath)}`;
    }

    try {
      unlinkSync(filePath);
      return `Deleted ${filePath}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
