import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runQualityDiff } from '../../../comparison/run-diff.mjs';
import { parseArguments } from '../../../../../languages/typescript/adapters/static-checks/arguments.mjs';
import { runPrettier } from '../../../../../languages/typescript/adapters/static-checks/prettier.mjs';
import {
  toolRoot,
  registerStaticRepositoryLifecycle,
  analyzer,
  policyFiles,
  filler,
  createRepository,
  generatedSnapshot,
  writeFiles,
  commit,
} from './static-check-fixtures.mjs';

registerStaticRepositoryLifecycle();

describe('static differential adapters: Prettier', () => {
  describe('prettier findings by touched lines', () => {
    const legacy = ['export const a={value:1}', ...filler(20), 'export const z = 1;', ''].join(
      '\n',
    );
    function prettierDiff(initialFiles, changedFiles) {
      const repository = createRepository({
        ...policyFiles(),
        'tests/placeholder.ts': 'export const placeholder = true;\n',
        ...initialFiles,
      });
      writeFiles(repository.root, changedFiles);
      commit(repository.root, 'change');
      return runQualityDiff({
        repositoryRoot: repository.root,
        projectRelativePath: '.',
        headProjectRoot: toolRoot,
        requestedBaseRef: repository.baseRef,
        outputRoot: path.join(repository.root, 'reports/quality/diff'),
        analyzers: [
          analyzer({
            name: 'prettier-format',
            kind: 'prettier',
            configRelativePath: '.prettierrc.json',
            ignoreRelativePath: '.prettierignore',
            patterns: ['src/main/**/*.ts', 'tests/**/*.ts'],
          }),
        ],
      });
    }
    it('keeps a legacy unformatted region baselined when the edit is far away', () => {
      const report = prettierDiff(
        { 'src/main/legacy.ts': legacy },
        { 'src/main/legacy.ts': legacy.replace('export const z = 1;', 'export const z = 2;') },
      );

      expect(report.toolErrors).toEqual([]);
      expect(report.newFindings).toEqual([]);
      expect(report.unchangedFindings).toEqual([
        {
          tool: 'prettier-format',
          rule: 'prettier/prettier',
          path: 'src/main/legacy.ts',
          identity: 'format-diff:21be5318beb85c3a6ff3440b',
          message: 'Format these lines with Prettier',
          classification: 'enforceable',
          location: { line: 1, endLine: 1 },
        },
      ]);
    });
    it('fails when the edit lands inside the unformatted region', () => {
      const report = prettierDiff(
        { 'src/main/legacy.ts': legacy },
        { 'src/main/legacy.ts': legacy.replace('value:1', 'value:2') },
      );

      expect(report.newFindings).toEqual([
        {
          tool: 'prettier-format',
          rule: 'prettier/prettier',
          path: 'src/main/legacy.ts',
          identity: 'format-diff:8a051786838f18724e9c186e',
          message: 'Format these lines with Prettier',
          classification: 'enforceable',
          location: { line: 1, endLine: 1 },
        },
      ]);
    });
    it('keeps the finding identity stable when lines shift above the region', () => {
      const base = ['export const top = 1;', legacy].join('\n');
      const report = prettierDiff(
        { 'src/main/legacy.ts': base },
        {
          'src/main/legacy.ts': ['export const top = 1;', 'export const more = 1;', legacy].join(
            '\n',
          ),
        },
      );

      expect(report.newFindings).toEqual([]);
      expect(report.resolvedFindings).toEqual([]);
      expect(report.unchangedFindings).toHaveLength(1);
    });
    it('fails a new unformatted file', () => {
      const report = prettierDiff({}, { 'src/main/fresh.ts': 'export const fresh={a:1}\n' });

      expect(report.newFindings).toEqual([
        {
          tool: 'prettier-format',
          rule: 'prettier/prettier',
          path: 'src/main/fresh.ts',
          identity: 'format-diff:fb042a0e28721a451f393e30',
          message: 'Format these lines with Prettier',
          classification: 'enforceable',
          location: { line: 1, endLine: 1 },
        },
      ]);
    });
    it('fails a newly unformatted line in a formatted file', () => {
      const formatted = 'export const a = 1;\n';
      const report = prettierDiff(
        { 'src/main/ok.ts': formatted },
        { 'src/main/ok.ts': `${formatted}export const b={v:1}\n` },
      );

      expect(report.newFindings).toEqual([
        {
          tool: 'prettier-format',
          rule: 'prettier/prettier',
          path: 'src/main/ok.ts',
          identity: 'format-diff:f56d25669f365e5afd0ac8af',
          message: 'Format these lines with Prettier',
          classification: 'enforceable',
          location: { line: 2, endLine: 2 },
        },
      ]);
    });
    it('keeps a formatted file clean', () => {
      const report = prettierDiff(
        { 'src/main/ok.ts': 'export const a = 1;\n' },
        { 'src/main/ok.ts': 'export const a = 2;\n' },
      );

      expect(report.newFindings).toEqual([]);
      expect(report.unchangedFindings).toEqual([]);
    });
  });
  describe('prettier precedence between the project and nitpicker configs', () => {
    function precedenceDiff(precedence) {
      const repository = createRepository({
        ...policyFiles(),
        '.prettierrc': '{ "semi": false, "singleQuote": false }\n',
        'tests/placeholder.ts': 'export const placeholder = true;\n',
      });
      writeFiles(repository.root, { 'src/main/fresh.ts': 'export const fresh = "a"\n' });
      commit(repository.root, 'change');
      return runQualityDiff({
        repositoryRoot: repository.root,
        projectRelativePath: '.',
        headProjectRoot: repository.root,
        requestedBaseRef: repository.baseRef,
        outputRoot: path.join(repository.root, 'reports/quality/diff'),
        headPolicy: precedence === undefined ? {} : { tools: { prettier: { precedence } } },
        analyzers: [
          analyzer({
            name: 'prettier-format',
            kind: 'prettier',
            configRelativePath: '.prettierrc.json',
            ignoreRelativePath: '.prettierignore',
            patterns: ['src/main/**/*.ts', 'tests/**/*.ts'],
          }),
        ],
      });
    }
    it('formats with the nitpicker config by default', () => {
      const report = precedenceDiff(undefined);

      expect(report.toolErrors).toEqual([]);
      expect(report.newFindings).toEqual([
        {
          tool: 'prettier-format',
          rule: 'prettier/prettier',
          path: 'src/main/fresh.ts',
          identity: 'format-diff:046e36fb31cb6cd60107aae3',
          message: 'Format these lines with Prettier',
          classification: 'enforceable',
          location: { line: 1, endLine: 1 },
        },
      ]);
    });
    it('formats with the project config when it alone is listed', () => {
      const report = precedenceDiff(['project']);

      expect(report.toolErrors).toEqual([]);
      expect(report.newFindings).toEqual([]);
    });
    it('merges both configs and lets the first listed win', () => {
      expect(precedenceDiff(['project', 'nitpicker']).newFindings).toEqual([]);
      expect(precedenceDiff(['nitpicker', 'project']).newFindings).toEqual([
        {
          tool: 'prettier-format',
          rule: 'prettier/prettier',
          path: 'src/main/fresh.ts',
          identity: 'format-diff:b2a1d02d8759b56690983826',
          message: 'Format these lines with Prettier',
          classification: 'enforceable',
          location: { line: 1, endLine: 1 },
        },
      ]);
    });
  });
  it('ignores generated quality-diff files during formatting checks', async () => {
    const projectRoot = generatedSnapshot();
    writeFiles(projectRoot, {
      '.nitpicker-diff-dependency-cruiser.config.mjs': 'export default{temporary:true}\n',
      'src/main/formatted.ts': 'export const formatted = true;\n',
    });

    const findings = await runPrettier(
      parseArguments([
        '--analyzer-name',
        'prettier-format',
        '--kind',
        'prettier',
        '--project-root',
        projectRoot,
        '--policy-root',
        toolRoot,
        '--config',
        'languages/typescript/preset/defaults/.prettierrc.json',
        '--ignore-path',
        'languages/typescript/preset/defaults/.prettierignore',
        '--pattern',
        '*.{ts,mts,mjs,json}',
        '--pattern',
        'src/main/**/*.ts',
        '--tool-root',
        toolRoot,
      ]),
    );

    expect(findings).toEqual([]);
  });
});
