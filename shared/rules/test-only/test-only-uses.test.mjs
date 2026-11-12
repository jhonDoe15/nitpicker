import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../exceptions.mjs';
import {
  exception,
  factFixture,
  findingsOf,
  fixtureFindings,
  rows,
} from '../facts/test-support/fact-fixtures.mjs';

const RULE = 'test-only-export';

describe('test-only-export over facts', () => {
  it('reports names and modules only tests use, through re-exports', () => {
    expect(rows(fixtureFindings('test-only', [RULE]))).toEqual([
      [RULE, 'lib/core.py', 'exports:debug_dump'],
      [RULE, 'lib/core.py', 'exports:make'],
      [RULE, 'lib/helpers.py', 'files:lib/helpers.py'],
      [RULE, 'lib/types.py', 'types:Shape'],
    ]);
  });

  it('words the message for any language', () => {
    const messages = fixtureFindings('test-only', [RULE]).map(({ message }) => message);

    expect(messages[0]).toBe(
      `debug_dump is only used by tests. Make it private to its module, or use it from production code. ${exceptionHint(RULE, 'lib/core.py')}`,
    );
    expect(messages[2]).toBe(
      `Module lib/helpers.py is only used by tests. Move it beside the tests as a test helper, or use it from production code. ${exceptionHint(RULE, 'lib/helpers.py')}`,
    );
  });

  it('counts a whole-module production import as a use of every name', () => {
    const facts = factFixture('test-only');
    const imports = [
      ...facts.imports,
      { from: 'lib/main.py', to: 'lib/core.py', names: [{ name: '*' }] },
    ];

    expect(
      rows(findingsOf({ ...facts, imports }, [RULE])).filter(([, file]) => file === 'lib/core.py'),
    ).toEqual([]);
  });

  it('judges a published package once it is no longer published', () => {
    const facts = factFixture('test-only');
    const packages = [{ root: 'pkg', published: false }];

    expect(rows(findingsOf({ ...facts, packages }, [RULE]))).toEqual([
      [RULE, 'lib/core.py', 'exports:debug_dump'],
      [RULE, 'lib/core.py', 'exports:make'],
      [RULE, 'lib/helpers.py', 'files:lib/helpers.py'],
      [RULE, 'lib/types.py', 'types:Shape'],
      [RULE, 'pkg/util.py', 'files:pkg/util.py'],
    ]);
  });

  it('counts a framework entry definition as used in production', () => {
    const facts = factFixture('test-only');
    const definitions = facts.definitions.map((definition) =>
      definition.name === 'make' ? { ...definition, entry: true } : definition,
    );

    expect(
      rows(findingsOf({ ...facts, definitions }, [RULE])).map(([, , identity]) => identity),
    ).toEqual(['exports:debug_dump', 'files:lib/helpers.py', 'types:Shape']);
  });

  it('honours an exception', () => {
    const policy = { exceptions: [exception(RULE, 'lib/core.py')] };

    expect(rows(fixtureFindings('test-only', [RULE], { policy })).map(([, file]) => file)).toEqual([
      'lib/helpers.py',
      'lib/types.py',
    ]);
  });

  it('takes the role of an import from its importing module', () => {
    const facts = {
      modules: [
        { file: 'src/a.py', role: 'production' },
        { file: 'tests/test_a.py', role: 'test' },
      ],
      packages: [],
      definitions: [
        { file: 'src/a.py', name: 'foo', kind: 'function', line: 1, exported: true, tokens: ['x'] },
      ],
      imports: [{ from: 'tests/test_a.py', to: 'src/a.py', names: [{ name: 'foo' }] }],
    };

    expect(rows(findingsOf(facts, [RULE]))).toEqual([[RULE, 'src/a.py', 'files:src/a.py']]);
  });

  it('follows a namespace re-export to every name of its target', () => {
    const facts = factFixture('test-only');
    const modules = [...facts.modules, { file: 'lib/api.py', role: 'production' }];
    const imports = [
      ...facts.imports,
      {
        from: 'lib/api.py',
        to: 'lib/core.py',
        names: [{ name: '*', alias: 'core' }],
        reexport: true,
      },
      { from: 'lib/main.py', to: 'lib/api.py', names: [{ name: 'core' }] },
    ];

    expect(
      rows(findingsOf({ ...facts, modules, imports }, [RULE])).filter(
        ([, file]) => file === 'lib/core.py',
      ),
    ).toEqual([]);
  });
});
