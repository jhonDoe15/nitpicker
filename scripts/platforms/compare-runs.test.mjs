import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareRuns,
  EXPECTED_DIFFERENCES,
  invariantProblems,
  referenceProblems,
} from './compare-runs.mjs';
import { findingKey, normalizedRun, toolErrorKey } from './smoke.mjs';
import { renderSupportMatrix } from './support-matrix.mjs';

const GREET = 'src/main/features/greeting/domain/greet.ts';

function finding(tool, rule, file = GREET, classification = 'enforceable') {
  return findingKey({ tool, rule, path: file, identity: `${rule}|1`, classification });
}

function run({
  sample = 'typescript',
  runtime = 'node',
  platform = 'linux',
  all = {},
  change = {},
} = {}) {
  return {
    sample,
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
const mutationCrash = toolErrorKey({ snapshot: 'head', tool: 'mutation' });
const PARSER = 'src/demo/parser.py';

function pythonRun(platform, { all = {}, change = {} } = {}) {
  return run({
    sample: 'python',
    platform,
    all: { exitCode: 1, ...all },
    change: { findings: [finding('python-rules', 'swallowed-exception', PARSER)], ...change },
  });
}

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

  it('expects the same findings and tool errors under Deno as under Node', () => {
    const deno = run({ runtime: 'deno', change: { toolErrors: [typecheckCrash] } });

    expect(compareRuns(run(), run({ runtime: 'deno' }))).toEqual({ problems: [], allowed: [] });
    expect(compareRuns(run(), deno).problems).toEqual([
      `typescript on linux with deno: change + ${typecheckCrash}`,
    ]);
  });

  it('allows a tool error of the expected analyzer and its exit code', () => {
    const windows = pythonRun('win32', {
      all: { exitCode: 2, toolErrors: [mutationCrash] },
      change: { toolErrors: [mutationCrash] },
    });

    const result = compareRuns(pythonRun('linux'), windows);

    expect(result.problems).toEqual([]);
    expect(result.allowed).toEqual([
      `python on win32 with node: all + ${mutationCrash}`,
      `python on win32 with node: change + ${mutationCrash}`,
    ]);
  });

  it('fails when a documented difference no longer occurs, so the docs follow the fix', () => {
    expect(compareRuns(pythonRun('linux'), pythonRun('win32')).problems).toEqual([
      'python on win32 with node: the expected difference in mutation no longer occurs; update EXPECTED_DIFFERENCES and docs/compatibility.md',
    ]);
  });

  it('allows the findings of the expected analyzer that carry another tool name', () => {
    const survived = finding('mutmut', 'mutant-survived', 'src/demo/legacy.py');
    const skipped = finding('mutmut', 'mutation-skipped', '.', 'descriptive');

    const result = compareRuns(
      pythonRun('linux', { all: { findings: [survived] } }),
      pythonRun('win32', { all: { findings: [skipped] } }),
    );

    expect(result).toEqual({
      problems: [],
      allowed: [
        `python on win32 with node: all - ${survived}`,
        `python on win32 with node: all + ${skipped}`,
      ],
    });
  });

  it('checks exit codes in the part that has no expected difference', () => {
    const windows = pythonRun('win32', {
      all: { exitCode: 2, toolErrors: [mutationCrash] },
      change: { exitCode: 2 },
    });

    expect(compareRuns(pythonRun('linux'), windows).problems).toEqual([
      'python on win32 with node: the change exited 2, not 1',
      'python on win32 with node: change exited 2, the reference 1',
    ]);
  });

  it('fails a reference run with a tool error or an unexpected --all exit code', () => {
    const reference = run({ all: { exitCode: 2, toolErrors: [typecheckCrash] } });

    expect(referenceProblems(reference)).toEqual([
      'typescript on linux with node: --all exited 2, not 0',
      `typescript on linux with node: the reference run has a tool error in all: ${typecheckCrash}`,
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
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
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
  function tableRows(matrix) {
    return matrix
      .split('\n')
      .filter((line) => line.startsWith('| ') && !/^\| -/u.test(line))
      .map((line) =>
        line
          .slice(2, -2)
          .split(' | ')
          .map((cell) => cell.trim()),
      );
  }

  it('lists every preset and every expected difference with its reason', () => {
    const rows = tableRows(renderSupportMatrix());
    const limitsStart = rows.findIndex(([first]) => first === 'Where');

    expect(rows.slice(0, limitsStart).map(([preset]) => preset)).toEqual([
      'Preset',
      'TypeScript',
      'JavaScript',
      'Java',
      'Kotlin',
      'Python',
    ]);
    expect(rows.slice(limitsStart)).toEqual([
      ['Where', 'Sample', 'Analyzers', 'Why'],
      ['Windows', 'python', '`mutation`, `mutmut`', EXPECTED_DIFFERENCES[0].reason],
    ]);
  });
});
