import { describe, expect, it } from 'vitest';
import { evaluateDuplicates } from './duplicates.mjs';

const byRule = (findings, rule) => findings.filter((finding) => finding.rule === rule);

describe('duplicates rule on neutral clones', () => {
  const clone = (first, second, extra = {}) => ({
    first: { file: first, line: 3 },
    second: { file: second, line: 8 },
    fragment: 'x',
    lines: 6,
    tokens: 60,
    ...extra,
  });

  it('orders the pair by path and numbers repeated pairs', () => {
    const findings = evaluateDuplicates(
      [clone('b.java', 'a.java'), clone('a.java', 'b.java')],
      'duplicates',
    );
    const failures = byRule(findings, 'duplicate-clone');
    expect(failures.map((finding) => [finding.path, finding.message])).toEqual([
      [
        'a.java',
        'This code repeats b.java:3 (6 lines). Keep one copy and call it from both places. If the repetition is intended, add a.java or b.java to "exclude" in nitpicker.config.json.',
      ],
      [
        'a.java',
        'This code repeats b.java:8 (6 lines). Keep one copy and call it from both places. If the repetition is intended, add a.java or b.java to "exclude" in nitpicker.config.json.',
      ],
    ]);
    expect(failures[0].identity).toMatch(
      /^pair:a\.java\|b\.java:fragment:[0-9a-f]{24}:occurrence:1$/,
    );
    expect(failures[1].identity).toMatch(
      /^pair:a\.java\|b\.java:fragment:[0-9a-f]{24}:occurrence:2$/,
    );
    expect(failures[0].location).toEqual({ line: 8 });
  });

  it('keeps the identity of one clone when another clone between the same files goes or comes', () => {
    const identities = (...fragments) =>
      byRule(
        evaluateDuplicates(
          fragments.map((fragment) => clone('a.java', 'b.java', { fragment })),
          'duplicates',
        ),
        'duplicate-clone',
      ).map((finding) => finding.identity);

    const both = identities('x', 'y');

    expect(identities('y')).toEqual([both[1]]);
    expect(identities('z', 'x', 'y')).toEqual([expect.any(String), ...both]);
  });

  it('ratchets each clone on its file pair and token count', () => {
    const [failure] = byRule(
      evaluateDuplicates([clone('b.java', 'a.java')], 'duplicates'),
      'duplicate-clone',
    );
    const [byLines] = byRule(
      evaluateDuplicates([clone('a.java', 'b.java', { tokens: undefined })], 'duplicates'),
      'duplicate-clone',
    );

    expect(failure.ratchet).toEqual({
      key: 'pair:a.java|b.java:clone',
      value: 60,
      divisible: true,
      mustKeepUnchangedLines: [
        { path: 'a.java', startLine: 8, endLine: 13 },
        { path: 'b.java', startLine: 3, endLine: 8 },
      ],
    });
    expect(byLines.ratchet.value).toBe(6);
  });

  it('names the file once when a file repeats itself', () => {
    const [failure] = byRule(
      evaluateDuplicates([clone('a.java', 'a.java')], 'duplicates'),
      'duplicate-clone',
    );
    expect(failure.message).toBe(
      'This code repeats a.java:8 (6 lines). Keep one copy and call it from both places. If the repetition is intended, add a.java to "exclude" in nitpicker.config.json.',
    );
  });

  it('adds size metrics and omits a location for an unusable line', () => {
    const findings = evaluateDuplicates(
      [clone('a.java', 'b.java', { first: { file: 'a.java' } })],
      'duplicates',
    );
    expect(byRule(findings, 'duplicate-clone-size').map((finding) => finding.metric)).toEqual([
      { name: 'lines', value: 6 },
      { name: 'tokens', value: 60 },
    ]);
    expect(byRule(findings, 'duplicate-clone')[0]).not.toHaveProperty('location');
    expect(byRule(findings, 'duplicate-clone')[0].ratchet).not.toHaveProperty(
      'mustKeepUnchangedLines',
    );
  });

  it('takes the end of a cloned range from the reported end line before the line count', () => {
    const [failure] = byRule(
      evaluateDuplicates(
        [clone('a.java', 'b.java', { first: { file: 'a.java', line: 3, endLine: 20 } })],
        'duplicates',
      ),
      'duplicate-clone',
    );

    expect(failure.ratchet.mustKeepUnchangedLines).toEqual([
      { path: 'a.java', startLine: 3, endLine: 20 },
      { path: 'b.java', startLine: 8, endLine: 13 },
    ]);
  });

  it.each([
    [
      'java',
      'package shop.service;\nimport java.util.List;\nimport static shop.Util.*;\nint total = 1;',
      'package shop.audit;\nimport java.util.List;\nint total = 1;',
    ],
    [
      'kotlin',
      'package shop.service\nimport shop.service.Tax as T\nval total = 1',
      'package shop.billing\nimport shop.billing.Tax as T\nval total = 1',
    ],
    [
      'python',
      'from shop.service import tax\nimport shop.service.util\ntotal = 1',
      'from shop.billing import tax\ntotal = 1',
    ],
    [
      'typescript',
      "import { tax } from './tax.js';\nimport {\n  a,\n} from '../shared/a.js';\nexport * from './all.js';\nconst total = 1;",
      "import { tax } from '../billing/tax.js';\nimport {\n  a,\n} from '../../shared/a.js';\nconst total = 1;",
    ],
    [
      'commonjs and dynamic import',
      "import fs = require('./fs');\nconst a = require('./a');\nconst b = await import('./b.js');\nrequire('./side');\nconst total = 1;",
      "import fs = require('../x/fs');\nconst a = require('../x/a');\nconst total = 1;",
    ],
  ])(
    'keeps the identity of a %s clone when only its package or import lines change',
    (_name, before, after) => {
      const identity = (fragment) =>
        byRule(
          evaluateDuplicates([clone('a.java', 'b.java', { fragment })], 'duplicates'),
          'duplicate-clone',
        )[0].identity;

      expect(identity(after)).toBe(identity(before));
      expect(identity(`${after}\nint other = 2;`)).not.toBe(identity(before));
    },
  );

  it('keeps the original hash of a clone that is only import lines', () => {
    const identity = (fragment) =>
      byRule(
        evaluateDuplicates([clone('a.java', 'b.java', { fragment })], 'duplicates'),
        'duplicate-clone',
      )[0].identity;
    const onlyImports = (target) =>
      `import { a } from '${target}';\nimport { b } from '${target}';`;

    expect(identity(onlyImports('./one'))).not.toBe(identity(onlyImports('./two')));
    expect(identity(onlyImports('./one'))).toBe(identity(onlyImports('./one')));
  });
});
