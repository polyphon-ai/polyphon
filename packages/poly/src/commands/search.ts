import { Command } from 'commander';
import { PolyphonClient } from '../../../../src/sdk/index.js';
import { resolveConnection } from '../connect.js';
import { outputResult, outputError, type OutputFormat } from '../format.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Search messages across sessions')
    .option('--session <id>', 'Limit to a specific session')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (query, opts) => {
      const format = opts.format as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();
        const items = await client.searchMessages({ query, sessionId: opts.session });
        if (format === 'json') {
          outputResult(items, format);
        } else {
          if (items.length === 0) {
            process.stdout.write('No results found.\n');
          } else {
            for (const r of items) {
              process.stdout.write(`[${r.sessionName}] ${r.voiceName ?? 'conductor'}: ${r.snippet}\n`);
            }
          }
        }
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
