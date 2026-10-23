import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../git/test-support/git-repository.mjs';
import { captureOutput } from '../test-support/output-capture.mjs';
import { finding, report } from '../test-support/report-builders.mjs';
import { renderDiffSummary } from './diff-summary.mjs';
import { renderSnapshotSummary } from './snapshot-summary.mjs';
import {
  SUMMARY_LIMIT_BYTES,
  fittedSummary,
  githubOutputPlan,
  writeGithubOutput,
} from './emit.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();

function run(environment, options = {}) {
  const output = captureOutput();
  const repository = createGitRepository();
  const projectRoot = options.projectFolder
    ? path.join(repository.root, options.projectFolder)
    : repository.root;
  mkdirSync(projectRoot, { recursive: true });
  const summaryPath = path.join(temporaryRoot('nitpicker-summary-'), 'summary.md');
  writeFileSync(summaryPath, 'earlier step\n');
  writeGithubOutput({
    kind: options.kind ?? 'diff',
    report: options.report ?? report({ newFindings: [finding()] }),
    projectRoot,
    environment: environment({ summaryPath }),
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { output, summary: readFileSync(summaryPath, 'utf8'), summaryPath };
}

describe('githubOutputPlan', () => {
  it.each([
    [{}, { summaryPath: undefined, annotate: false }],
    [{ GITHUB_ACTIONS: 'true' }, { summaryPath: undefined, annotate: true }],
    [{ GITHUB_ACTIONS: 'false' }, { summaryPath: undefined, annotate: false }],
    [{ GITHUB_STEP_SUMMARY: '/s.md' }, { summaryPath: '/s.md', annotate: false }],
    [{ GITHUB_STEP_SUMMARY: '' }, { summaryPath: undefined, annotate: false }],
    [{ NITPICKER_GITHUB_OUTPUT: 'on' }, { summaryPath: undefined, annotate: true }],
    [
      { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: '/s.md', NITPICKER_GITHUB_OUTPUT: 'off' },
      { summaryPath: undefined, annotate: false },
    ],
  ])('plans %j as %j', (environment, expected) => {
    expect(githubOutputPlan(environment)).toEqual(expected);
  });
});

describe('fittedSummary', () => {
  const note =
    '\n\nThe summary is cut here to stay under the 1 MiB limit of GitHub; see `report.txt`.\n';

  it('keeps a summary that fits', () => {
    expect(fittedSummary('a\nb\n', SUMMARY_LIMIT_BYTES - 4)).toBe('a\nb\n');
  });

  it('cuts at a line end and says so when the file would pass 1 MiB', () => {
    const used = SUMMARY_LIMIT_BYTES - Buffer.byteLength(note) - 5;

    expect(fittedSummary(`abc\n${'x'.repeat(200)}\n`, used)).toBe(`abc${note}`);
  });

  it('adds nothing to a file that is full', () => {
    expect(fittedSummary('abc\n', SUMMARY_LIMIT_BYTES)).toBe('');
  });
});

describe('writeGithubOutput', () => {
  const github = {
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'acme/shop',
    GITHUB_SHA: 'cafe123',
  };
  const linkBase = 'https://github.com/acme/shop/blob/cafe123';

  function expectedSummary(context, newFindings = [finding()]) {
    return `earlier step\n${renderDiffSummary(report({ newFindings }), context)}\n`;
  }

  it('appends the summary to the file and prints annotations on GitHub Actions', () => {
    const { output, summary } = run(({ summaryPath }) => ({
      GITHUB_ACTIONS: 'true',
      GITHUB_STEP_SUMMARY: summaryPath,
      ...github,
    }));

    expect(summary).toBe(expectedSummary({ linkBase, projectPrefix: '' }));
    expect(output.stdoutText).toBe(
      '::error file=src/a.js,line=12,col=3,title=eslint/no-console::Unexpected console statement\n',
    );
    expect(output.stderrText).toBe('');
  });

  it('writes only the summary when GITHUB_ACTIONS is not set', () => {
    const { output, summary } = run(({ summaryPath }) => ({ GITHUB_STEP_SUMMARY: summaryPath }));

    expect(summary).toBe(expectedSummary({ linkBase: undefined, projectPrefix: '' }));
    expect(output.stdoutText).toBe('');
  });

  it('writes nothing for a plain environment or when switched off', () => {
    expect(run(() => ({})).output.stdoutText).toBe('');
    const off = run(({ summaryPath }) => ({
      GITHUB_ACTIONS: 'true',
      GITHUB_STEP_SUMMARY: summaryPath,
      NITPICKER_GITHUB_OUTPUT: 'off',
    }));
    expect(off.output.stdoutText).toBe('');
    expect(off.summary).toBe('earlier step\n');
  });

  it('prefixes annotation paths and links with the project folder of the repository', () => {
    const { output, summary } = run(
      ({ summaryPath }) => ({
        GITHUB_ACTIONS: 'true',
        GITHUB_STEP_SUMMARY: summaryPath,
        ...github,
        GITHUB_SERVER_URL: 'https://github.com/',
      }),
      { projectFolder: 'services/api' },
    );

    expect(output.stdoutText).toBe(
      '::error file=services/api/src/a.js,line=12,col=3,title=eslint/no-console::Unexpected console statement\n',
    );
    expect(summary).toBe(expectedSummary({ linkBase, projectPrefix: 'services/api/' }));
  });

  it('annotates only enforceable findings', () => {
    const { output } = run(() => ({ GITHUB_ACTIONS: 'true' }), {
      report: report({ newFindings: [finding({ classification: 'descriptive' })] }),
    });

    expect(output.stdoutText).toBe('');
  });

  it('hides the skip notice of a snapshot whose failing tests are listed, as the console does', () => {
    const { output } = run(() => ({ GITHUB_ACTIONS: 'true' }), {
      report: report({
        toolErrors: [
          {
            tool: 'a-mutation',
            snapshot: 'head',
            rule: 'tests-failed-skipped',
            message: 'skipped',
          },
          { tool: 'z-tests', snapshot: 'head', rule: 'tests-failed', message: 'tests failed' },
        ],
      }),
    });

    expect(output.stdoutText).toBe(
      '::error title=nitpicker tool error%3A z-tests (head)::tests failed\n',
    );
  });

  it('reports a full run from its findings', () => {
    const snapshot = { summary: {}, findings: [finding()], toolErrors: [] };
    const { output, summary } = run(
      ({ summaryPath }) => ({
        GITHUB_ACTIONS: 'true',
        GITHUB_STEP_SUMMARY: summaryPath,
      }),
      { kind: 'snapshot', report: snapshot },
    );

    expect(output.stdoutText).toBe(
      '::error file=src/a.js,line=12,col=3,title=eslint/no-console::Unexpected console statement\n',
    );
    expect(summary).toBe(
      `earlier step\n${renderSnapshotSummary(snapshot, { linkBase: undefined, projectPrefix: '' })}\n`,
    );
  });

  it('warns on stderr and keeps going when the summary cannot be written', () => {
    const output = captureOutput();
    const root = createGitRepository().root;

    writeGithubOutput({
      kind: 'diff',
      report: report({ newFindings: [finding()] }),
      projectRoot: root,
      environment: {
        GITHUB_ACTIONS: 'true',
        GITHUB_STEP_SUMMARY: path.join(root, 'missing/dir/s.md'),
      },
      stdout: output.stdout,
      stderr: output.stderr,
    });

    const missing = path.join(root, 'missing/dir/s.md');
    expect(output.stderrText).toBe(
      `nitpicker: could not write the job summary: ENOENT: no such file or directory, open '${missing}'\n`,
    );
    expect(output.stdoutText).toBe(
      '::error file=src/a.js,line=12,col=3,title=eslint/no-console::Unexpected console statement\n',
    );
  });
});
