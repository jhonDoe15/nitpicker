import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderConsoleSummary } from '../reporters.mjs';
import { runQualityDiff } from '../run-diff.mjs';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../fixtures/git-repository.mjs';
import { runTasksInProcess } from '../fixtures/in-process-analyzers.mjs';

const specAnalyzerPath = path.join(import.meta.dirname, '../fixtures/spec-analyzer.mjs');
const outputs = [];

afterEach(() => {
  removeGitRepositories();
  for (const output of outputs.splice(0)) {
    rmSync(output, { recursive: true, force: true });
  }
});

function analyzer(name, dependencies = []) {
  return {
    name,
    version: '1.0.0',
    configurationHash: 'fixture',
    exclusions: [],
    reportedTools: ['ruff', 'crap'],
    dependencies,
    createInvocation: ({ projectRoot }) => ({
      command: process.execPath,
      args: [specAnalyzerPath, '--root', projectRoot, '--name', name],
      cwd: projectRoot,
    }),
  };
}

function testsFailed(tool, rule = 'tests-failed') {
  return {
    tool,
    rule,
    path: '.',
    identity: rule,
    message: 'tests/test_a.py::test_a fails',
    classification: 'tool-error',
  };
}

function crap(identity, filePath, location) {
  return {
    tool: 'crap',
    rule: 'crap-score-limit',
    path: filePath,
    identity,
    message: `${identity} is too complex`,
    classification: 'enforceable',
    location,
  };
}

function lint(identity) {
  return {
    tool: 'ruff',
    rule: 'F401',
    path: 'src/legacy.py',
    identity,
    message: `${identity} is unused`,
    classification: 'enforceable',
  };
}

const LEGACY = Array.from({ length: 12 }, (_, index) => `line ${String(index + 1)}\n`).join('');

function compare({ base, head, analyzers }) {
  const repository = createGitRepository({
    'analyzer.json': `${JSON.stringify(base)}\n`,
    'src/legacy.py': LEGACY,
  });
  const write = (relativePath, contents) => {
    mkdirSync(path.dirname(path.join(repository.root, relativePath)), { recursive: true });
    writeFileSync(path.join(repository.root, relativePath), contents);
  };
  write('analyzer.json', `${JSON.stringify(head.specs)}\n`);
  write('head.txt', 'head\n');
  for (const [relativePath, contents] of Object.entries(head.files ?? {})) {
    write(relativePath, contents);
  }
  fixtureGit(repository.root, ['add', '-A']);
  fixtureGit(repository.root, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'head']);
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-red-base-'));
  outputs.push(outputRoot);
  const report = runQualityDiff({
    repositoryRoot: repository.root,
    projectRelativePath: '.',
    requestedBaseRef: repository.baseSha,
    outputRoot,
    analyzers,
    runTasks: runTasksInProcess,
  });
  return { report, outputRoot };
}

const editedLine = LEGACY.replace('line 8\n', 'line 8 edited\n');

describe('a base whose tests fail', () => {
  const crapChain = () => [analyzer('coverage'), analyzer('crap', ['coverage'])];

  it('judges the checks that need test results on added files and edited lines only', () => {
    const { report } = compare({
      analyzers: crapChain(),
      base: { coverage: [testsFailed('coverage')] },
      head: {
        specs: {
          coverage: [],
          crap: [
            crap('legacy-untouched', 'src/legacy.py', { line: 2, endLine: 4 }),
            crap('legacy-edited', 'src/legacy.py', { line: 6, endLine: 9 }),
            crap('added-file', 'src/added.py', { line: 1 }),
          ],
        },
        files: { 'src/legacy.py': editedLine, 'src/added.py': 'print(1)\n' },
      },
    });

    expect({
      status: report.summary.overallStatus,
      newEnforceable: report.summary.newEnforceableFindings,
      new: report.newFindings.map(({ identity }) => identity),
      unchanged: report.unchangedFindings.map(({ identity }) => identity),
      toolErrors: report.toolErrors,
    }).toEqual({
      status: 'completed',
      newEnforceable: 2,
      new: ['added-file', 'legacy-edited'],
      unchanged: ['legacy-untouched'],
      toolErrors: [],
    });
  });

  it('records one note and does not label the dependent analyzer as skipped', () => {
    const { report, outputRoot } = compare({
      analyzers: crapChain(),
      base: { coverage: [testsFailed('coverage')] },
      head: { specs: { coverage: [], crap: [] } },
    });

    const notes = [
      {
        tool: 'coverage',
        snapshot: 'base',
        rule: 'tests-failed',
        path: '.',
        message: 'tests/test_a.py::test_a fails',
      },
    ];
    expect({
      notes: report.notes,
      notesFile: JSON.parse(readFileSync(path.join(outputRoot, 'notes.json'), 'utf8')),
      skipped: report.summary.tools.map(({ skippedBecause }) => skippedBecause),
      text: report.text.includes('Notes:\ncoverage (base): tests/test_a.py::test_a fails\n'),
    }).toEqual({ notes, notesFile: notes, skipped: [undefined, undefined], text: true });
  });

  it('says so in the console summary without failing', () => {
    const { report } = compare({
      analyzers: crapChain(),
      base: { coverage: [testsFailed('coverage')] },
      head: { specs: { coverage: [], crap: [] } },
    });

    expect(renderConsoleSummary(report, { color: false })).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        "Note: the project's tests fail on the base (coverage), so its coverage, CRAP and mutation results are unknown there. Only added files and edited lines are judged on them.",
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });

  it('keeps comparing the other findings of the same analyzer with the base', () => {
    const { report } = compare({
      analyzers: [analyzer('python')],
      base: { python: [testsFailed('python'), lint('old')] },
      head: {
        specs: {
          python: [
            lint('old'),
            lint('added'),
            crap('legacy-untouched', 'src/legacy.py', { line: 2, endLine: 4 }),
          ],
        },
      },
    });

    expect({
      status: report.summary.overallStatus,
      new: report.newFindings.map(({ identity }) => identity),
      unchanged: report.unchangedFindings.map(({ identity }) => identity),
      notes: report.notes.map(({ tool, rule }) => `${tool}/${rule}`),
    }).toEqual({
      status: 'completed',
      new: ['added'],
      unchanged: ['legacy-untouched', 'old'],
      notes: ['python/tests-failed'],
    });
  });

  it('treats a skipped mutation run on the base like a red base', () => {
    const { report } = compare({
      analyzers: [analyzer('mutation')],
      base: { mutation: [testsFailed('mutation', 'tests-failed-skipped')] },
      head: {
        specs: {
          mutation: [
            {
              tool: 'mutation',
              rule: 'mutant-survived',
              path: 'src/legacy.py',
              identity: 'old-mutant',
              message: 'survived',
              classification: 'enforceable',
              location: { line: 3 },
            },
          ],
        },
      },
    });

    expect({
      status: report.summary.overallStatus,
      new: report.newFindings.length,
      unchanged: report.unchangedFindings.map(({ identity }) => identity),
      notes: report.notes.map(({ rule }) => rule),
    }).toEqual({
      status: 'completed',
      new: 0,
      unchanged: ['old-mutant'],
      notes: ['tests-failed-skipped'],
    });
  });

  it('still fails when the head tests fail', () => {
    const { report } = compare({
      analyzers: crapChain(),
      base: { coverage: [] },
      head: { specs: { coverage: [testsFailed('coverage')] } },
    });

    expect({
      status: report.summary.overallStatus,
      toolErrors: report.toolErrors.map(
        ({ tool, snapshot, rule }) => `${tool}/${snapshot}/${rule}`,
      ),
      notes: report.notes,
    }).toEqual({ status: 'tool-error', toolErrors: ['coverage/head/tests-failed'], notes: [] });
  });

  it('lists both snapshots when the tests fail on both', () => {
    const { report } = compare({
      analyzers: crapChain(),
      base: { coverage: [testsFailed('coverage')] },
      head: { specs: { coverage: [testsFailed('coverage')] } },
    });

    expect({
      status: report.summary.overallStatus,
      toolErrors: report.toolErrors.map(
        ({ tool, snapshot, rule }) => `${tool}/${snapshot}/${rule}`,
      ),
      notes: report.notes,
    }).toEqual({
      status: 'tool-error',
      toolErrors: ['coverage/base/tests-failed', 'coverage/head/tests-failed'],
      notes: [],
    });
  });

  it('stays a tool error when the base fails for another reason as well', () => {
    const crashed = {
      ...testsFailed('coverage'),
      rule: 'coverage-failed',
      identity: 'coverage-failed',
    };
    const { report } = compare({
      analyzers: crapChain(),
      base: { coverage: [testsFailed('coverage'), crashed] },
      head: { specs: { coverage: [] } },
    });

    expect({
      status: report.summary.overallStatus,
      toolErrors: report.toolErrors.map(
        ({ tool, snapshot, rule }) => `${tool}/${snapshot}/${rule}`,
      ),
      notes: report.notes,
    }).toEqual({
      status: 'tool-error',
      toolErrors: ['coverage/base/coverage-failed', 'coverage/base/tests-failed'],
      notes: [],
    });
  });
});
