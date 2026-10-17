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
    [{ definitions: [{ ...definition, qualifier: '' }] }, 'facts.definitions[0].qualifier is ""'],
    [{ definitions: [{ ...definition, size: -1 }] }, 'facts.definitions[0].size is -1'],
    [
      { docComments: [{ file: 'a', line: 1, name: 'f', qualifier: 1, lines: [] }] },
      'facts.docComments[0].qualifier is 1',
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

  it.each([['./a.py'], ['a/'], ['a//b.py'], ['/repo/a.py'], ['C:/a.py'], ['a\\b.py'], ['../a.py']])(
    'rejects the path %s, naming the form it takes',
    (file) => {
      expect(() => validateFacts({ modules: [{ file, role: 'production' }] })).toThrow(
        new TypeError(
          `facts.modules[0].file is ${JSON.stringify(file)}: paths are project-relative with "/" separators, without "./", ".." or a trailing "/"; see "Facts schema" in docs/internals.md`,
        ),
      );
    },
  );

  it('takes "" as the project root for a package and a console module', () => {
    const facts = {
      packages: [{ root: '', published: false }],
      console: [{ file: '', test: '', messages: [] }],
    };

    expect(validateFacts(facts)).toBe(facts);
  });

  it.each([
    [{ imports: [{ from: 'b.py', to: 'a.py', names: [] }] }, 'facts.imports[0].from is "b.py"'],
    [{ imports: [{ from: 'a.py', to: 'c.py', names: [] }] }, 'facts.imports[0].to is "c.py"'],
    [{ definitions: [{ ...definition, file: 'c.py' }] }, 'facts.definitions[0].file is "c.py"'],
  ])('rejects %j, which names a file missing from modules', (lists, problem) => {
    const noun = Object.hasOwn(lists, 'imports') ? 'import' : 'definition';

    expect(() =>
      validateFacts({ modules: [{ file: 'a.py', role: 'production' }], ...lists }),
    ).toThrow(
      new TypeError(
        `${problem}, which is not in facts.modules: list that file in modules, or leave the ${noun} out; see "Facts schema" in docs/internals.md`,
      ),
    );
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
