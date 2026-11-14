import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { readDuplicateFindings } from '../../adapters/metrics/java-duplicates.mjs';
import { coveredByCpd, readCpdFindings } from '../cpd-duplicates.mts';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';

const MAIN_A = 'src/main/java/demo/A.java';
const MAIN_B = 'src/main/java/demo/B.java';
const LOGIC = Array.from(
  { length: 30 },
  (_, index) => `    total += compute(${String(index)}) * rate;`,
).join('\n');
const FAILED = '1\nboom\n';
const roots: string[] = [];

type Reports = Readonly<Record<string, string>>;
type Changes = Readonly<Record<string, unknown>>;

const readDuplicates: (
  reportRoot: string,
  options: { reportFile: string; skip: ReturnType<typeof coveredByCpd> },
) => unknown = readDuplicateFindings;
const parseReport: (value: unknown, name: string) => { findings: readonly unknown[] } =
  parseAnalyzerReport;
const compare: (input: {
  baseFindings: readonly unknown[];
  headFindings: readonly unknown[];
  touchedCode: { changedLines: Map<string, unknown>; isStrictRule: () => boolean };
  unknownOnBase: undefined;
}) => Readonly<Record<string, unknown>> = compareFindings;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function sourceWith(name: string): string {
  return `class ${name} {\n  int run(int rate) {\n    int total = 0;\n${LOGIC}\n    return total;\n  }\n}\n`;
}

function cpdXml(clones: readonly (readonly [number, number])[]): string {
  const duplications = clones.map(
    ([lines, tokens]) =>
      `<duplication lines="${String(lines)}" tokens="${String(tokens)}">` +
      [MAIN_A, MAIN_B]
        .map((file) => `<file path="${file}" line="3" endline="${String(2 + lines)}"/>`)
        .join('') +
      '<codefragment><![CDATA[x]]></codefragment></duplication>',
  );
  return `<?xml version="1.0"?>\n<pmd-cpd>\n${duplications.join('\n')}\n</pmd-cpd>\n`;
}

function jscpdJson(clones: readonly (readonly [number, number, string])[]): string {
  const duplicates = clones.map(([lines, tokens, fragment]) => ({
    firstFile: { name: 'demo/A.java', start: 3 },
    secondFile: { name: 'demo/B.java', start: 3 },
    lines,
    tokens,
    fragment,
  }));
  return JSON.stringify({ runs: [{ root: 'src/main/java', report: { duplicates } }] });
}

function snapshotFindings(reports: Reports): readonly unknown[] {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cpd-comparison-'));
  roots.push(root);
  const reportRoot = path.join(root, 'build/nitpicker');
  mkdirSync(reportRoot, { recursive: true });
  for (const [file, name] of Object.entries({ [MAIN_A]: 'A', [MAIN_B]: 'B' })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), sourceWith(name));
  }
  for (const [file, text] of Object.entries(reports)) {
    writeFileSync(path.join(reportRoot, file), text);
  }
  const module = { moduleDir: '.', modulePath: undefined };
  const findings = [
    ...readCpdFindings(reportRoot, {
      projectRoot: root,
      sourceRoots: ['src/main/java'],
      testRoots: [],
      module,
    }),
    ...listOf(
      readDuplicates(reportRoot, {
        reportFile: 'duplicates.json',
        skip: coveredByCpd([{ reportRoot }], root),
      }),
    ),
  ];
  return parseReport({ findings }, 'java').findings;
}

function compared(base: Reports, head: Reports, changedLines: Changes = {}) {
  const result = compare({
    baseFindings: snapshotFindings(base),
    headFindings: snapshotFindings(head),
    touchedCode: {
      changedLines: new Map(Object.entries(changedLines)),
      isStrictRule: () => true,
    },
    unknownOnBase: undefined,
  });
  function clones(findings: readonly unknown[]): string[] {
    return findings
      .filter((finding) => fieldOf(finding, 'rule') !== 'duplicate-clone-size')
      .map(
        (finding) =>
          `${textOf(fieldOf(finding, 'classification'))} ${textOf(fieldOf(finding, 'rule'))} ${textOf(fieldOf(finding, 'identity')).slice(0, 4)}`,
      );
  }
  return {
    new: clones(listOf(result['newFindings'])),
    resolved: clones(listOf(result['resolvedFindings'])),
    unchanged: clones(listOf(result['unchangedFindings'])),
  };
}

describe('PMD CPD and jscpd clones of the same files across a comparison', () => {
  const editedA = { [MAIN_A]: { added: false, ranges: [[15, 32]], inserted: [] } };

  it('holds a legacy CPD clone that shrank below CPD minimum and is now reported by jscpd', () => {
    const base = {
      'cpd.xml': cpdXml([[30, 300]]),
      'duplicates.json': jscpdJson([[30, 300, 'big']]),
    };
    const head = { 'cpd.xml': cpdXml([]), 'duplicates.json': jscpdJson([[8, 70, 'small']]) };

    expect(compared(base, head, editedA)).toEqual({
      new: [],
      resolved: [],
      unchanged: ['enforceable duplicate-clone pair'],
    });
  });

  it('fails a jscpd clone that grew past the legacy CPD clone', () => {
    const base = {
      'cpd.xml': cpdXml([[30, 300]]),
      'duplicates.json': jscpdJson([[30, 300, 'big']]),
    };
    const head = { 'cpd.xml': cpdXml([]), 'duplicates.json': jscpdJson([[8, 400, 'grown']]) };

    expect(compared(base, head, editedA)).toEqual({
      new: ['enforceable duplicate-clone pair'],
      resolved: ['enforceable duplicate-clone cpd:'],
      unchanged: [],
    });
  });

  it('keeps enforcing a new jscpd clone where CPD did not run on the base', () => {
    const base = { 'cpd-failed.txt': FAILED, 'duplicates.json': jscpdJson([]) };
    const head = { 'cpd-failed.txt': FAILED, 'duplicates.json': jscpdJson([[30, 300, 'new']]) };

    expect(compared(base, head, { [MAIN_B]: { added: true, ranges: [[1, 40]] } })).toEqual({
      new: ['enforceable duplicate-clone pair'],
      resolved: [],
      unchanged: ['descriptive cpd-not-run cpd-'],
    });
  });

  it('keeps a legacy jscpd clone unchanged when CPD failed on both sides', () => {
    const reports = { 'cpd-failed.txt': FAILED, 'duplicates.json': jscpdJson([[30, 300, 'old']]) };

    expect(compared(reports, reports)).toEqual({
      new: [],
      resolved: [],
      unchanged: ['descriptive cpd-not-run cpd-', 'enforceable duplicate-clone pair'],
    });
  });

  it('reports only the broken CPD run when CPD fails on the head, not a new jscpd clone', () => {
    const clone = { 'duplicates.json': jscpdJson([[30, 300, 'old']]) };

    expect(
      compared(
        { ...clone, 'cpd.xml': cpdXml([[30, 300]]) },
        { ...clone, 'cpd-failed.txt': FAILED },
      ),
    ).toEqual({
      new: ['tool-error cpd-not-run cpd-'],
      resolved: [],
      unchanged: ['enforceable duplicate-clone pair'],
    });
  });
});
