declare const __POLY_VERSION__: string;

import { Command } from 'commander';
import { registerStatusCommand } from './commands/status.js';
import { registerCompositionsCommand } from './commands/compositions.js';
import { registerSessionsCommand } from './commands/sessions.js';
import { registerRunCommand } from './commands/run.js';
import { registerAskCommand } from './commands/ask.js';
import { registerSearchCommand } from './commands/search.js';
import { registerRemoteCommand } from './commands/remote.js';

const program = new Command();

program
  .name('poly')
  .description('CLI for controlling a running Polyphon instance')
  .version(__POLY_VERSION__);

registerStatusCommand(program, __POLY_VERSION__);
registerCompositionsCommand(program);
registerSessionsCommand(program);
registerRunCommand(program);
registerAskCommand(program);
registerSearchCommand(program);
registerRemoteCommand(program);

program.parse(process.argv);
