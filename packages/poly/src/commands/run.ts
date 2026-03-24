import { Command } from 'commander';
import { PolyClient } from '../client.js';
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
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);

        if (opts.stream) {
          let currentVoice = '';
          const result = await client.callStreaming(
            'voice.broadcast',
            { sessionId: opts.session, content: opts.prompt },
            (chunk) => {
              if (chunk.params.voiceName !== currentVoice) {
                if (currentVoice) process.stdout.write('\n');
                currentVoice = chunk.params.voiceName;
                process.stderr.write(`\n[${currentVoice}] `);
              }
              process.stdout.write(chunk.params.delta);
            },
          );
          process.stdout.write('\n');
          if (format === 'json') {
            outputResult(result, format);
          }
        } else {
          const result = await client.call('voice.broadcast', {
            sessionId: opts.session,
            content: opts.prompt,
          });
          if (format === 'json') {
            outputResult(result, format);
          } else {
            const messages = (result as any).messages ?? [];
            for (const msg of messages) {
              process.stdout.write(`[${msg.voiceName ?? 'voice'}]\n${msg.content}\n\n`);
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
