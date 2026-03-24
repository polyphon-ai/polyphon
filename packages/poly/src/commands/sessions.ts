import { Command } from 'commander';
import { PolyClient } from '../client.js';
import { resolveConnection } from '../connect.js';
import { outputResult, outputError, formatSession, formatMessage, type OutputFormat } from '../format.js';

export function registerSessionsCommand(program: Command): void {
  const sess = program
    .command('sessions')
    .description('Manage sessions');

  sess
    .command('list')
    .description('List all sessions')
    .option('--archived', 'Include archived sessions', false)
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (opts) => {
      const format = opts.format as OutputFormat;
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);
        const result = await client.call('sessions.list', { archived: opts.archived });
        if (format === 'json') {
          outputResult(result, format);
        } else {
          const items = result as any[];
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
        client.close();
      }
    });

  sess
    .command('get <id>')
    .description('Get a session by ID')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (id, opts) => {
      const format = opts.format as OutputFormat;
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);
        const result = await client.call('sessions.get', { id });
        outputResult(format === 'json' ? result : formatSession(result), format);
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.close();
      }
    });

  sess
    .command('messages <sessionId>')
    .description('List messages in a session')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (sessionId, opts) => {
      const format = opts.format as OutputFormat;
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);
        const result = await client.call('sessions.messages', { sessionId });
        if (format === 'json') {
          outputResult(result, format);
        } else {
          const items = result as any[];
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
        client.close();
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
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);
        const result = await client.call('sessions.export', { sessionId, format: opts.formatOutput });
        if (format === 'json') {
          outputResult(result, format);
        } else {
          process.stdout.write((result as any).content + '\n');
        }
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.close();
      }
    });
}
