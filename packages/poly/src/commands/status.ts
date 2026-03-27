import { Command } from 'commander';
import { PolyphonClient } from '../../../../src/sdk/index.js';
import { resolveConnection } from '../connect.js';
import { outputResult, outputError, type OutputFormat } from '../format.js';

export function registerStatusCommand(program: Command, polyVersion: string): void {
  program
    .command('status')
    .description('Show Polyphon API status and provider info')
    .option('--format <format>', 'Output format: human|json', 'human')
    .option('--remote <name>', 'Named remote connection')
    .action(async (opts) => {
      const format = (opts.format ?? 'human') as OutputFormat;
      const config = resolveConnection({ remote: opts.remote });
      const client = new PolyphonClient(config);
      try {
        await client.connect();
        const [apiStatus, providerStatus, mcpStatus] = await Promise.all([
          client.getApiStatus(),
          client.getProviderStatus(),
          client.getMcpStatus(),
        ]);

        if (format === 'json') {
          outputResult({ api: apiStatus, providers: providerStatus, mcp: mcpStatus }, format);
        } else {
          const api = apiStatus as any;
          const mcp = mcpStatus as any;

          // API server line
          let apiLine: string;
          if (api.running) {
            apiLine = `✓ Running on ${api.host}:${api.port}`;
          } else if (api.startupError) {
            apiLine = `✗ Failed to start — ${api.startupError}`;
          } else {
            apiLine = `✗ Stopped`;
          }
          const remoteLine = api.remoteAccessEnabled
            ? `⚠ Enabled — use a TLS reverse proxy if exposed over a network`
            : `✗ Disabled (localhost only)`;

          const mcpLine = mcp.running ? '✓ Running' : '✗ Stopped';

          const providerLines = (providerStatus as any[]).map((p: any) => {
            const s = p.apiKeyStatus;
            const name = (p.provider as string).charAt(0).toUpperCase() + (p.provider as string).slice(1);
            const lines: string[] = [];

            // API key status
            if (s.status === 'specific') {
              lines.push(`  ${name.padEnd(12)} API  ✓ Key set (${s.varName})`);
            } else if (s.status === 'fallback') {
              lines.push(`  ${name.padEnd(12)} API  ✓ Key set via fallback (${s.varName})`);
            } else if (s.status !== 'none' || !p.cliStatus) {
              lines.push(`  ${name.padEnd(12)} API  ✗ No API key configured`);
            }

            // CLI status
            if (p.cliStatus) {
              const cli = p.cliStatus;
              const prefix = `  ${''.padEnd(12)} CLI`;
              if (cli.available) {
                const loc = cli.path ? ` (${cli.path})` : '';
                lines.push(`${prefix}  ✓ ${cli.command} found${loc}`);
              } else {
                const reason = cli.error ? `: ${cli.error}` : ' — not found on PATH';
                lines.push(`${prefix}  ✗ ${cli.command}${reason}`);
              }
            }

            return lines.join('\n');
          }).join('\n');

          process.stdout.write(
            `poly:          ${polyVersion}\n` +
            `Polyphon:      ${api.version ?? 'unknown'}\n` +
            `API Server:    ${apiLine}\n` +
            `  Token:       ...${api.tokenFingerprint ?? 'n/a'}\n` +
            `  Clients:     ${api.activeConnections ?? 0} connected\n` +
            `  Remote:      ${remoteLine}\n` +
            `MCP Server:    ${mcpLine}\n` +
            `Providers:\n${providerLines}\n`,
          );

          // Warn prominently if remote access is on
          if (api.remoteAccessEnabled) {
            process.stderr.write(
              `\n⚠  Remote access is enabled (bound to 0.0.0.0). Use a TLS reverse proxy if exposed over a network.\n`,
            );
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
