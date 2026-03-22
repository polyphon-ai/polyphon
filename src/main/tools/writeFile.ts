import { writeFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import type { ToolDefinition } from './types';

function sanitize(msg: string, filePath: string): string {
  return msg.replace(filePath, basename(filePath));
}

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description:
    'Write content to a file on the local filesystem. Overwrites the file if it exists. ' +
    'Creates the immediate parent directory if it does not exist.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file to write.',
      },
      content: {
        type: 'string',
        description: 'The text content to write to the file.',
      },
    },
    required: ['path', 'content'],
  },
  async execute(args) {
    const rawPath = String(args['path'] ?? '');
    const content = String(args['content'] ?? '');
    const filePath = resolve(rawPath);
    const tmpPath = filePath + '.tmp.' + process.pid;

    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        // Create one level of parent directory only
        mkdirSync(dir);
      }

      // Atomic write: write to .tmp sibling, then rename
      writeFileSync(tmpPath, content, 'utf-8');
      renameSync(tmpPath, filePath);

      return `Written successfully to ${basename(filePath)}.`;
    } catch (err) {
      // Clean up temp file if it exists
      try {
        if (existsSync(tmpPath)) {
          const { unlinkSync } = await import('fs');
          unlinkSync(tmpPath);
        }
      } catch {
        // Best-effort cleanup; ignore errors
      }
      const name = basename(filePath);
      if (err instanceof Error) {
        return `Error writing ${name}: ${sanitize(err.message, filePath)}`;
      }
      return `Error writing ${name}: unknown error`;
    }
  },
};
