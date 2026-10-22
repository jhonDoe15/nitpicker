import { describe, expect, it } from 'vitest';
import {
  fakeEslintCliPath,
  comparisonOptions,
  fixtureAnalyzer,
  useEslintFixtures,
  recordedEslintAnalyzer,
  policyFiles,
  sourceWithDebugger,
} from './test-support/eslint-fixtures.mjs';
import { runQualityDiff } from '../../../comparison/run-diff.mjs';
import { renameFile, writeFiles } from '../../../git/test-support/fixture-files.mjs';
import { commit } from '../../../git/test-support/git-repository.mjs';

const { createRepository } = useEslintFixtures();

describe('ESLint finding comparison', () => {
  it('preserves unchanged, line-moved, and renamed findings while separating added and resolved findings', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/stable.ts': sourceWithDebugger('stable'),
      'src/main/resolved.ts': sourceWithDebugger('resolved'),
      'src/main/moved.ts': sourceWithDebugger('moved'),
      'src/main/old-name.ts': sourceWithDebugger('renamed'),
    });

    writeFiles(repository.root, {
      'src/main/resolved.ts': 'export function resolved() {}\n',
      'src/main/moved.ts': `const unrelated = true;\nvoid unrelated;\n\n${sourceWithDebugger('moved')}`,
      'src/main/added.ts': sourceWithDebugger('added'),
    });
    renameFile(repository.root, 'src/main/old-name.ts', 'src/main/new-name.ts');
    commit(repository.root, 'change ESLint findings');

    const report = runQualityDiff(
      comparisonOptions(repository, [recordedEslintAnalyzer('eslint-lint')]),
    );

    expect(report.toolErrors).toEqual([]);
    expect(report.summary.overallStatus).toBe('completed');
    expect(report.summary.renamedPaths).toBe(1);
    expect(report.newFindings).toEqual([
      {
        tool: 'eslint-lint',
        rule: 'no-debugger',
        path: 'src/main/added.ts',
        identity:
          'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
        message:
          'Unexpected \'debugger\' statement. If this is intended, add {"rule":"no-debugger","paths":["src/main/added.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'added',
        location: { line: 2, column: 3 },
        ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
      },
    ]);
    expect(report.resolvedFindings).toEqual([
      {
        tool: 'eslint-lint',
        rule: 'no-debugger',
        path: 'src/main/resolved.ts',
        identity:
          'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
        message:
          'Unexpected \'debugger\' statement. If this is intended, add {"rule":"no-debugger","paths":["src/main/resolved.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'resolved',
        location: { line: 2, column: 3 },
        ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
      },
    ]);
    expect(report.unchangedFindings).toHaveLength(3);
    expect(report.unchangedFindings).toEqual([
      {
        tool: 'eslint-lint',
        rule: 'no-debugger',
        path: 'src/main/moved.ts',
        identity:
          'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
        message:
          'Unexpected \'debugger\' statement. If this is intended, add {"rule":"no-debugger","paths":["src/main/moved.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'moved',
        location: { line: 5, column: 3 },
        ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
      },
      {
        tool: 'eslint-lint',
        rule: 'no-debugger',
        path: 'src/main/new-name.ts',
        identity:
          'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
        message:
          'Unexpected \'debugger\' statement. If this is intended, add {"rule":"no-debugger","paths":["src/main/new-name.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'renamed',
        location: { line: 2, column: 3 },
        ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
      },
      {
        tool: 'eslint-lint',
        rule: 'no-debugger',
        path: 'src/main/stable.ts',
        identity:
          'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
        message:
          'Unexpected \'debugger\' statement. If this is intended, add {"rule":"no-debugger","paths":["src/main/stable.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'stable',
        location: { line: 2, column: 3 },
        ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
      },
    ]);
  });
  it('runs all four command policies through the shared report pipeline', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/source.ts': 'export const clean = true;\n',
    });
    writeFiles(repository.root, {
      'src/main/source.ts': [
        'debugger;',
        'export function empty() {}',
        "console.log('fixture');",
        'export function unreachable() {',
        '  return;',
        '  debugger;',
        '}',
        '',
      ].join('\n'),
    });
    commit(repository.root, 'add policy findings');

    const report = runQualityDiff(
      comparisonOptions(repository, [
        recordedEslintAnalyzer('eslint-lint'),
        recordedEslintAnalyzer(
          'eslint-errors',
          'languages/typescript/preset/eslint-config/policies/errors.config.mjs',
        ),
        recordedEslintAnalyzer(
          'eslint-logging',
          'languages/typescript/preset/eslint-config/policies/logging.config.mjs',
        ),
        recordedEslintAnalyzer(
          'eslint-module-effects',
          'languages/typescript/preset/eslint-config/policies/module-effects.config.mjs',
        ),
      ]),
    );

    expect(report.toolErrors).toEqual([]);
    expect(report.summary.overallStatus).toBe('completed');
    expect(new Set(report.newFindings.map((finding) => finding.tool))).toEqual(
      new Set(['eslint-lint', 'eslint-errors', 'eslint-logging', 'eslint-module-effects']),
    );
    expect(report.newFindings).toEqual([
      {
        tool: 'eslint-errors',
        rule: 'no-empty-function',
        path: 'src/main/source.ts',
        identity: 'message:unexpected|node:Block|syntax:e09c6922783880b96df5adb1|occurrence:1',
        message:
          'Unexpected empty function \'empty\'. If this is intended, add {"rule":"no-empty-function","paths":["src/main/source.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'empty',
        location: { line: 2, column: 25 },
        ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
      },
      {
        tool: 'eslint-lint',
        rule: 'no-debugger',
        path: 'src/main/source.ts',
        identity:
          'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
        message:
          'Unexpected \'debugger\' statement. If this is intended, add {"rule":"no-debugger","paths":["src/main/source.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 1, column: 1 },
      },
      {
        tool: 'eslint-lint',
        rule: 'no-debugger',
        path: 'src/main/source.ts',
        identity:
          'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
        message:
          'Unexpected \'debugger\' statement. If this is intended, add {"rule":"no-debugger","paths":["src/main/source.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'unreachable',
        location: { line: 6, column: 3 },
        ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
      },
      {
        tool: 'eslint-logging',
        rule: 'no-console',
        path: 'src/main/source.ts',
        identity:
          'message:unexpected|node:PropertyAccessExpression|syntax:1f69dad8fea4eca83bc663c3|occurrence:1',
        message:
          'Unexpected console statement. If this is intended, add {"rule":"no-console","paths":["src/main/source.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 3, column: 1 },
      },
      {
        tool: 'eslint-module-effects',
        rule: 'no-unreachable',
        path: 'src/main/source.ts',
        identity:
          'message:unreachableCode|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
        message:
          'Unreachable code. If this is intended, add {"rule":"no-unreachable","paths":["src/main/source.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'unreachable',
        location: { line: 6, column: 3 },
        ratchet: { key: 'count:unreachableCode', value: 1, existingCodeOnly: true },
      },
    ]);
  });
  it('uses semantic occurrence order for repeated identical findings', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/repeated.ts': [
        'export function repeated() {',
        '  debugger;',
        '  debugger;',
        '}',
        '',
      ].join('\n'),
    });
    writeFiles(repository.root, {
      'src/main/repeated.ts': [
        'const unrelated = true;',
        'void unrelated;',
        '',
        'export function repeated() {',
        '  debugger;',
        '  debugger;',
        '  debugger;',
        '}',
        '',
      ].join('\n'),
    });
    commit(repository.root, 'move and add a repeated finding');

    const report = runQualityDiff(
      comparisonOptions(repository, [recordedEslintAnalyzer('eslint-lint')]),
    );

    expect(report.toolErrors).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(2);
    expect(report.newFindings).toEqual([
      {
        tool: 'eslint-lint',
        rule: 'no-debugger',
        path: 'src/main/repeated.ts',
        identity:
          'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:3',
        message:
          'Unexpected \'debugger\' statement. If this is intended, add {"rule":"no-debugger","paths":["src/main/repeated.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        symbol: 'repeated',
        location: { line: 7, column: 3 },
        ratchet: { key: 'count:unexpected', value: 3, existingCodeOnly: true },
      },
    ]);
  });
  it('preserves a finding when formatting adds trailing commas', () => {
    const repository = createRepository({
      ...policyFiles({ lintRule: 'no-new' }),
      'src/main/source.ts': [
        'class ManagedScheduler {',
        '  constructor(_options) {}',
        '}',
        'new ManagedScheduler({ enabled: true });',
        '',
      ].join('\n'),
    });
    writeFiles(repository.root, {
      'src/main/source.ts': [
        'class ManagedScheduler {',
        '  constructor(_options) {}',
        '}',
        'new ManagedScheduler({',
        '  enabled: true,',
        '});',
        '',
      ].join('\n'),
    });
    commit(repository.root, 'format existing finding');

    const report = runQualityDiff(comparisonOptions(repository, [fixtureAnalyzer('eslint-lint')]));

    expect(report.toolErrors).toEqual([]);
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
    expect(report.unchangedFindings).toEqual([
      {
        tool: 'eslint-lint',
        rule: 'no-new',
        path: 'src/main/source.ts',
        identity:
          'message:noNewStatement|node:NewExpression|syntax:781ba9e6489825f815e42f33|occurrence:1',
        message:
          'Do not use \'new\' for side effects. If this is intended, add {"rule":"no-new","paths":["src/main/source.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 4, column: 1 },
      },
    ]);
  });
  it('normalizes unused disable directives from ESLint JSON', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/source.ts': [
        '// eslint-disable-next-line no-console',
        "console.log('fixture');",
        '',
      ].join('\n'),
    });
    writeFiles(repository.root, { 'head.txt': 'head\n' });
    commit(repository.root, 'create head');

    const report = runQualityDiff(
      comparisonOptions(repository, [recordedEslintAnalyzer('eslint-lint')]),
    );

    expect(report.toolErrors).toEqual([]);
    expect(report.unchangedFindings).toEqual([
      {
        tool: 'eslint-lint',
        rule: 'eslint/unused-disable-directive',
        path: 'src/main/source.ts',
        identity:
          "message:Unused eslint-disable directive (no problems were reported from 'no-console').|node:Comment|syntax:d78e0da7309463e11508db15|occurrence:1",
        message: "Unused eslint-disable directive (no problems were reported from 'no-console').",
        classification: 'enforceable',
        location: { line: 1, column: 1 },
      },
    ]);
  });
  it('applies the head ESLint policy to both snapshots', () => {
    const repository = createRepository({
      ...policyFiles({ lintRule: 'no-debugger' }),
      'src/main/source.ts': "debugger;\nconsole.log('fixture');\n",
    });
    writeFiles(repository.root, policyFiles({ lintRule: 'no-console', withTypedProject: true }));
    commit(repository.root, 'change ESLint policy');

    const report = runQualityDiff(
      comparisonOptions(repository, [
        fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
          policyFiles: ['tsconfig.quality.json'],
        }),
      ]),
    );

    expect(report.toolErrors).toEqual([]);
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
    expect(report.unchangedFindings).toEqual([
      {
        tool: 'eslint-lint',
        rule: 'no-console',
        path: 'src/main/source.ts',
        identity:
          'message:unexpected|node:PropertyAccessExpression|syntax:1f69dad8fea4eca83bc663c3|occurrence:1',
        message:
          'Unexpected console statement. If this is intended, add {"rule":"no-console","paths":["src/main/source.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 2, column: 1 },
      },
    ]);
  });
  it('accepts ESLint exit 1 only with valid JSON findings', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    writeFiles(repository.root, { 'head.txt': 'head\n' });
    commit(repository.root, 'create head');

    const report = runQualityDiff(
      comparisonOptions(repository, [
        fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
          eslintCliPath: fakeEslintCliPath,
        }),
      ]),
    );

    expect(report.summary.overallStatus).toBe('completed');
    expect(report.unchangedFindings).toHaveLength(1);
    expect(report.toolErrors).toEqual([]);
  });
});
