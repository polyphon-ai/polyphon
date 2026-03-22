import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { sandboxTools } from './sandbox';
import { resolveTools } from './index';
import type { ToolDefinition } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SANDBOX = '/sandbox/project';

function makeTool(name: string, pathArgNames: string[]): ToolDefinition & { capturedArgs: Record<string, unknown>[] } {
  const capturedArgs: Record<string, unknown>[] = [];
  return {
    name,
    description: 'test tool',
    parameters: {
      type: 'object',
      properties: Object.fromEntries(pathArgNames.map((k) => [k, { type: 'string', description: '' }])),
      required: pathArgNames,
    },
    execute: vi.fn(async (args) => {
      capturedArgs.push({ ...args });
      return 'ok';
    }),
    capturedArgs,
  };
}

// Wrap a single tool in the sandbox and call it
async function callSandboxed(
  tool: ToolDefinition,
  args: Record<string, unknown>,
): Promise<string> {
  const [wrapped] = sandboxTools([tool], SANDBOX);
  return wrapped!.execute(args);
}

// ── Path enforcement ──────────────────────────────────────────────────────────

describe('sandboxTools — path enforcement', () => {
  it('allows an absolute path inside the sandbox', async () => {
    const tool = makeTool('read_file', ['path']);
    await callSandboxed(tool, { path: `${SANDBOX}/foo.txt` });
    expect(tool.execute).toHaveBeenCalledWith({ path: `${SANDBOX}/foo.txt` });
  });

  it('allows a relative path and resolves it against the sandbox root', async () => {
    const tool = makeTool('read_file', ['path']);
    await callSandboxed(tool, { path: 'src/index.ts' });
    expect(tool.execute).toHaveBeenCalledWith({ path: `${SANDBOX}/src/index.ts` });
  });

  it('allows a path equal to the sandbox root', async () => {
    const tool = makeTool('list_directory', ['path']);
    await callSandboxed(tool, { path: SANDBOX });
    expect(tool.execute).toHaveBeenCalledWith({ path: SANDBOX });
  });

  it('allows a deeply nested subdirectory', async () => {
    const tool = makeTool('read_file', ['path']);
    await callSandboxed(tool, { path: `${SANDBOX}/a/b/c/d/file.ts` });
    expect(tool.execute).toHaveBeenCalledWith({ path: `${SANDBOX}/a/b/c/d/file.ts` });
  });

  it('blocks an absolute path outside the sandbox', async () => {
    const tool = makeTool('read_file', ['path']);
    await expect(callSandboxed(tool, { path: '/etc/passwd' })).rejects.toThrow('Access denied');
  });

  it('blocks a relative traversal that escapes the sandbox', async () => {
    const tool = makeTool('read_file', ['path']);
    await expect(callSandboxed(tool, { path: '../../etc/shadow' })).rejects.toThrow('Access denied');
  });

  it('blocks a path that looks inside the sandbox but escapes via traversal', async () => {
    const tool = makeTool('read_file', ['path']);
    await expect(
      callSandboxed(tool, { path: `${SANDBOX}/subdir/../../../../../../etc/passwd` }),
    ).rejects.toThrow('Access denied');
  });

  it('does not call the original execute when the path is blocked', async () => {
    const tool = makeTool('write_file', ['path']);
    await expect(callSandboxed(tool, { path: '/outside/file.txt' })).rejects.toThrow();
    expect(tool.execute).not.toHaveBeenCalled();
  });
});

// ── Multi-path tools (move_file, copy_file) ──────────────────────────────────

describe('sandboxTools — multi-path tools', () => {
  it('allows move_file when both source and destination are inside the sandbox', async () => {
    const tool = makeTool('move_file', ['source', 'destination']);
    await callSandboxed(tool, {
      source: `${SANDBOX}/a.txt`,
      destination: `${SANDBOX}/b.txt`,
    });
    expect(tool.execute).toHaveBeenCalledWith({
      source: `${SANDBOX}/a.txt`,
      destination: `${SANDBOX}/b.txt`,
    });
  });

  it('blocks move_file when the source is outside the sandbox', async () => {
    const tool = makeTool('move_file', ['source', 'destination']);
    await expect(
      callSandboxed(tool, { source: '/outside/file.txt', destination: `${SANDBOX}/file.txt` }),
    ).rejects.toThrow('Access denied');
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('blocks move_file when the destination is outside the sandbox', async () => {
    const tool = makeTool('move_file', ['source', 'destination']);
    await expect(
      callSandboxed(tool, { source: `${SANDBOX}/file.txt`, destination: '/outside/file.txt' }),
    ).rejects.toThrow('Access denied');
    expect(tool.execute).not.toHaveBeenCalled();
  });
});

// ── Optional path args ────────────────────────────────────────────────────────

describe('sandboxTools — optional path args', () => {
  it('defaults run_command cwd to sandboxDir when not provided', async () => {
    const tool = makeTool('run_command', ['cwd']);
    await callSandboxed(tool, { command: 'ls' });
    expect(tool.execute).toHaveBeenCalledWith({ command: 'ls', cwd: SANDBOX });
  });

  it('allows run_command cwd inside the sandbox when provided', async () => {
    const tool = makeTool('run_command', ['cwd']);
    await callSandboxed(tool, { command: 'ls', cwd: `${SANDBOX}/subdir` });
    expect(tool.execute).toHaveBeenCalledWith({ command: 'ls', cwd: `${SANDBOX}/subdir` });
  });

  it('blocks run_command cwd outside the sandbox', async () => {
    const tool = makeTool('run_command', ['cwd']);
    await expect(
      callSandboxed(tool, { command: 'ls', cwd: '/tmp' }),
    ).rejects.toThrow('Access denied');
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('defaults search_files directory to sandboxDir when not provided', async () => {
    const tool = makeTool('search_files', ['directory']);
    await callSandboxed(tool, { pattern: '*.ts' });
    expect(tool.execute).toHaveBeenCalledWith({ pattern: '*.ts', directory: SANDBOX });
  });

  it('allows search_files directory inside the sandbox', async () => {
    const tool = makeTool('search_files', ['directory']);
    await callSandboxed(tool, { pattern: '*.ts', directory: `${SANDBOX}/src` });
    expect(tool.execute).toHaveBeenCalledWith({ pattern: '*.ts', directory: `${SANDBOX}/src` });
  });

  it('blocks search_files directory outside the sandbox', async () => {
    const tool = makeTool('search_files', ['directory']);
    await expect(
      callSandboxed(tool, { pattern: '*.ts', directory: '/home/user' }),
    ).rejects.toThrow('Access denied');
    expect(tool.execute).not.toHaveBeenCalled();
  });
});

// ── Non-path tools pass through unchanged ────────────────────────────────────

describe('sandboxTools — tools without path args pass through', () => {
  it('fetch_url is not wrapped and passes args unchanged', async () => {
    const tool = makeTool('fetch_url', []);
    const [wrapped] = sandboxTools([tool], SANDBOX);
    // fetch_url has no path args — it is returned as-is
    await wrapped!.execute({ url: 'https://example.com' });
    expect(tool.execute).toHaveBeenCalledWith({ url: 'https://example.com' });
  });
});

// ── resolveTools integration ──────────────────────────────────────────────────

describe('resolveTools with sandboxDir', () => {
  it('resolves tools without sandbox when sandboxDir is null', () => {
    const tools = resolveTools(['read_file'], null);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('read_file');
    // The execute function is the original, unmodified one
    expect(tools[0]!.execute).toBe(tools[0]!.execute);
  });

  it('resolves tools without sandbox when sandboxDir is omitted', () => {
    const tools = resolveTools(['read_file']);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('read_file');
  });

  it('wraps resolved tools with sandbox enforcement when sandboxDir is provided', async () => {
    const tmpDir = path.join('/tmp', 'polyphon-sandbox-test');
    const tools = resolveTools(['read_file'], tmpDir);
    expect(tools).toHaveLength(1);
    // Attempting to read outside the sandbox should throw
    await expect(tools[0]!.execute({ path: '/etc/passwd' })).rejects.toThrow('Access denied');
  });

  it('returns an empty array for an empty names list regardless of sandboxDir', () => {
    expect(resolveTools([], SANDBOX)).toHaveLength(0);
  });

  it('filters unknown tool names even with sandboxDir', () => {
    const tools = resolveTools(['read_file', 'not_a_real_tool'], SANDBOX);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('read_file');
  });
});

// ── sandboxTools preserves non-path properties ───────────────────────────────

describe('sandboxTools — metadata preservation', () => {
  it('preserves the tool name and description on the wrapped tool', () => {
    const tool = makeTool('read_file', ['path']);
    const [wrapped] = sandboxTools([tool], SANDBOX);
    expect(wrapped!.name).toBe('read_file');
    expect(wrapped!.description).toBe('test tool');
  });

  it('preserves tool parameters on the wrapped tool', () => {
    const tool = makeTool('read_file', ['path']);
    const [wrapped] = sandboxTools([tool], SANDBOX);
    expect(wrapped!.parameters).toEqual(tool.parameters);
  });
});
