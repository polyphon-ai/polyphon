import { Command } from 'commander';
import { PolyphonClient } from '../../../../src/sdk/index.js';
import { resolveConnection } from '../connect.js';
import { outputResult, outputError, type OutputFormat } from '../format.js';

export function registerAskCommand(program: Command): void {
  program
    .command('ask')
    .description('Send a directed message to a specific voice in a session')
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--voice <id>', 'Voice ID')
    .requiredOption('--prompt <text>', 'Message to send')
    .option('--stream', 'Stream tokens as they arrive', false)
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (opts) => {
      const format = opts.format as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();

        if (opts.stream) {
          const result = await client.ask(
            { sessionId: opts.session, voiceId: opts.voice, content: opts.prompt },
            (chunk) => {
              process.stdout.write(chunk.delta);
            },
          );
          process.stdout.write('\n');
          if (format === 'json') {
            outputResult(result, format);
          }
        } else {
          const result = await client.ask({
            sessionId: opts.session,
            voiceId: opts.voice,
            content: opts.prompt,
          });
          if (format === 'json') {
            outputResult(result, format);
          } else {
            if (result.message) {
              process.stdout.write(`[${result.message.voiceName ?? 'voice'}]\n${result.message.content}\n`);
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
