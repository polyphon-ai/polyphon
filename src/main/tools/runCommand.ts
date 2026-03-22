import { spawnSync } from 'child_process';
import type { ToolDefinition } from './types';

const MAX_OUTPUT_BYTES = 50 * 1024;
const TIMEOUT_MS = 30_000;

export const runCommandTool: ToolDefinition = {
  name: 'run_command',
  description:
    'Run an executable with arguments and return its output (stdout, stderr, exit code).',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description:
          'The executable to run (e.g. "git", "npm", "python3"). Not shell-interpreted — pass arguments separately via args.',
      },
      args: {
        type: 'array',
        description: 'Command-line arguments as an array of strings.',
        items: { type: 'string' },
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command. Defaults to the process working directory.',
      },
    },
    required: ['command'],
  },
  async execute(rawArgs) {
    const command = String(rawArgs['command'] ?? '').trim();
    if (!command) return 'Error: command is required.';

    const argv = Array.isArray(rawArgs['args'])
      ? (rawArgs['args'] as unknown[]).map(String)
      : [];
    const cwd = rawArgs['cwd'] ? String(rawArgs['cwd']) : undefined;

    try {
      const result = spawnSync(command, argv, {
        cwd,
        timeout: TIMEOUT_MS,
        encoding: 'buffer',
        maxBuffer: MAX_OUTPUT_BYTES * 2,
      });

      if (result.error) return `Error: ${result.error.message}`;

      const stdout = result.stdout ? result.stdout.toString('utf-8').slice(0, MAX_OUTPUT_BYTES) : '';
      const stderr = result.stderr ? result.stderr.toString('utf-8').slice(0, MAX_OUTPUT_BYTES) : '';
      const exitCode = result.status ?? 'unknown';

      const parts: string[] = [];
      if (stdout) parts.push(`stdout:\n${stdout}`);
      if (stderr) parts.push(`stderr:\n${stderr}`);
      parts.push(`exit code: ${exitCode}`);
      return parts.join('\n');
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
