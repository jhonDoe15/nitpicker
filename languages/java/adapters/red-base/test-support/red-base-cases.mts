import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { commitBranch, runGitIn, summarize } from '../../test-support/gradle-e2e.mts';
import type { ExitCode } from '../../../../../core/cli-context.mts';
import type { JavaPolicy } from '../../typed/java-values.mts';
import { runCli } from '../../../../../core/cli.mts';
import { containedPath } from '../../../../../core/fix/common/contained-path.mjs';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { runJavaDiff } from '../../java-diff.mts';
import { testsFailOnBase as testsFailOnBaseUntyped } from '../../../../../shared/rules/finding-helpers.mjs';
import { linkSentence as linkSentenceUntyped } from '../../../../../shared/messages/test-support/link-sentence.mjs';
import { entriesOf } from '../../../../../shared/values/findings.mts';
import { parseJson, textOf } from '../../../../../shared/values/readers.mts';
import { findingsOf } from '../../typed/java-values.mts';

const testsFailOnBase: (tests: readonly string[]) => string = testsFailOnBaseUntyped;
const linkSentence: (key: string) => string | undefined = linkSentenceUntyped;
type DiffOutcome = ReturnType<typeof runJavaDiff>;

const RED_BASE = 'red-base';
const REPAIRED = 'repaired';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures');

export function createRepository({
  fixture,
  preset,
  ignored,
  files,
  fixtureRoot = fixtures,
}: {
  fixture: string;
  preset: string;
  ignored: string;
  files: Readonly<Record<string, string>>;
  fixtureRoot?: string;
}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-red-base-e2e-'));
  cpSync(containedPath(fixtureRoot, fixture), root, { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), ignored);
  writeFileSync(path.join(root, 'nitpicker.config.json'), `${JSON.stringify({ preset })}\n`);
  writeFiles(root, files);
  runGitIn(root, 'init', '-q', '-b', 'main');
  runGitIn(root, 'add', '-A');
  runGitIn(root, 'commit', '-q', '-m', 'main');
  return root;
}

export function addRedBaseBranches(
  root: string,
  { testPath, bad }: { testPath: string; bad: Readonly<Record<string, string>> },
): void {
  const passing = readFileSync(containedPath(root, testPath), 'utf8');
  const failing = passing.replace('"Hello, Ada!"', '"Hi, Ada!"');
  commitBranch(root, RED_BASE, { [testPath]: failing }, 'main');
  commitBranch(root, REPAIRED, { [testPath]: passing }, RED_BASE);
  commitBranch(root, 'repaired-with-violation', bad, REPAIRED);
}

function diffOf(
  root: string,
  branch: string,
  {
    gradle,
    maven,
    policy,
  }: { gradle: string | undefined; maven: string | undefined; policy: JavaPolicy },
): DiffOutcome {
  runGitIn(root, 'checkout', '-q', branch);
  return runJavaDiff({ repositoryRoot: root, requestedBaseRef: RED_BASE, gradle, maven, policy });
}

export function gateRedBase({
  root,
  branch,
  base = RED_BASE,
  environment,
}: {
  root: string;
  branch: string;
  base?: string;
  environment: NodeJS.ProcessEnv;
}): { exitCode: ExitCode; json: (name: string) => unknown; reports: string } {
  runGitIn(root, 'checkout', '-q', branch);
  const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-red-base-out-'));
  const sink = { write: () => undefined };
  const exitCode = runCli({
    arguments_: ['--base', base, '--output', reports],
    environment: { NO_COLOR: '1', ...environment },
    currentProjectRoot: root,
    stdout: sink,
    stderr: sink,
    progress: sink,
  });
  function json(name: string): unknown {
    return parseJson(readFileSync(containedPath(reports, name), 'utf8'));
  }
  return { exitCode, json, reports };
}

export function redBaseCases({
  setup,
  gradle,
  maven,
  environment,
  policy,
  expected,
}: {
  setup: () => string;
  gradle?: string | undefined;
  maven?: string | undefined;
  environment: NodeJS.ProcessEnv;
  policy: JavaPolicy;
  expected: { legacy: string; violation: string[] };
}): void {
  let root: string;

  beforeAll(() => {
    root = setup();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does not block a change that repairs the failing base tests, and keeps comparing the other checks with the base', () => {
    const result = diffOf(root, REPAIRED, { gradle, maven, policy });

    expect({
      failed: result.failed,
      newEnforceable: summarize(result.newEnforceable),
      notes: entriesOf(result['notes']).map(({ tool, rule }) => `${textOf(tool)} ${textOf(rule)}`),
      legacy: summarize(findingsOf(result['unchangedFindings'])).filter(
        (entry) => entry === expected.legacy,
      ),
    }).toEqual({
      failed: false,
      newEnforceable: [],
      notes: [`${textOf(policy.preset)} tests-failed`],
      legacy: [expected.legacy],
    });
  });

  it('passes the repairing change through the command line and records the failing base as a note', () => {
    const result = gateRedBase({
      root,
      branch: REPAIRED,
      environment:
        gradle === undefined ? environment : { ...environment, NITPICKER_GRADLE: gradle },
    });

    expect({
      exitCode: result.exitCode,
      toolErrors: result.json('tool-errors.json'),
      notes: result.json('notes.json'),
    }).toEqual({
      exitCode: 0,
      toolErrors: [],
      notes: [
        {
          tool: policy.preset,
          snapshot: 'base',
          rule: 'tests-failed',
          path: '.',
          message: `${testsFailOnBase([
            'demo.GreeterTest.greetsByName: expected: <Hi, Ada!> but was: <Hello, Ada!>',
          ])}\n${textOf(linkSentence('baseTestsFail'))}`,
        },
      ],
    });
    rmSync(result.reports, { recursive: true, force: true });
  });

  it('still fails a new violation next to a failing base', () => {
    const result = diffOf(root, 'repaired-with-violation', { gradle, maven, policy });

    expect({ failed: result.failed, newEnforceable: summarize(result.newEnforceable) }).toEqual({
      failed: true,
      newEnforceable: expected.violation,
    });
  });
}
