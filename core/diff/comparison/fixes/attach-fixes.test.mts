import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fieldAt } from '../../../../scripts/json/fields.mts';
import { fieldOf, listOf, parseJson } from '../../../../shared/values/readers.mts';
import { attachFixes } from './attach-fixes.mts';
import type { Recipe } from './recipe-types.mts';
import { renderSarifReport } from '../../reporting/sarif.mts';
import { writeReports } from '../../reporting/reporters.mts';
import { finding, report } from '../../reporting/test-support/report-builders.mts';
import { sarifSchemaErrors } from '../../reporting/test-support/format-checks/sarif-schema.mts';
import { findingsSchemaErrors } from '../test-support/findings-schema-check.mts';

const SOURCE = 'class A {\n  long a = 1l;\n  long b = 2L;\n  long c = 3l;\n}\n';
let root: string;

const UPPER_ELL: Recipe = {
  id: 'java-upper-ell',
  rules: [{ tool: 'checkstyle', rule: 'UpperEll' }],
  scope: 'file',
  safety: 'safe',
  plan: ({ files }) => ({
    fixes: files.flatMap(({ path: name, text }) =>
      [...text.matchAll(/\d(l)\b/gu)].map((match) => ({
        finding: {
          tool: 'checkstyle',
          rule: 'UpperEll',
          path: name,
          line: text.slice(0, match.index).split('\n').length,
        },
        edits: [
          {
            type: 'replace',
            path: name,
            start: match.index + 1,
            end: match.index + 2,
            text: 'L',
          },
        ],
      })),
    ),
  }),
};

function ell(line: number) {
  return finding({
    tool: 'checkstyle',
    rule: 'UpperEll',
    path: 'src/A.java',
    identity: `ell:${String(line)}`,
    location: { line, column: 1 },
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'attach-fixes-'));
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src/A.java'), SOURCE);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('attachFixes', () => {
  it('attaches the edit of the UpperEll recipe at the line of the finding', () => {
    const attached = attachFixes([ell(2), ell(4)], root, [UPPER_ELL]);

    expect(fieldAt(attached, 0, 'fix')).toEqual({
      recipe: 'java-upper-ell',
      safety: 'safe',
      path: 'src/A.java',
      sha256: createHash('sha256').update(SOURCE).digest('hex'),
      textLength: SOURCE.length,
      edits: [
        {
          type: 'replace',
          path: 'src/A.java',
          start: SOURCE.indexOf('1l') + 1,
          end: SOURCE.indexOf('1l') + 2,
          text: 'L',
        },
      ],
    });
    expect(fieldAt(attached, 1, 'fix', 'edits', 0, 'start')).toBe(SOURCE.indexOf('3l') + 1);
  });

  it('leaves findings alone that no recipe covers or that sit on a line the recipe skips', () => {
    const other = finding({ location: { line: 1 } });
    const clean = ell(3);

    expect(attachFixes([other, clean], root, [UPPER_ELL])).toEqual([other, clean]);
  });

  it('keeps a fix an analyzer already set', () => {
    const given = { ...ell(2), fix: { recipe: 'analyzer', safety: 'review' } };

    expect(fieldAt(attachFixes([given], root, [UPPER_ELL]), 0, 'fix')).toEqual({
      recipe: 'analyzer',
      safety: 'review',
    });
  });

  it('skips a finding whose file cannot be read', () => {
    const missing = { ...ell(2), path: 'src/Missing.java' };

    expect(attachFixes([missing], root, [UPPER_ELL])).toEqual([missing]);
  });

  it('uses a recipe from any preset that is added to the list', () => {
    const recipe: Recipe & { readonly presets: readonly string[] } = {
      id: 'sample-whole-file',
      rules: [{ tool: 'sample', rule: 'whole' }],
      presets: ['python'],
      scope: 'file',
      safety: 'review',
      plan: ({ files }) => ({
        fixes: files.map(({ path: name }) => ({
          finding: { tool: 'sample', rule: 'whole', path: name, line: 2 },
          edits: [{ type: 'write', path: name, text: 'x\n' }],
        })),
      }),
    };
    const sample = finding({
      tool: 'sample',
      rule: 'whole',
      path: 'src/A.java',
      location: { line: 2 },
    });
    const attached = attachFixes([sample], root, [UPPER_ELL, recipe]);

    expect(fieldAt(attached, 0, 'fix')).toEqual({
      recipe: 'sample-whole-file',
      safety: 'review',
      path: 'src/A.java',
      sha256: createHash('sha256').update(SOURCE).digest('hex'),
      textLength: SOURCE.length,
      edits: [{ type: 'write', path: 'src/A.java', text: 'x\n' }],
    });
    expect(attachFixes([sample], root, [UPPER_ELL])).toEqual([sample]);
  });

  it('gives each of two findings on one line its own fix, in column order', () => {
    const source = 'class A {\n  long a = 1l, b = 2l;\n}\n';
    writeFileSync(path.join(root, 'src/A.java'), source);
    const at = (column: number) => ({
      ...ell(2),
      identity: `ell:${String(column)}`,
      location: { line: 2, column },
    });

    const attached = attachFixes([at(20), at(12)], root, [UPPER_ELL]);

    expect(fieldAt(attached, 1, 'fix', 'edits', 0, 'start')).toBe(source.indexOf('1l') + 1);
    expect(fieldAt(attached, 0, 'fix', 'edits', 0, 'start')).toBe(source.indexOf('2l') + 1);
  });

  it('attaches no fix when the line has more findings than fixes', () => {
    const at = (column: number) => ({ ...ell(2), location: { line: 2, column } });

    expect(
      attachFixes([at(1), at(9)], root, [UPPER_ELL]).map((attached) => fieldOf(attached, 'fix')),
    ).toEqual([undefined, undefined]);
  });

  it('does not read a file through a symbolic link that leaves the project', () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'attach-fixes-outside-'));
    writeFileSync(path.join(outside, 'A.java'), SOURCE);
    symlinkSync(outside, path.join(root, 'linked'));
    const linked = { ...ell(2), path: 'linked/A.java' };

    expect(attachFixes([linked], root, [UPPER_ELL])).toEqual([linked]);
    rmSync(outside, { recursive: true, force: true });
  });

  it('skips a recipe that throws', () => {
    const throwing = {
      ...UPPER_ELL,
      plan: () => {
        throw new Error('boom');
      },
    };

    expect(attachFixes([ell(2)], root, [throwing])).toEqual([ell(2)]);
  });
});

describe('a finding with a fix in the reports', () => {
  it('is written to new-findings.json and to SARIF fixes', () => {
    const withFix = attachFixes([ell(2)], root, [UPPER_ELL]);
    const output = path.join(root, 'out');
    writeReports(
      output,
      [
        { name: 'new-findings.json', render: (data) => `${JSON.stringify(data.newFindings)}\n` },
        { name: 'report.sarif', render: (data, options) => renderSarifReport(data, options) },
      ],
      { report: report({ newFindings: withFix }), options: { projectPath: 'app' } },
    );
    const written = parseJson(readFileSync(path.join(output, 'new-findings.json'), 'utf8'));
    const sarif = parseJson(readFileSync(path.join(output, 'report.sarif'), 'utf8'));

    expect(fieldAt(written, 0, 'fix', 'recipe')).toBe('java-upper-ell');
    expect(findingsSchemaErrors(listOf(written))).toEqual([]);
    expect(sarifSchemaErrors(sarif)).toEqual([]);
    const fix = fieldAt(sarif, 'runs', 0, 'results', 0, 'fixes', 0);
    const offset = SOURCE.indexOf('1l') + 1;
    expect(fieldAt(fix, 'artifactChanges')).toEqual([
      {
        artifactLocation: { uri: 'app/src/A.java', uriBaseId: '%SRCROOT%' },
        replacements: [
          {
            deletedRegion: { charOffset: offset, charLength: 1 },
            insertedContent: { text: 'L' },
          },
        ],
      },
    ]);
    expect(fieldAt(fix, 'description', 'text')).toBe('Apply the java-upper-ell fix (safe).');
  });

  it('writes a whole-file edit as a replacement of the full text', () => {
    const whole = finding({
      fix: {
        recipe: 'r',
        safety: 'safe',
        path: 'a.txt',
        textLength: 5,
        edits: [{ type: 'write', path: 'a.txt', text: 'new' }],
      },
    });
    const log = parseJson(renderSarifReport(report({ newFindings: [whole] })));

    expect(sarifSchemaErrors(log)).toEqual([]);
    expect(
      fieldAt(log, 'runs', 0, 'results', 0, 'fixes', 0, 'artifactChanges', 0, 'replacements'),
    ).toEqual([
      { deletedRegion: { charOffset: 0, charLength: 5 }, insertedContent: { text: 'new' } },
    ]);
  });

  it('writes no SARIF fix for a fix without edits', () => {
    const bare = finding({ fix: { recipe: 'r', safety: 'review' } });
    const log = parseJson(renderSarifReport(report({ newFindings: [bare] })));

    expect(fieldAt(log, 'runs', 0, 'results', 0, 'fixes')).toBeUndefined();
  });
});
