import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../../languages/typescript/adapters/eslint/normalize.mjs';
import { failureMessageCases as baseCases } from '../../../../languages/typescript/preset/failure-messages/test-support/cases.mjs';
import { lintFixture } from '../../../../languages/typescript/preset/failure-messages/test-support/harness.mjs';
import { compareFindings } from '../../comparison/compare.mjs';
import { testHonestyFailureMessageCases } from '../../../../languages/typescript/preset/failure-messages/test-support/honesty/test-honesty-cases.mjs';

const temporaryRoots = [];
const failureMessageCases = [...baseCases, ...testHonestyFailureMessageCases];

afterAll(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectRelative(filename) {
  return path.isAbsolute(filename) ? path.relative(process.cwd(), filename) : filename;
}

// Lints `code` with the real strict config, writes the source to a temporary snapshot and runs the
// result through the same normalizer the differential ESLint analyzer uses.
function findingsFor({ config, filename, code }, relativePath = projectRelative(filename)) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-strict-fingerprint-'));
  temporaryRoots.push(root);
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, code);
  const messages = lintFixture({ config, filename, code });
  return normalizeEslintResults({
    value: [{ filePath: absolutePath, messages }],
    projectRoot: root,
    analyzerName: 'eslint-strict',
  });
}

function moveTarget(relativePath) {
  const directory = path.posix.dirname(relativePath);
  const base = path.posix.basename(relativePath);
  return `${directory}/moved/renamed-${base}`;
}

const unrelatedPrefix = '\n\n\nexport const unrelatedValue = 1;\n\n';

describe('strict findings keep their fingerprint', () => {
  it.each(failureMessageCases.map((testCase) => [testCase.name, testCase]))(
    '%s: across inserted lines and a rename',
    (_name, testCase) => {
      const base = findingsFor({ ...testCase, code: testCase.banned });
      expect(base.length).toBeGreaterThan(0);

      const shifted = findingsFor({ ...testCase, code: `${unrelatedPrefix}${testCase.banned}` });
      const shiftedCompare = compareFindings({ baseFindings: base, headFindings: shifted });
      expect(shiftedCompare.resolvedFindings).toEqual([]);
      expect(shiftedCompare.unchangedFindings).toHaveLength(base.length);

      const oldPath = base[0].path;
      const newPath = moveTarget(oldPath);
      const moved = findingsFor({ ...testCase, code: testCase.banned }, newPath);
      const movedCompare = compareFindings({
        baseFindings: base,
        headFindings: moved,
        baseToHeadRenames: new Map([[oldPath, newPath]]),
      });
      expect(movedCompare.newFindings).toEqual([]);
      expect(movedCompare.resolvedFindings).toEqual([]);
      expect(movedCompare.unchangedFindings).toHaveLength(base.length);
    },
  );
});

describe('strict comment findings anchor on the comment, not on its neighbours', () => {
  const config = failureMessageCases.find((testCase) => testCase.name.includes('line comment'));

  it.each([
    [
      'a trailing comment in a block when a statement is added above it',
      'export function run() {\n  first();\n  // note\n}\n',
      'export function run() {\n  first();\n  second();\n  // note\n}\n',
    ],
    [
      'a leading comment when the declaration below it changes',
      '// note\nexport function run() {\n  return 1;\n}\n',
      '// note\nexport function run() {\n  return 2;\n}\n',
    ],
    [
      'a comment when the declaration below it is renamed',
      '// note\nexport function run() {\n  return 1;\n}\n',
      '// note\nexport function execute() {\n  return 1;\n}\n',
    ],
  ])('keeps %s baselined', (_name, before, after) => {
    const base = findingsFor({ ...config, code: before });
    const head = findingsFor({ ...config, code: after });
    expect(base).toHaveLength(1);

    const comparison = compareFindings({ baseFindings: base, headFindings: head });
    expect(comparison.newFindings).toEqual([]);
    expect(comparison.resolvedFindings).toEqual([]);
    expect(comparison.unchangedFindings).toHaveLength(1);
  });
});

describe('ESLint messages carry the allowed form without changing the finding identity', () => {
  function normalizeOne(message, relativePath) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-eslint-hint-'));
    temporaryRoots.push(root);
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, 'export const value = [1].map((x) => x);\n');
    const [finding] = normalizeEslintResults({
      value: [{ filePath: absolutePath, messages: [message] }],
      projectRoot: root,
      analyzerName: 'eslint-lint',
    });
    return finding;
  }

  it('rewrites the immutability message but keeps the identity of the rule message', () => {
    const upstream = {
      ruleId: 'functional/prefer-immutable-types',
      messageId: 'variable',
      message:
        'Variable should have an immutability of at least "ReadonlyDeep" (actual: "Mutable").',
      line: 1,
      column: 14,
    };
    const finding = normalizeOne(upstream, 'src/main/features/a/domain/x.ts');
    const other = normalizeOne(
      { ...upstream, message: 'Variable should be different.' },
      'src/main/features/a/domain/x.ts',
    );

    expect(finding.message).toBe(
      'Variable `value` is mutable (array); domain/ values must be deeply readonly. Type it `readonly T[]`. If this is intended, add {"rule":"functional/prefer-immutable-types","paths":["src/main/features/a/domain/x.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(finding.identity.split('|').slice(0, 2)).toEqual([
      'message:variable',
      'node:Identifier',
    ]);
    expect(other.identity).toBe(finding.identity);
  });
});
