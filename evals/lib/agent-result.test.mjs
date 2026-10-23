import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readAgentResult } from './agent-result.mjs';

let directory;
beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-agent-result-'));
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const written = (name, contents) => {
  const file = path.join(directory, name);
  writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return file;
};

describe('readAgentResult', () => {
  it('reads every figure the orchestrator wrote', () => {
    const figures = {
      costUsd: 1.5,
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 500,
      turns: 7,
      durationMs: 9000,
    };
    expect(readAgentResult(written('all.json', figures))).toEqual(figures);
  });

  it('sums input and output tokens when the total is missing', () => {
    const result = readAgentResult(written('sum.json', { inputTokens: 100, outputTokens: 20 }));
    expect(result.totalTokens).toBe(120);
  });

  it('leaves the total out when it cannot be known', () => {
    expect(readAgentResult(written('half.json', { inputTokens: 100 })).totalTokens).toBeUndefined();
    expect(readAgentResult(written('none.json', { costUsd: 0.1 })).totalTokens).toBeUndefined();
  });

  it('gives an empty result for a missing or unreadable file', () => {
    expect(readAgentResult(path.join(directory, 'absent.json'))).toEqual({});
    expect(readAgentResult(written('broken.json', '{not json'))).toEqual({});
  });
});
