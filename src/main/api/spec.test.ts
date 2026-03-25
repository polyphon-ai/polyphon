import { describe, it, expect } from 'vitest';
import { buildOpenRpcSpec } from './spec';

const ALL_METHOD_NAMES = [
  'api.authenticate',
  'api.getStatus',
  'api.getSpec',
  'compositions.list',
  'compositions.get',
  'compositions.create',
  'compositions.update',
  'compositions.delete',
  'compositions.archive',
  'sessions.list',
  'sessions.get',
  'sessions.create',
  'sessions.delete',
  'sessions.rename',
  'sessions.archive',
  'sessions.messages',
  'sessions.export',
  'voice.broadcast',
  'voice.ask',
  'voice.abort',
  'search.messages',
  'settings.getProviderStatus',
  'settings.getDebugInfo',
  'mcp.getStatus',
  'mcp.setEnabled',
];

describe('buildOpenRpcSpec', () => {
  const spec = buildOpenRpcSpec('1.2.3');

  it('has openrpc === "1.3.0"', () => {
    expect(spec.openrpc).toBe('1.3.0');
  });

  it('injects version into info.version', () => {
    expect(spec.info.version).toBe('1.2.3');
  });

  it('has a non-empty info.title', () => {
    expect(typeof spec.info.title).toBe('string');
    expect(spec.info.title.length).toBeGreaterThan(0);
  });

  it('has exactly 25 methods', () => {
    expect(spec.methods).toHaveLength(25);
  });

  it('contains all method names from the method inventory', () => {
    const names = spec.methods.map((m) => m.name);
    for (const name of ALL_METHOD_NAMES) {
      expect(names).toContain(name);
    }
  });

  it('method names are unique (no duplicates)', () => {
    const names = spec.methods.map((m) => m.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('api.authenticate and api.getSpec are both present', () => {
    const names = spec.methods.map((m) => m.name);
    expect(names).toContain('api.authenticate');
    expect(names).toContain('api.getSpec');
  });

  it('each method has required fields with correct types', () => {
    for (const method of spec.methods) {
      expect(typeof method.name).toBe('string');
      expect(typeof method.description).toBe('string');
      expect(method.description.length).toBeGreaterThan(0);
      expect(Array.isArray(method.params)).toBe(true);
      expect(method.result).toBeDefined();
      expect(typeof method.result.name).toBe('string');
      expect(method.result.schema).toBeDefined();
    }
  });

  it('sessions.create has compositionId param', () => {
    const method = spec.methods.find((m) => m.name === 'sessions.create')!;
    expect(method).toBeDefined();
    const paramNames = method.params.map((p) => p.name);
    expect(paramNames).toContain('compositionId');
  });

  it('voice.ask has voiceId and content params', () => {
    const method = spec.methods.find((m) => m.name === 'voice.ask')!;
    expect(method).toBeDefined();
    const paramNames = method.params.map((p) => p.name);
    expect(paramNames).toContain('voiceId');
    expect(paramNames).toContain('content');
  });

  it('sessions.export has format param with enum values', () => {
    const method = spec.methods.find((m) => m.name === 'sessions.export')!;
    expect(method).toBeDefined();
    const formatParam = method.params.find((p) => p.name === 'format')!;
    expect(formatParam).toBeDefined();
    expect((formatParam.schema as any).enum).toEqual(
      expect.arrayContaining(['markdown', 'json', 'plaintext']),
    );
  });

  it('components.schemas is present and non-empty', () => {
    expect(spec.components).toBeDefined();
    expect(spec.components.schemas).toBeDefined();
    expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(0);
  });

  it('all $ref values resolve to a key in components.schemas', () => {
    const refs: string[] = [];
    const collect = (node: unknown) => {
      if (Array.isArray(node)) { node.forEach(collect); return; }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          if (k === '$ref' && typeof v === 'string') refs.push(v);
          else collect(v);
        }
      }
    };
    collect(spec.methods);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const key = ref.replace('#/components/schemas/', '');
      expect(spec.components.schemas).toHaveProperty(key);
    }
  });

  it('version injection is independent per call', () => {
    const spec2 = buildOpenRpcSpec('9.9.9');
    expect(spec2.info.version).toBe('9.9.9');
    expect(spec.info.version).toBe('1.2.3');
  });
});
