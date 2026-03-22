import { describe, it, expect } from 'vitest';
import { TOOL_REGISTRY, resolveTools } from './index';

describe('TOOL_REGISTRY', () => {
  it('contains read_file, write_file, list_directory', () => {
    expect(TOOL_REGISTRY).toHaveProperty('read_file');
    expect(TOOL_REGISTRY).toHaveProperty('write_file');
    expect(TOOL_REGISTRY).toHaveProperty('list_directory');
  });

  it('each tool has name, description, parameters, and execute', () => {
    for (const tool of Object.values(TOOL_REGISTRY)) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters.type).toBe('object');
      expect(typeof tool.execute).toBe('function');
    }
  });
});

describe('resolveTools', () => {
  it('returns matching tool definitions', () => {
    const tools = resolveTools(['read_file', 'write_file']);
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual(['read_file', 'write_file']);
  });

  it('filters out unknown names', () => {
    const tools = resolveTools(['read_file', 'unknown_tool']);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('read_file');
  });

  it('returns empty array for empty input', () => {
    expect(resolveTools([])).toEqual([]);
  });

  it('returns empty array for all unknown names', () => {
    expect(resolveTools(['not_a_tool', 'also_not'])).toEqual([]);
  });
});
