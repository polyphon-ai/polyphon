import { Command } from 'commander';
import { PolyClient } from '../client.js';
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
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);

        if (opts.stream) {
          const result = await client.callStreaming(
            'voice.ask',
            { sessionId: opts.session, voiceId: opts.voice, content: opts.prompt },
            (chunk) => {
              process.stdout.write(chunk.params.delta);
            },
          );
          process.stdout.write('\n');
          if (format === 'json') {
            outputResult(result, format);
          }
        } else {
          const result = await client.call('voice.ask', {
            sessionId: opts.session,
            voiceId: opts.voice,
            content: opts.prompt,
          });
          if (format === 'json') {
            outputResult(result, format);
          } else {
            const msg = (result as any).message;
            if (msg) {
              process.stdout.write(`[${msg.voiceName ?? 'voice'}]\n${msg.content}\n`);
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
