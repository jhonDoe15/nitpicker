import { describe, expect, it } from 'vitest';
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

    expect(messages[0]).toContain(
      'debug_dump is only used by tests. Make it private to its module, or use it from production code.',
    );
    expect(messages[2]).toContain('Module lib/helpers.py is only used by tests.');
  });

  it('counts a whole-module production import as a use of every name', () => {
    const facts = factFixture('test-only');
    const imports = [
      ...facts.imports,
      { from: 'lib/main.py', to: 'lib/core.py', names: [{ name: '*' }], role: 'production' },
    ];

    expect(
      rows(findingsOf({ ...facts, imports }, [RULE])).filter(([, file]) => file === 'lib/core.py'),
    ).toEqual([]);
  });

  it('judges a published package once it is no longer published', () => {
    const facts = factFixture('test-only');
    const packages = [{ root: 'pkg', published: false }];

    expect(rows(findingsOf({ ...facts, packages }, [RULE]))).toContainEqual([
      RULE,
      'pkg/util.py',
      'files:pkg/util.py',
    ]);
  });

  it('honours an exception', () => {
    const policy = { exceptions: [exception(RULE, 'lib/core.py')] };

    expect(rows(fixtureFindings('test-only', [RULE], { policy })).map(([, file]) => file)).toEqual([
      'lib/helpers.py',
      'lib/types.py',
    ]);
  });
});
