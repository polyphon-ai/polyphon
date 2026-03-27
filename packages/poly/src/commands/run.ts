import { Command } from 'commander';
import { PolyphonClient } from '../../../../src/sdk/index.js';
import { resolveConnection } from '../connect.js';
import { outputResult, outputError, type OutputFormat } from '../format.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Send a broadcast message to all voices in a session')
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--prompt <text>', 'Message to broadcast')
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
          let currentVoice = '';
          const result = await client.broadcast(
            { sessionId: opts.session, content: opts.prompt },
            (chunk) => {
              if (chunk.voiceName !== currentVoice) {
                if (currentVoice) process.stdout.write('\n');
                currentVoice = chunk.voiceName;
                process.stderr.write(`\n[${currentVoice}] `);
              }
              process.stdout.write(chunk.delta);
            },
          );
          process.stdout.write('\n');
          if (format === 'json') {
            outputResult(result, format);
          }
        } else {
          const result = await client.broadcast({
            sessionId: opts.session,
            content: opts.prompt,
          });
          if (format === 'json') {
            outputResult(result, format);
          } else {
            for (const msg of result.messages) {
              process.stdout.write(`[${msg.voiceName ?? 'voice'}]\n${msg.content}\n\n`);
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
