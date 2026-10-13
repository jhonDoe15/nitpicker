import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { compareFindings } from '../../../core/diff/compare.mjs';
import { parseChangedLines } from '../../../core/diff/git.mjs';
import { isStrictRule } from '../../typescript/preset/strict-rules.mjs';
import { ingestJacocoBranches } from './jacoco-branches.mjs';

const xml = readFileSync(path.resolve(import.meta.dirname, 'fixtures/jacoco-branches.xml'), 'utf8');
const FILE = 'src/main/java/com/acme/Pick.java';

// Line 4 is half covered, 8 and 14 are uncovered (and identical text), 11 is fully covered.
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

const ingest = (source = SOURCE, options = {}) =>
  ingestJacocoBranches(xml, {
    sourceRoot: 'src/main/java',
    sourceText: (file) => (file === FILE ? source : undefined),
    ...options,
  }).findings;

describe('ingestJacocoBranches', () => {
  it('reports every line with branch coverage below 95%, and only those', () => {
    const findings = ingest();

    expect(findings.map((f) => [f.location.line, f.message])).toEqual([
      [
        4,
        'Branch coverage is 50.00%; minimum is 95%. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
      [
        8,
        'Branch coverage is 0.00%; minimum is 95%. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
      [
        14,
        'Branch coverage is 0.00%; minimum is 95%. To accept the file, add it to "exclude" in nitpicker.config.json.',
      ],
    ]);
    expect(
      findings.every(
        (f) =>
          f.tool === 'jacoco' &&
          f.rule === 'changed-branch-coverage' &&
          f.path === FILE &&
          f.classification === 'enforceable',
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

    expect(findings.map(({ location, symbol }) => [location.line, symbol])).toEqual([
      [4, 'Pick.inner'],
      [8, 'Pick.pick'],
      [14, undefined],
    ]);
    expect(findings[1].message).toBe(
      'Branch coverage is 0.00%; minimum is 95%. To accept it, add an entry to "exceptions" in nitpicker.config.json: {"rule":"changed-branch-coverage","paths":["src/main/java/com/acme/Pick.java"],"function":"Pick.pick","reason":"why"}.',
    );
  });

  it('honors the minimum option and skips files without source', () => {
    expect(ingest(SOURCE, { minimum: 40 }).map((f) => f.location.line)).toEqual([8, 14]);
    expect(ingest(SOURCE, { sourceText: () => undefined })).toEqual([]);
    expect(() => ingestJacocoBranches('<x/>')).toThrow('<report>');
  });

  it('identifies a branch by its source text, not its line', () => {
    const before = ingest();
    const moved = ingestJacocoBranches(
      xml.replace(/ nr="(\d+)"/g, (_, n) => ` nr="${Number(n) + 2}"`),
      {
        sourceRoot: 'src/main/java',
        sourceText: () => `// header\n// more\n${SOURCE}`,
      },
    ).findings;

    expect(moved.map((f) => f.identity)).toEqual(before.map((f) => f.identity));
    expect(moved[0].location.line).toBe(before[0].location.line + 2);
    for (const finding of before) {
      expect(finding.identity).toMatch(/^branch-source:[0-9a-f]{16}(#\d+)?$/);
    }
    // identical lines (8 and 14) are told apart by order
    expect(before[1].identity).not.toBe(before[2].identity);
  });
});

describe('changed-branch-coverage in the differential comparison', () => {
  const touched = (diff) => ({
    changedLines: parseChangedLines(diff),
    isStrictRule,
  });
  const diffFor = (hunk) =>
    [`diff --git a/${FILE} b/${FILE}`, `--- a/${FILE}`, `+++ b/${FILE}`, hunk].join('\n');

  const base = ingest();

  it('baselines an uncovered branch that was already there', () => {
    const result = compareFindings({
      baseFindings: base,
      headFindings: base,
      touchedCode: touched(diffFor('@@ -1 +1 @@')),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(3);
  });

  it('fails the existing uncovered branch once its line is changed', () => {
    const result = compareFindings({
      baseFindings: base,
      headFindings: base,
      touchedCode: touched(diffFor('@@ -8 +8 @@')),
    });

    expect(result.newFindings.map((f) => f.location.line)).toEqual([8]);
    expect(result.unchangedFindings.map((f) => f.location.line).sort((a, b) => a - b)).toEqual([
      4, 14,
    ]);
  });

  it('fails a newly added uncovered branch and ignores moved ones', () => {
    const moved = ingestJacocoBranches(
      xml.replace(/ nr="(\d+)"/g, (_, n) => ` nr="${Number(n) + 1}"`),
      { sourceRoot: 'src/main/java', sourceText: () => `// added\n${SOURCE}` },
    ).findings;
    const result = compareFindings({
      baseFindings: base,
      headFindings: moved,
      touchedCode: touched(diffFor('@@ -0,0 +1 @@')),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(3);

    const added = compareFindings({
      baseFindings: base.slice(0, 2),
      headFindings: base,
      touchedCode: touched(diffFor('@@ -13,0 +14,3 @@')),
    });
    expect(added.newFindings.map((f) => f.location.line)).toEqual([14]);
  });

  it('applies to the Java coverage rule only, not to the TypeScript check of the same name', () => {
    expect(isStrictRule('changed-branch-coverage', { tool: 'jacoco' })).toBe(true);
    expect(isStrictRule('changed-branch-coverage', { tool: 'coverage' })).toBe(false);
    expect(isStrictRule('changed-branch-coverage')).toBe(false);
  });
});
