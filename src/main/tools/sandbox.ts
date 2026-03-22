import { resolve, relative, isAbsolute } from 'path';
import type { ToolDefinition } from './types';

// Mapping of tool names to which of their args contain filesystem paths.
const PATH_ARGS: Record<string, string[]> = {
  read_file:      ['path'],
  write_file:     ['path'],
  list_directory: ['path'],
  run_command:    ['cwd'],
  search_files:   ['directory'],
  grep_files:     ['directory'],
  move_file:      ['source', 'destination'],
  copy_file:      ['source', 'destination'],
  delete_file:    ['path'],
};

// Path args that are optional — when absent, default to the sandbox directory
// so the voice operates within the sandbox rather than the process cwd.
const OPTIONAL_PATH_ARGS: Record<string, Set<string>> = {
  run_command:  new Set(['cwd']),
  search_files: new Set(['directory']),
};

function assertInSandbox(resolved: string, sandboxDir: string): void {
  const rel = relative(sandboxDir, resolved);
  // A path escapes the sandbox if the relative path starts with '..' or is absolute.
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Access denied: path is outside the sandboxed working directory`);
  }
}

function sandboxOneTool(tool: ToolDefinition, sandboxDir: string, enforce: boolean): ToolDefinition {
  const pathArgNames = PATH_ARGS[tool.name];
  if (!pathArgNames) return tool;

  const optionals = OPTIONAL_PATH_ARGS[tool.name] ?? new Set<string>();

  return {
    ...tool,
    async execute(rawArgs) {
      const args = { ...rawArgs };

      for (const argName of pathArgNames) {
        const raw = args[argName];

        if (raw == null || raw === '') {
          if (optionals.has(argName)) {
            // Default missing optional path args to sandboxDir
            args[argName] = sandboxDir;
          }
          continue;
        }

        // Resolve relative to sandboxDir so the voice can use relative paths naturally
        const resolved = resolve(sandboxDir, String(raw));
        if (enforce) assertInSandbox(resolved, sandboxDir);
        args[argName] = resolved;
      }

      return tool.execute(args);
    },
  };
}

export function sandboxTools(tools: ToolDefinition[], sandboxDir: string, enforce = true): ToolDefinition[] {
  return tools.map((tool) => sandboxOneTool(tool, sandboxDir, enforce));
}
