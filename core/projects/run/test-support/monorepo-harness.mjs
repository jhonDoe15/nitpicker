import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runCli } from '../../../cli.mjs';
import { runTasksInProcess } from '../../../diff/execution/test-support/in-process-analyzers.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../../../diff/reporting/test-support/output-capture.mjs';
import { useGitFixtures } from '../../../diff/git/test-support/git-repository.mjs';
import { fakeAnalyzer } from '../../../command/test-support/cli-harness.mjs';

const BASE_REF = 'comparison-base';

const CLEAN_POLICY = policy();

export function violation(identity) {
  return findingLine(finding({ identity }));
}

export function projectFiles(folder, files = {}) {
  return Object.fromEntries(
    Object.entries({ 'quality-policy.json': CLEAN_POLICY, ...files }).map(([name, content]) => [
      `${folder}/${name}`,
      content,
    ]),
  );
}

function readReport(reports, name) {
  const file = path.resolve(reports, name);
  if (!file.startsWith(reports + path.sep)) {
    throw new Error(`${name} is outside the reports folder`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function sectionsOf(out, reports) {
  const text = out.replaceAll(reports, '<reports>');
  const summaryStart = text.indexOf('Monorepo summary:');
  return {
    plan: text.startsWith('Monorepo') ? text.split('\n\n')[0] : '',
    headings: text.split('\n').filter((line) => line.startsWith('== ')),
    summary: summaryStart === -1 ? '' : text.slice(summaryStart),
  };
}

export function useMonorepoFixtures() {
  const git = useGitFixtures();

  function repository(files) {
    return git.createGitRepository(
      { '.gitignore': 'node_modules/\n', ...files },
      { prefix: 'nitpicker-monorepo-', baseRef: BASE_REF },
    ).root;
  }

  function argumentsOf({ extra, reports, command, withoutBase }) {
    if (command !== undefined) {
      return command;
    }
    return [...(withoutBase ? [] : ['--base', BASE_REF]), '--output', reports, ...extra];
  }

  function run(
    root,
    extra = [],
    { environment = {}, currentProjectRoot = root, command, withoutBase = false } = {},
  ) {
    const output = captureOutput();
    const reports = path.join(git.temporaryRoot('nitpicker-monorepo-out-'), 'reports');
    const exitCode = runCli({
      arguments_: argumentsOf({ extra, reports, command, withoutBase }),
      environment: { NO_COLOR: '1', ...environment },
      currentProjectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
      progress: { write: () => undefined },
      runTasks: runTasksInProcess,
    });
    return {
      exitCode,
      reports,
      json: (name) => readReport(reports, name),
      out: output.stdoutText,
      err: output.stderrText,
      ...sectionsOf(output.stdoutText, reports),
    };
  }

  return { repository, run, temporaryRoot: git.temporaryRoot };
}
