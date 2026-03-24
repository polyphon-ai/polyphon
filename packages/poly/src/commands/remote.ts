import { Command } from 'commander';
import { addRemote, listRemotes, removeRemote } from '../remotes.js';

export function registerRemoteCommand(program: Command): void {
  const remote = program
    .command('remote')
    .description('Manage named remote connections');

  remote
    .command('add <name>')
    .description('Add a named remote')
    .requiredOption('--host <host>', 'Remote hostname or IP')
    .option('--port <port>', 'Remote port', '7432')
    .requiredOption('--token-file <path>', 'Path to token file')
    .action((name, opts) => {
      addRemote({
        name,
        host: opts.host,
        port: parseInt(opts.port, 10) || 7432,
        tokenFile: opts.tokenFile,
      });
      process.stdout.write(`Remote "${name}" added.\n`);
    });

  remote
    .command('list')
    .description('List named remotes')
    .action(() => {
      const remotes = listRemotes();
      if (remotes.length === 0) {
        process.stdout.write('No remotes configured.\n');
      } else {
        for (const r of remotes) {
          process.stdout.write(`${r.name}: ${r.host}:${r.port ?? 7432} (token: ${r.tokenFile})\n`);
        }
      }
    });

  remote
    .command('remove <name>')
    .description('Remove a named remote')
    .action((name) => {
      const removed = removeRemote(name);
      if (removed) {
        process.stdout.write(`Remote "${name}" removed.\n`);
      } else {
        process.stderr.write(`Remote "${name}" not found.\n`);
        process.exit(1);
      }
    });
}
