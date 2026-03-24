import { Command } from 'commander';
import { PolyClient } from '../client.js';
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
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);
        const result = await client.call('compositions.list', { archived: opts.archived });
        if (format === 'json') {
          outputResult(result, format);
        } else {
          const items = result as any[];
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
        client.close();
      }
    });

  comp
    .command('get <id>')
    .description('Get a composition by ID')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (id, opts) => {
      const format = opts.format as OutputFormat;
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);
        const result = await client.call('compositions.get', { id });
        outputResult(format === 'json' ? result : formatComposition(result), format);
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.close();
      }
    });
}
