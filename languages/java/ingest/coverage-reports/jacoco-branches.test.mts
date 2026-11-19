import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { parseChangedLines } from '../../../../core/diff/git/patches/changed-lines.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { callUntyped, findingsOf } from '../../adapters/typed/java-values.mts';
import type { JavaFinding } from '../../adapters/typed/java-values.mts';
import { comparison } from '../test-support/finding-comparison.mts';
import { isStrictRule } from '../../../typescript/preset/strict-rules.mts';
import { javaDeclarationUnits } from '../declarations/java-declaration-units.mts';
import { ingestJacocoBranches } from './jacoco-branches.mts';

type BranchOptions = NonNullable<Parameters<typeof ingestJacocoBranches>[1]>;

const xml = readFileSync(
  path.resolve(import.meta.dirname, '..', 'fixtures/jacoco-branches.xml'),
  'utf8',
);
const FILE = 'src/main/java/com/acme/Pick.java';

const SOURCE = [
  'package com.acme;',
  '',
  'public final class Pick {',
  '  int a = b > c ? 1 : 2;',
  '  int next;',
  '',
  '',
  '  boolean x = o == null;',
  '',
  '',
  '  boolean y = o != null;',
  '',
  '',
  '  boolean x = o == null;',
  '}',
].join('\n');

function ingest(source = SOURCE, options: BranchOptions = {}): JavaFinding[] {
  return findingsOf(
    ingestJacocoBranches(xml, {
      sourceRoot: 'src/main/java',
      sourceText: (file: string) => (file === FILE ? source : undefined),
      ...options,
    }).findings,
  );
}

function lineOf(finding: JavaFinding | undefined): number {
  return Number(fieldOf(finding?.location, 'line'));
}

describe('ingestJacocoBranches', () => {
  it('reports every line with branch coverage below 95%, and only those', () => {
    const findings = ingest();

    expect(findings.map((f) => [lineOf(f), f.message])).toEqual([
      [
        4,
        'Branch coverage is 50.00%; minimum is 95%. Add a test for each outcome it misses. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
      [
        8,
        'Branch coverage is 0.00%; minimum is 95%. Add a test for each outcome it misses. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
      [
        14,
        'Branch coverage is 0.00%; minimum is 95%. Add a test for each outcome it misses. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
    ]);
    expect(
      findings.every(
        (finding) =>
          finding.tool === 'jacoco' &&
          finding.rule === 'changed-branch-coverage' &&
          finding.path === FILE &&
          finding.classification === 'enforceable',
      ),
    ).toBe(true);
    expect(() => parseAnalyzerReport({ findings }, 'java')).not.toThrow();
  });

  it('names the function that holds a branch and the exception entry that accepts it', () => {
    const functions = [
      { file: FILE, name: 'Pick.pick', start: 3, end: 9 },
      { file: FILE, name: 'Pick.inner', start: 4, end: 5 },
      { file: 'src/main/java/com/acme/Other.java', name: 'Other.run', start: 1, end: 20 },
    ];

    const findings = ingest(SOURCE, { functions });

    expect(findings.map((finding) => [lineOf(finding), finding['symbol']])).toEqual([
      [4, 'Pick.inner'],
      [8, 'Pick.pick'],
      [14, undefined],
    ]);
    expect(findings[1]?.message).toBe(
      'Branch coverage is 0.00%; minimum is 95%. Add a test for each outcome it misses. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/java/com/acme/Pick.java"],"function":"Pick.pick","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('names the field whose initializer holds a branch no method holds', () => {
    const findings = ingest(SOURCE, { units: javaDeclarationUnits });

    expect(findings.map((finding) => [lineOf(finding), finding['symbol']])).toEqual([
      [4, 'Pick.a'],
      [8, 'Pick.x'],
      [14, 'Pick.x'],
    ]);
    expect(findings[0]?.message).toBe(
      'Branch coverage is 50.00%; minimum is 95%. Add a test for each outcome it misses. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/java/com/acme/Pick.java"],"function":"Pick.a","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('honors the minimum option and skips files without source', () => {
    expect(ingest(SOURCE, { minimum: 40 }).map((finding) => lineOf(finding))).toEqual([8, 14]);
    expect(ingest(SOURCE, { sourceText: () => undefined })).toEqual([]);
    expect(() => ingestJacocoBranches('<x/>')).toThrow('<report>');
  });

  it('identifies a branch by its source text, not its line', () => {
    const before = ingest();
    const moved = findingsOf(
      ingestJacocoBranches(
        xml.replace(/ nr="(\d+)"/g, (_: string, n: string) => ` nr="${String(Number(n) + 2)}"`),
        {
          sourceRoot: 'src/main/java',
          sourceText: () => `// header\n// more\n${SOURCE}`,
        },
      ).findings,
    );

    expect(moved.map((finding) => finding.identity)).toEqual(
      before.map((finding) => finding.identity),
    );
    expect(lineOf(moved[0])).toBe(lineOf(before[0]) + 2);
    expect(
      before.filter(
        (finding) => !/^branch-source:[0-9a-f]{16}(#\d+)?$/.test(finding.identity ?? ''),
      ),
    ).toEqual([]);
    expect(before[1]?.identity).not.toBe(before[2]?.identity);
  });
});

describe('changed-branch-coverage in the differential comparison', () => {
  const touched = (diff: string, sources?: { base: string; head: string }): unknown => ({
    changedLines: callUntyped(parseChangedLines, diff, '.', () => new Map([[FILE, sources]])),
    isStrictRule,
  });
  const diffFor = (hunk: string): string =>
    [`diff --git a/${FILE} b/${FILE}`, `--- a/${FILE}`, `+++ b/${FILE}`, hunk].join('\n');

  const base = ingest();

  it.each([
    ['baselines an uncovered branch that was already there', '@@ -1 +1 @@', [], [4, 8, 14]],
    ['fails the existing uncovered branch once its line is changed', '@@ -8 +8 @@', [8], [4, 14]],
  ])('%s', (_name, hunk, added, unchanged) => {
    const result = comparison({
      baseFindings: base,
      headFindings: base,
      touchedCode: touched(diffFor(hunk)),
    });
    const sorted = (findings: readonly JavaFinding[]): number[] =>
      findings.map((finding) => lineOf(finding)).sort((left, right) => left - right);

    expect(sorted(result.newFindings)).toEqual(added);
    expect(sorted(result.unchangedFindings)).toEqual(unchanged);
  });

  it('fails a newly added uncovered branch and ignores moved ones', () => {
    const moved = findingsOf(
      ingestJacocoBranches(
        xml.replace(/ nr="(\d+)"/g, (_: string, n: string) => ` nr="${String(Number(n) + 1)}"`),
        { sourceRoot: 'src/main/java', sourceText: () => `// added\n${SOURCE}` },
      ).findings,
    );
    const result = comparison({
      baseFindings: base,
      headFindings: moved,
      touchedCode: touched(diffFor('@@ -0,0 +1 @@')),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(3);

    const added = comparison({
      baseFindings: base.slice(0, 2),
      headFindings: base,
      touchedCode: touched(diffFor('@@ -13,0 +14,3 @@')),
    });
    expect(added.newFindings.map((finding) => lineOf(finding))).toEqual([14]);
  });

  it('keeps an uncovered branch baselined when the formatter only respaces its line', () => {
    const head = SOURCE.replace('boolean x = o == null;', 'boolean x=o==null ;');
    const reformatted = ingest(head);
    const result = comparison({
      baseFindings: base,
      headFindings: reformatted,
      touchedCode: touched(
        diffFor('@@ -8 +8 @@\n-  boolean x = o == null;\n+  boolean x=o==null ;'),
        { base: SOURCE, head },
      ),
    });

    expect(reformatted.map(({ identity }) => identity)).toEqual(
      base.map(({ identity }) => identity),
    );
    expect(result.newFindings).toEqual([]);
  });

  it.each([
    ['  if (flag); value = 2;', '  if (flag) value = 2;'],
    ['  int a = a > 0 ? a + ++b : b;', '  int a = a > 0 ? a++ + b : b;'],
  ])('gives %s a branch identity of its own, apart from formatting', (before, after) => {
    const identityOf = (line: string): string | undefined =>
      ingest(SOURCE.replace('  boolean x = o == null;', line))[1]?.identity;

    expect(identityOf(before)).not.toBe(identityOf(after));
  });

  it('applies to the Java coverage rule only, not to the TypeScript check of the same name', () => {
    expect(isStrictRule('changed-branch-coverage', { tool: 'jacoco' })).toBe(true);
    expect(isStrictRule('changed-branch-coverage', { tool: 'coverage' })).toBe(false);
    expect(isStrictRule('changed-branch-coverage')).toBe(false);
  });
});
