import { readFileSync } from 'fs';
import { resolve, basename } from 'path';
import type { ToolDefinition } from './types';

const MAX_BYTES = 50 * 1024;

function sanitize(msg: string, filePath: string): string {
  // Replace absolute paths with just the basename to avoid leaking path info
  return msg.replace(filePath, basename(filePath));
}

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file from the local filesystem. Returns the file content as UTF-8 text, truncated at 50 KB.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file to read.',
      },
    },
    required: ['path'],
  },
  async execute(args) {
    const rawPath = String(args['path'] ?? '');
    const filePath = resolve(rawPath);
    try {
      const buffer = readFileSync(filePath);

      // Validate UTF-8 on the full buffer before truncation
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch {
        return 'Binary or non-UTF-8 file; cannot read as text.';
      }

      if (buffer.length > MAX_BYTES) {
        const truncatedBytes = buffer.subarray(0, MAX_BYTES);
        // Decode without fatal — truncation boundary may split a multi-byte char
        const content = new TextDecoder('utf-8').decode(truncatedBytes);
        return content + '\n... (truncated at 50 KB)';
      }

      return buffer.toString('utf-8');
    } catch (err) {
      const name = basename(filePath);
      if (err instanceof Error) {
        return `Error reading ${name}: ${sanitize(err.message, filePath)}`;
      }
      return `Error reading ${name}: unknown error`;
    }
  },
};
