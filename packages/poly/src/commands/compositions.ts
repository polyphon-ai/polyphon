import { Command } from 'commander';
import { PolyphonClient } from '../../../../src/sdk/index.js';
import { resolveConnection } from '../connect.js';
import { outputResult, outputError, formatComposition, type OutputFormat } from '../format.js';

export function registerCompositionsCommand(program: Command): void {
  const comp = program
    .command('compositions')
    .description('Manage compositions');

  comp
    .command('list')
    .description('List all compositions')
    .option('--archived', 'Include archived compositions', false)
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (opts) => {
      const format = opts.format as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();
        const items = await client.compositions({ archived: opts.archived });
        if (format === 'json') {
          outputResult(items, format);
        } else {
          if (items.length === 0) {
            process.stdout.write('No compositions found.\n');
          } else {
            process.stdout.write(items.map(formatComposition).join('\n\n') + '\n');
          }
        }
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });

  comp
    .command('get <id>')
    .description('Get a composition by ID')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (id, opts) => {
      const format = opts.format as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();
        const result = await client.getComposition({ id });
        outputResult(format === 'json' ? result : formatComposition(result), format);
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.disconnect();
      }
    });
}
