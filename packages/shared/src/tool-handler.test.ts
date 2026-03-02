import { describe, it, expect } from 'vitest';
import { respond, respondError } from './tool-handler.js';

describe('respond', () => {
  it('wraps data in MCP content format', () => {
    const result = respond({ status: 'success', operation: 'test', summary: 'ok' });
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe('success');
    expect(parsed.operation).toBe('test');
    expect(parsed.summary).toBe('ok');
  });

  it('preserves all metadata fields', () => {
    const result = respond({
      status: 'success',
      operation: 'x',
      summary: 's',
      metadata: { count: 42 },
      warnings: ['warn1'],
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.metadata.count).toBe(42);
    expect(parsed.warnings).toEqual(['warn1']);
  });
});

describe('respondError', () => {
  it('creates error response with isError flag', () => {
    const result = respondError('something broke');
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('something broke');
  });
});
