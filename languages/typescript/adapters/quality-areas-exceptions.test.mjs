import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { HEAD_POLICY_ENV } from '../../../shared/head-policy.mjs';
import { applyFindingExceptions } from '../../../shared/exceptions/finding-exceptions.mjs';
import {
  normalizeCoverage,
  normalizeCrap,
  normalizeStructure,
  parseArguments,
  runQualityArea,
} from './quality-areas-runner.mjs';

const roots = [];
const originalPolicy = process.env[HEAD_POLICY_ENV];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  if (originalPolicy === undefined) {
    delete process.env[HEAD_POLICY_ENV];
  } else {
    process.env[HEAD_POLICY_ENV] = originalPolicy;
  }
});

const WIDE =
  'export function wide(a: number, b: number, c: number, d: number): number {\n  return a + b + c + d;\n}\n';
const NARROW = 'export function narrow(a: number): number {\n  return a;\n}\n';

function project(source) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-')));
  roots.push(parent);
  const root = path.join(parent, 'head');
  mkdirSync(path.join(root, 'src/main'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), '{"name":"p","type":"module"}\n');
  writeFileSync(path.join(root, 'src/main/a.ts'), source);
  return { root, parent };
}

function areaFindings({ root, parent }, exceptions, kind = 'structure') {
  const policyFile = path.join(parent, 'policy.json');
  writeFileSync(policyFile, JSON.stringify({ exceptions }));
  process.env[HEAD_POLICY_ENV] = policyFile;
  return runQualityArea(
    parseArguments([
      '--analyzer-name',
      kind,
      '--kind',
      kind,
      '--project-root',
      root,
      '--policy-root',
      PACKAGE_ROOT,
      '--tool-root',
      PACKAGE_ROOT,
      '--snapshot',
      'head',
    ]),
  );
}

const failures = (findings) =>
  findings.filter(({ classification }) => classification === 'enforceable');

const ROUTE =
  'If this is intended, add {"rule":"function-parameters-limit","paths":["src/main/a.ts"],"function":"wide","reason":"..."} to "exceptions" in nitpicker.config.json.';

describe('exceptions for structure findings in the TypeScript analyzers', () => {
  const entry = {
    rule: 'function-parameters-limit',
    paths: ['src/main/a.ts'],
    function: 'wide',
    reason: 'A reviewed reason.',
  };

  it('names the route in the message and drops the finding once the exception is configured', async () => {
    const files = project(WIDE);

    const before = failures(await areaFindings(files, []));
    const after = failures(await areaFindings(files, [entry]));

    expect(before.map(({ rule, message }) => [rule, message])).toEqual([
      ['function-parameters-limit', `wide has 4 parameters; limit is 3. ${ROUTE}`],
    ]);
    expect(after).toEqual([]);
  });

  it('lifts a path-wide entry without a function, and nothing for another function or path', async () => {
    const files = project(WIDE);

    expect(failures(await areaFindings(files, [{ ...entry, function: undefined }]))).toEqual([]);
    expect(failures(await areaFindings(files, [{ ...entry, function: 'other' }]))).toHaveLength(1);
    expect(
      failures(await areaFindings(files, [{ ...entry, paths: ['src/main/b.ts'] }])),
    ).toHaveLength(1);
    expect(failures(await areaFindings(project(NARROW), []))).toEqual([]);
  });
});

const DUPLICATE_BODY = Array.from(
  { length: 12 },
  (_, index) => `  total += value * ${String(index + 2)} + ${String(index)};\n`,
).join('');
const duplicateSource = (name) =>
  `export function ${name}(value: number): number {\n  let total = 0;\n${DUPLICATE_BODY}  return total;\n}\n`;

function duplicateProject() {
  const files = project(duplicateSource('first'));
  writeFileSync(path.join(files.root, 'src/main/b.ts'), duplicateSource('second'));
  return files;
}

function deadCodeProject() {
  const files = project('export const used = 1;\nexport const unused = 2;\n');
  writeFileSync(
    path.join(files.root, 'src/main/main.ts'),
    "import { used } from './a.js';\n\nconsole.log(used);\n",
  );
  writeFileSync(path.join(files.root, 'src/main/orphan.ts'), 'export const orphan = 3;\n');
  return files;
}

describe('exceptions for duplicate and dead-code findings in the TypeScript analyzers', () => {
  const lift = (rule, file) => ({ rule, paths: [file], reason: 'A reviewed reason.' });

  it('names the route of a duplicate and drops it once the exception is configured', async () => {
    const files = duplicateProject();

    const before = failures(await areaFindings(files, [], 'duplicates'));
    const after = failures(
      await areaFindings(files, [lift('duplicate-clone', 'src/main/a.ts')], 'duplicates'),
    );

    expect(before.map(({ rule, path: file, message }) => [rule, file, message])).toEqual([
      [
        'duplicate-clone',
        'src/main/a.ts',
        'This code repeats src/main/b.ts:1 (16 lines). Keep one copy and call it from both places. If this is intended, add {"rule":"duplicate-clone","paths":["src/main/a.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      ],
    ]);
    expect(after).toEqual([]);
  });

  it('names the route of each dead-code finding and drops the one an exception names', async () => {
    const files = deadCodeProject();

    const before = failures(await areaFindings(files, [], 'dead-code'));
    const after = failures(
      await areaFindings(
        files,
        [lift('files', 'src/main/orphan.ts'), lift('exports', 'src/main/a.ts')],
        'dead-code',
      ),
    );

    expect(before.map(({ rule, path: file, message }) => [rule, file, message])).toEqual([
      [
        'files',
        'src/main/orphan.ts',
        'Unused file: src/main/orphan.ts. Nothing imports it: delete it, or import it where it is needed. If this is intended, add {"rule":"files","paths":["src/main/orphan.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      ],
      [
        'exports',
        'src/main/a.ts',
        'Export unused is never imported. Remove `export`, or the declaration if nothing uses it. If this is intended, add {"rule":"exports","paths":["src/main/a.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      ],
    ]);
    expect(after).toEqual([]);
    expect(
      failures(await areaFindings(files, [lift('files', 'src/main/orphan.ts')], 'dead-code')).map(
        ({ rule }) => rule,
      ),
    ).toEqual(['exports']);
  });
});

describe('exceptions for CRAP and coverage findings in the TypeScript analyzers', () => {
  const crapReport = {
    functions: [
      {
        source: 'src/main/a.ts',
        function: 'risky',
        lines: { start: 1, end: 5 },
        complexity: 6,
        sourceHash: 'h',
        crap: 20,
      },
    ],
  };
  const coverage = {
    '/p/src/main/a.ts': {
      fnMap: {
        0: { name: 'risky', loc: { start: { line: 1 }, end: { line: 9 } } },
        1: { name: '(anonymous_1)', loc: { start: { line: 3 }, end: { line: 4 } } },
      },
      branchMap: { 0: { loc: { start: { line: 3 } } } },
      b: { 0: [1, 0] },
      branchSourceHashes: { 0: 'k' },
    },
  };

  it('lifts a CRAP finding by function name', () => {
    const findings = failures(normalizeCrap(crapReport, 'crap'));
    const entry = { rule: 'crap-score-limit', paths: ['src/main/**'], function: 'risky' };

    expect(findings.map(({ message }) => message)).toEqual([
      'risky has CRAP 20.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/a.ts"],"function":"risky","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
    expect(applyFindingExceptions(findings, [entry])).toEqual([]);
  });

  it('names the enclosing named function of an uncovered branch and lifts it by that name', () => {
    const findings = failures(normalizeCoverage(coverage, 'coverage', { projectRoot: '/p' }));
    const entry = { rule: 'changed-branch-coverage', paths: ['src/main/a.ts'], function: 'risky' };

    expect(findings.map(({ symbol, message }) => [symbol, message])).toEqual([
      [
        'risky',
        'Branch coverage is 50.00%; minimum is 95%. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/a.ts"],"function":"risky","reason":"..."} to "exceptions" in nitpicker.config.json.',
      ],
    ]);
    expect(applyFindingExceptions(findings, [entry])).toEqual([]);
    expect(applyFindingExceptions(findings, [{ ...entry, function: 'safe' }])).toEqual(findings);
  });

  it('points a branch outside every named function at exclude', () => {
    const outside = { '/p/src/main/a.ts': { ...coverage['/p/src/main/a.ts'], fnMap: {} } };

    expect(
      failures(normalizeCoverage(outside, 'coverage', { projectRoot: '/p' })).map(
        ({ message }) => message,
      ),
    ).toEqual([
      'Branch coverage is 50.00%; minimum is 95%. To accept the file, add it to "exclude" in nitpicker.config.json.',
    ]);
  });

  it('names the route in the normalized structure findings', () => {
    expect(
      failures(
        normalizeStructure(
          { functions: [{ source: 'src/a.ts', function: 'f', parameters: 4, sourceHash: 'h' }] },
          'structure',
        ),
      ).map(({ message }) => message),
    ).toEqual([
      'f has 4 parameters; limit is 3. If this is intended, add {"rule":"function-parameters-limit","paths":["src/a.ts"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });
});
