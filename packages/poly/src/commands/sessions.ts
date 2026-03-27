import { Command } from 'commander';
import { PolyphonClient } from '../../../../src/sdk/index.js';
import { resolveConnection } from '../connect.js';
import { outputResult, outputError, formatSession, formatMessage, type OutputFormat } from '../format.js';

export function registerSessionsCommand(program: Command): void {
  const sess = program
    .command('sessions')
    .description('Manage sessions');

  sess
    .command('new')
    .description('Create a new session from a composition')
    .requiredOption('--composition <id>', 'Composition ID')
    .option('--name <name>', 'Session name (defaults to today\'s date)')
    .option('--working-dir <path>', 'Working directory for filesystem tools')
    .option('--sandbox', 'Sandbox filesystem tools to the working directory', false)
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <n>', 'Named remote connection')
    .action(async (opts) => {
      const format = opts.format as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();
        const result = await client.createSession(opts.composition, 'poly-cli', {
          ...(opts.name ? { name: opts.name } : {}),
          ...(opts.workingDir ? { workingDir: opts.workingDir } : {}),
          sandboxedToWorkingDir: opts.sandbox,
        });
        if (format === 'json') {
          outputResult(result, format);
        } else {
          process.stdout.write(`Created session: ${result.name}\nID: ${result.id}\n`);
        }
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  sess
    .command('list')
    .description('List all sessions')
    .option('--archived', 'Include archived sessions', false)
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (opts) => {
      const format = opts.format as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();
        const items = await client.sessions({ archived: opts.archived });
        if (format === 'json') {
          outputResult(items, format);
        } else {
          if (items.length === 0) {
            process.stdout.write('No sessions found.\n');
          } else {
            process.stdout.write(items.map(formatSession).join('\n\n') + '\n');
          }
        }
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  sess
    .command('get <id>')
    .description('Get a session by ID')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (id, opts) => {
      const format = opts.format as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();
        const result = await client.getSession({ id });
        outputResult(format === 'json' ? result : formatSession(result), format);
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  sess
    .command('messages <sessionId>')
    .description('List messages in a session')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (sessionId, opts) => {
      const format = opts.format as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();
        const items = await client.getMessages({ sessionId });
        if (format === 'json') {
          outputResult(items, format);
        } else {
          if (items.length === 0) {
            process.stdout.write('No messages.\n');
          } else {
            process.stdout.write(items.map(formatMessage).join('\n') + '\n');
          }
        }
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  sess
    .command('export <sessionId>')
    .description('Export a session transcript')
    .option('--format-output <format>', 'Transcript format: markdown|json|plaintext', 'markdown')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (sessionId, opts) => {
      const format = opts.format as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();
        const result = await client.exportSession({ sessionId, format: opts.formatOutput });
        if (format === 'json') {
          outputResult(result, format);
        } else {
          process.stdout.write(result.content + '\n');
        }
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
