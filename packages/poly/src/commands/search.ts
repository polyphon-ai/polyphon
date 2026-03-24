import { Command } from 'commander';
import { PolyClient } from '../client.js';
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
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);
        const result = await client.call('search.messages', {
          query,
          sessionId: opts.session,
        });
        if (format === 'json') {
          outputResult(result, format);
        } else {
          const items = result as any[];
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
        client.close();
      }
    });
}
