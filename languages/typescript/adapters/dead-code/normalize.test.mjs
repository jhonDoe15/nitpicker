import { describe, expect, it } from 'vitest';
import { normalizeDeadCode } from './normalize.mjs';

const manifestReport = {
  issues: [
    {
      file: 'package.json',
      dependencies: [{ name: 'left-pad', line: 14, col: 5 }],
      devDependencies: [{ name: 'ms', line: 20, col: 5 }],
      binaries: [{ name: 'docker' }],
    },
    {
      file: 'src/main/a.ts',
      unlisted: [{ name: 'commander', line: 2, col: 1 }],
      unresolved: [{ name: './missing.js', line: 3, col: 1 }],
    },
  ],
};

describe('dependency findings', () => {
  const findings = normalizeDeadCode(manifestReport, 'dead-code');

  it('enforces unused, unlisted and unresolved entries under their own rule ids', () => {
    expect(
      findings.map(({ rule, path, classification }) => `${rule} ${path} ${classification}`),
    ).toEqual([
      'unused-dependency package.json enforceable',
      'unused-dependency package.json enforceable',
      'binaries package.json descriptive',
      'unlisted-dependency src/main/a.ts enforceable',
      'unresolved-import src/main/a.ts enforceable',
    ]);
  });

  it('names the allowed form and the exception route in each message', () => {
    const [unused, , , unlisted, unresolved] = findings.map(({ message }) => message);

    expect(unused).toBe(
      'Unused dependency left-pad: nothing imports or runs it. Remove it from package.json. ' +
        'If this is intended, add {"rule":"unused-dependency","paths":["package.json"],"reason":"..."} ' +
        'to "exceptions" in nitpicker.config.json.',
    );
    expect(unlisted).toBe(
      'Package commander is imported but not listed in package.json. ' +
        'Add it to dependencies (devDependencies for tests and tooling). ' +
        'If this is intended, add {"rule":"unlisted-dependency","paths":["src/main/a.ts"],"reason":"..."} ' +
        'to "exceptions" in nitpicker.config.json.',
    );
    expect(unresolved).toBe(
      'Import ./missing.js resolves to no file or package. ' +
        'Fix the path, or install the package and list it in package.json. ' +
        'If this is intended, add {"rule":"unresolved-import","paths":["src/main/a.ts"],"reason":"..."} ' +
        'to "exceptions" in nitpicker.config.json.',
    );
  });

  it('keys an entry by package name so a version bump is not a new finding', () => {
    const [unused] = findings;

    expect(unused.identity).toBe('name:left-pad|occurrence:1');
    expect(unused.location).toEqual({ line: 14, column: 5 });
  });

  it('counts a name listed twice as two entries', () => {
    const report = {
      issues: [
        {
          file: 'package.json',
          dependencies: [{ name: 'ms' }],
          devDependencies: [{ name: 'ms' }],
        },
      ],
    };

    expect(normalizeDeadCode(report, 'dead-code').map(({ identity }) => identity)).toEqual([
      'name:ms|occurrence:1',
      'name:ms|occurrence:2',
    ]);
  });

  it('drops the findings an exceptions entry lifts for their path', () => {
    const exceptions = [
      { rule: 'unused-dependency', paths: ['package.json'], reason: 'loaded by a plugin' },
      { rule: 'unlisted-dependency', paths: ['scripts/**'], reason: 'wrong path' },
    ];

    expect(
      normalizeDeadCode(manifestReport, 'dead-code', { exceptions }).map(({ rule }) => rule),
    ).toEqual(['binaries', 'unlisted-dependency', 'unresolved-import']);
  });
});

describe('unused files', () => {
  it('explain what to do whether knip lists them as files or as an issue category', () => {
    const report = {
      files: ['src/a.ts'],
      issues: [{ file: 'src/b.ts', files: [{ name: 'src/b.ts' }] }],
    };

    expect(normalizeDeadCode(report, 'dead-code').map(({ message }) => message)).toEqual([
      'Unused file: src/a.ts. Nothing imports it: delete it, or import it where it is needed.',
      'Unused file: src/b.ts. Nothing imports it: delete it, or import it where it is needed.',
    ]);
  });
});
