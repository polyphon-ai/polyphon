import { Command } from 'commander';
import { PolyClient } from '../client.js';
import { resolveConnection } from '../connect.js';
import { outputResult, outputError, type OutputFormat } from '../format.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show Polyphon API status and provider info')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (opts) => {
      const format = (opts.format ?? 'human') as OutputFormat;
      const client = new PolyClient();
      try {
        const config = resolveConnection({ remote: opts.remote });
        await client.connect(config);
        const [apiStatus, providerStatus, mcpStatus] = await Promise.all([
          client.call('api.getStatus'),
          client.call('settings.getProviderStatus'),
          client.call('mcp.getStatus'),
        ]);

        if (format === 'json') {
          outputResult({ api: apiStatus, providers: providerStatus, mcp: mcpStatus }, format);
        } else {
          const apiLine = apiStatus.running
            ? `✓ Running on ${apiStatus.host}:${apiStatus.port}`
            : `✗ Stopped`;
          const mcpLine = mcpStatus.running ? '✓ Running' : '✗ Stopped';
          const providers = (providerStatus as any[])
            .map((p: any) => `  ${p.provider}: ${p.apiKeyStatus.status}`)
            .join('\n');
          process.stdout.write(`API Server: ${apiLine}\nMCP Server: ${mcpLine}\nProviders:\n${providers}\n`);
        }
      } catch (err) {
        outputError(err, format);
        process.exit(1);
      } finally {
        client.close();
      }
    });
}
