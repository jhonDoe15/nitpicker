import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFactsFile, validateFacts } from './schema.mjs';
import { factFixture } from './test-support/fact-fixtures.mjs';

const definition = {
  file: 'a.py',
  name: 'f',
  kind: 'function',
  line: 1,
  exported: true,
  tokens: [],
};

describe('facts schema', () => {
  it.each([
    'reuse',
    'sibling-head',
    'sibling-base',
    'features',
    'test-only',
    'doc-comments',
    'console',
  ])('accepts the %s fixture', (name) => {
    expect(() => validateFacts(factFixture(name))).not.toThrow();
  });

  it.each([
    [[], 'facts must be a JSON object'],
    [{ definitions: {} }, 'facts.definitions must be an array'],
    [{ definitions: [1] }, 'facts.definitions[0] must be an object'],
    [{ definitions: [{ ...definition, kind: 'method' }] }, 'facts.definitions[0].kind is "method"'],
    [{ definitions: [{ ...definition, line: 0 }] }, 'facts.definitions[0].line is 0'],
    [
      { definitions: [{ ...definition, tokens: undefined }] },
      'facts.definitions[0].tokens is missing',
    ],
    [{ imports: [{ from: 'a', to: 'b', names: ['x'] }] }, 'facts.imports[0].names is ["x"]'],
    [
      { imports: [{ from: 'a', to: 'b', names: [], role: 'tests' }] },
      'facts.imports[0].role is "tests"',
    ],
    [{ modules: [{ file: 'a', role: 'main' }] }, 'facts.modules[0].role is "main"'],
    [{ console: [{ file: 'a', messages: [] }] }, 'facts.console[0].test is missing'],
    [
      { docComments: [{ file: 'a', line: 1, name: 'f', lines: 'x' }] },
      'facts.docComments[0].lines',
    ],
    [{ packages: [{ root: 'a' }] }, 'facts.packages[0].published is missing'],
  ])('rejects %j', (facts, message) => {
    expect(() => validateFacts(facts)).toThrow(message);
  });

  it('reads and checks a facts file', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'facts-'));
    try {
      const file = path.join(directory, 'facts.json');
      writeFileSync(file, JSON.stringify({ definitions: [definition] }));
      expect(readFactsFile(file)).toEqual({ definitions: [definition] });
      writeFileSync(file, JSON.stringify({ definitions: [{ ...definition, name: '' }] }));
      expect(() => readFactsFile(file)).toThrow('facts.definitions[0].name is ""');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
