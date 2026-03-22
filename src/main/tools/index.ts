import type { ToolDefinition } from './types';
import { readFileTool } from './readFile';
import { writeFileTool } from './writeFile';
import { listDirectoryTool } from './listDirectory';
import { runCommandTool } from './runCommand';
import { searchFilesTool } from './searchFiles';
import { grepFilesTool } from './grepFiles';
import { moveFileTool } from './moveFile';
import { copyFileTool } from './copyFile';
import { deleteFileTool } from './deleteFile';
import { fetchUrlTool } from './fetchUrl';

export { type ToolDefinition } from './types';
import { sandboxTools } from './sandbox';

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  read_file: readFileTool,
  write_file: writeFileTool,
  list_directory: listDirectoryTool,
  run_command: runCommandTool,
  search_files: searchFilesTool,
  grep_files: grepFilesTool,
  move_file: moveFileTool,
  copy_file: copyFileTool,
  delete_file: deleteFileTool,
  fetch_url: fetchUrlTool,
};

export function resolveTools(names: string[], sandboxDir?: string | null): ToolDefinition[] {
  const tools = names
    .filter((name) => name in TOOL_REGISTRY)
    .map((name) => TOOL_REGISTRY[name]!);
  return sandboxDir ? sandboxTools(tools, sandboxDir) : tools;
}
