import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareRuns, EXPECTED_DIFFERENCES, invariantProblems } from './compare-runs.mjs';
import { findingKey, normalizedRun, toolErrorKey } from './smoke.mjs';
import { renderSupportMatrix } from './support-matrix.mjs';

const GREET = 'src/main/features/greeting/domain/greet.ts';

function finding(tool, rule, file = GREET, classification = 'enforceable') {
  return findingKey({ tool, rule, path: file, identity: `${rule}|1`, classification });
}

function run({ runtime = 'node', platform = 'linux', all = {}, change = {} } = {}) {
  return {
    sample: 'typescript',
    runtime,
    platform,
    all: {
      exitCode: 0,
      findings: [finding('coupling', 'coupling', '.', 'descriptive')],
      toolErrors: [],
      ...all,
    },
    change: {
      exitCode: 1,
      findings: [finding('eslint-lint', 'no-restricted-syntax')],
      toolErrors: [],
      ...change,
    },
  };
}

const typecheckCrash = toolErrorKey({ snapshot: 'head', tool: 'typescript-typecheck' });

describe('comparing a sample run with the Linux run under Node', () => {
  it('passes a run with the same findings, tool errors and exit codes', () => {
    expect(compareRuns(run(), run({ platform: 'darwin' }))).toEqual({ problems: [], allowed: [] });
  });

  it('reports a finding that only one run has, whatever the operating system', () => {
    const extra = finding('prettier-format', 'prettier/prettier', 'src/main/composition-root.ts');
    const { problems } = compareRuns(run(), run({ platform: 'win32', all: { findings: [extra] } }));

    expect(problems).toEqual([
      `typescript on win32 with node: all - ${finding('coupling', 'coupling', '.', 'descriptive')}`,
      `typescript on win32 with node: all + ${extra}`,
    ]);
  });

  it('allows the documented Deno type-check failure and its exit code', () => {
    const deno = run({
      runtime: 'deno',
      all: { exitCode: 2, toolErrors: [typecheckCrash] },
      change: { toolErrors: [typecheckCrash] },
    });

    const result = compareRuns(run(), deno);

    expect(result.problems).toEqual([]);
    expect(result.allowed).toEqual([
      `typescript on linux with deno: all + ${typecheckCrash}`,
      `typescript on linux with deno: change + ${typecheckCrash}`,
    ]);
  });

  it('fails when a documented difference no longer occurs, so the docs follow the fix', () => {
    expect(compareRuns(run(), run({ runtime: 'deno' })).problems).toEqual([
      'typescript on linux with deno: the expected difference in typescript-typecheck no longer occurs; update EXPECTED_DIFFERENCES and docs/compatibility.md',
    ]);
  });

  it('fails a run whose change was not caught on the changed file', () => {
    const missed = run({
      change: { exitCode: 0, findings: [finding('dead-code', 'exports', 'src/other.ts')] },
    });

    expect(invariantProblems(missed)).toEqual([
      'typescript on linux with node: the change exited 0, not 1',
      `typescript on linux with node: no new enforceable finding on ${GREET}`,
    ]);
  });
});

describe('the sample report reader', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('keys findings with forward slashes and sorts them, and keeps tool error messages', () => {
    const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-platform-reports-'));
    roots.push(reports);
    const windowsFinding = {
      tool: 'structure',
      rule: 'lines',
      path: 'src\\main\\a.ts',
      identity: 'f',
      classification: 'descriptive',
    };
    const crash = { tool: 'mutation', snapshot: 'head', path: '', message: 'mutation crashed' };
    writeFileSync(path.join(reports, 'findings.json'), JSON.stringify([windowsFinding]));
    writeFileSync(path.join(reports, 'tool-errors.json'), JSON.stringify([crash]));

    expect(normalizedRun({ exitCode: 2, reports, findingsFile: 'findings.json' })).toEqual({
      exitCode: 2,
      findings: ['["structure","lines","src/main/a.ts","f","descriptive"]'],
      toolErrors: ['["head","mutation","crash"]'],
      toolErrorMessages: ['["head","mutation","crash"]: mutation crashed'],
    });
  });
});

describe('the compatibility table', () => {
  it('lists every expected difference with its reason', () => {
    const matrix = renderSupportMatrix();

    for (const { reason } of EXPECTED_DIFFERENCES) expect(matrix).toContain(reason);
    expect(matrix).toContain('| TypeScript |');
  });
});
