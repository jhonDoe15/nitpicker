import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachFixes } from './attach-fixes.mjs';
import { KNOWN_RECIPES } from './known-recipes.mjs';
import { renderSarifReport } from '../../reporting/sarif.mts';
import { writeReports } from '../../reporting/reporters.mts';
import { finding, report } from '../../reporting/test-support/report-builders.mjs';
import { sarifSchemaErrors } from '../../reporting/test-support/sarif-schema.mjs';
import { findingsSchemaErrors } from '../test-support/findings-schema-check.mjs';

const SOURCE = 'class A {\n  long a = 1l;\n  long b = 2L;\n  long c = 3l;\n}\n';
let root;

function ell(line) {
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
    const [first, second] = attachFixes([ell(2), ell(4)], root);

    expect(first.fix).toEqual({
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
    expect(second.fix.edits[0].start).toBe(SOURCE.indexOf('3l') + 1);
  });

  it('leaves findings alone that no recipe covers or that sit on a line the recipe skips', () => {
    const other = finding({ location: { line: 1 } });
    const clean = ell(3);

    expect(attachFixes([other, clean], root)).toEqual([other, clean]);
  });

  it('keeps a fix an analyzer already set', () => {
    const given = { ...ell(2), fix: { recipe: 'analyzer', safety: 'review' } };

    expect(attachFixes([given], root)[0].fix).toEqual({ recipe: 'analyzer', safety: 'review' });
  });

  it('skips a finding whose file cannot be read', () => {
    const missing = { ...ell(2), path: 'src/Missing.java' };

    expect(attachFixes([missing], root)).toEqual([missing]);
  });

  it('uses a recipe from any preset that is added to the list', () => {
    const recipe = {
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
    const [attached] = attachFixes([sample], root, [...KNOWN_RECIPES, recipe]);

    expect(attached.fix).toEqual({
      recipe: 'sample-whole-file',
      safety: 'review',
      path: 'src/A.java',
      sha256: createHash('sha256').update(SOURCE).digest('hex'),
      textLength: SOURCE.length,
      edits: [{ type: 'write', path: 'src/A.java', text: 'x\n' }],
    });
    expect(attachFixes([sample], root)).toEqual([sample]);
  });

  it('skips a recipe that throws', () => {
    const throwing = {
      ...KNOWN_RECIPES[0],
      plan: () => {
        throw new Error('boom');
      },
    };

    expect(attachFixes([ell(2)], root, [throwing])).toEqual([ell(2)]);
  });
});

describe('a finding with a fix in the reports', () => {
  it('is written to new-findings.json and to SARIF fixes', () => {
    const withFix = attachFixes([ell(2)], root);
    const output = path.join(root, 'out');
    writeReports(
      output,
      [
        { name: 'new-findings.json', render: (data) => `${JSON.stringify(data.newFindings)}\n` },
        { name: 'report.sarif', render: (data, options) => renderSarifReport(data, options) },
      ],
      { report: report({ newFindings: withFix }), options: { projectPath: 'app' } },
    );
    const written = JSON.parse(readFileSync(path.join(output, 'new-findings.json'), 'utf8'));
    const sarif = JSON.parse(readFileSync(path.join(output, 'report.sarif'), 'utf8'));

    expect(written[0].fix.recipe).toBe('java-upper-ell');
    expect(findingsSchemaErrors(written)).toEqual([]);
    expect(sarifSchemaErrors(sarif)).toEqual([]);
    const [fix] = sarif.runs[0].results[0].fixes;
    const offset = SOURCE.indexOf('1l') + 1;
    expect(fix.artifactChanges).toEqual([
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
    expect(fix.description.text).toBe('Apply the java-upper-ell fix (safe).');
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
    const log = JSON.parse(renderSarifReport(report({ newFindings: [whole] })));

    expect(sarifSchemaErrors(log)).toEqual([]);
    expect(log.runs[0].results[0].fixes[0].artifactChanges[0].replacements).toEqual([
      { deletedRegion: { charOffset: 0, charLength: 5 }, insertedContent: { text: 'new' } },
    ]);
  });

  it('writes no SARIF fix for a fix without edits', () => {
    const bare = finding({ fix: { recipe: 'r', safety: 'review' } });
    const log = JSON.parse(renderSarifReport(report({ newFindings: [bare] })));

    expect(log.runs[0].results[0].fixes).toBeUndefined();
  });
});
