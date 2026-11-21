import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runCli } from '../../../cli.mts';
import { runTasksInProcess } from '../../../diff/execution/test-support/in-process-analyzers.mts';
import {
  finding,
  findingLine,
  policy,
} from '../../../diff/execution/test-support/analyzer-findings.mts';
import { captureOutput } from '../../../diff/reporting/test-support/output-capture.mts';
import { useGitFixtures } from '../../../diff/git/test-support/git-repository.mts';
import { fakeAnalyzer } from '../../../command/test-support/cli-harness.mts';
import type { FixtureAnalyzer } from '../../../command/test-support/fixture-types.mts';
import type { CombinedSummary } from '../../report/combined-summary.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';

export type ReportSummary = CombinedSummary & {
  readonly configOverrides: string[];
  readonly tools: readonly { readonly name: string }[];
};

type SarifView = {
  readonly runs: readonly {
    readonly automationDetails: { readonly id: string };
    readonly results: readonly {
      readonly locations: readonly {
        readonly physicalLocation: { readonly artifactLocation: { readonly uri: string } };
      }[];
    }[];
  }[];
};

type ReportReader = {
  (name: `${string}summary.json`): ReportSummary;
  (name: `${string}.sarif`): SarifView;
  (name: string): readonly ReportEntry[];
};

export type MonorepoRun = {
  readonly exitCode: number;
  readonly reports: string;
  readonly json: ReportReader;
  readonly out: string;
  readonly err: string;
  readonly plan: string;
  readonly headings: string[];
  readonly summary: string;
};

export type RunOptions = {
  readonly environment?: NodeJS.ProcessEnv;
  readonly workingDirectory?: string;
  readonly command?: readonly string[];
  readonly withoutBase?: true;
  readonly analyzers?: readonly FixtureAnalyzer[];
  readonly projectWorker?: string;
};

function jsonReader(reports: string): ReportReader {
  function read(name: `${string}summary.json`): ReportSummary;
  function read(name: `${string}.sarif`): SarifView;
  function read(name: string): readonly ReportEntry[];
  function read(name: string): unknown {
    return readReport(reports, name);
  }
  return read;
}

const BASE_REF = 'comparison-base';

const CLEAN_POLICY = policy();

export function violation(identity: string): string {
  return findingLine(finding({ identity }));
}

export function projectFiles(
  folder: string,
  files: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ 'quality-policy.json': CLEAN_POLICY, ...files }).map(([name, content]) => [
      `${folder}/${name}`,
      content,
    ]),
  );
}

function readReport(reports: string, name: string): unknown {
  const file = path.resolve(reports, name);
  if (!file.startsWith(reports + path.sep)) {
    throw new Error(`${name} is outside the reports folder`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function sectionsOf(
  out: string,
  reports: string,
): Pick<MonorepoRun, 'plan' | 'headings' | 'summary'> {
  const text = out.replaceAll(reports, '<reports>');
  const summaryStart = text.indexOf('Monorepo summary:');
  return {
    plan: text.startsWith('Monorepo') ? (text.split('\n\n')[0] ?? '') : '',
    headings: text.split('\n').filter((line) => line.startsWith('== ')),
    summary: summaryStart === -1 ? '' : text.slice(summaryStart),
  };
}

async function finishLater(
  exitCode: Promise<number>,
  finish: (code: number) => MonorepoRun,
): Promise<MonorepoRun> {
  return finish(await exitCode);
}

export function useMonorepoFixtures(): {
  readonly repository: (files: Readonly<Record<string, string>>) => string;
  readonly run: (root: string, extra?: readonly string[], options?: RunOptions) => MonorepoRun;
  readonly runAsync: (
    root: string,
    extra?: readonly string[],
    options?: RunOptions,
  ) => Promise<MonorepoRun>;
  readonly temporaryRoot: (prefix: string) => string;
} {
  const git = useGitFixtures();

  function repository(files: Readonly<Record<string, string>>): string {
    return git.createGitRepository(
      { '.gitignore': 'node_modules/\n', ...files },
      { prefix: 'nitpicker-monorepo-', baseRef: BASE_REF },
    ).root;
  }

  function argumentsOf({
    extra,
    reports,
    command,
    withoutBase,
  }: {
    readonly extra: readonly string[];
    readonly reports: string;
    readonly command: readonly string[] | undefined;
    readonly withoutBase: boolean;
  }): readonly string[] {
    if (command !== undefined) {
      return command;
    }
    return [...(withoutBase ? [] : ['--base', BASE_REF]), '--output', reports, ...extra];
  }

  function start(
    root: string,
    extra: readonly string[] = [],
    {
      environment = {},
      workingDirectory,
      command,
      withoutBase,
      analyzers = [fakeAnalyzer()],
      projectWorker,
    }: RunOptions = {},
  ): MonorepoRun | Promise<MonorepoRun> {
    const output = captureOutput();
    const reports = path.join(git.temporaryRoot('nitpicker-monorepo-out-'), 'reports');
    const exitCode = runCli({
      arguments_: argumentsOf({ extra, reports, command, withoutBase: withoutBase === true }),
      environment: { NO_COLOR: '1', ...environment },
      ...(workingDirectory === undefined ? { currentProjectRoot: root } : { workingDirectory }),
      analyzers,
      stdout: output.stdout,
      stderr: output.stderr,
      progress: { write: () => undefined },
      runTasks: runTasksInProcess,
      ...(projectWorker === undefined ? {} : { projectWorker }),
    });
    function finish(code: number): MonorepoRun {
      return {
        exitCode: code,
        reports,
        json: jsonReader(reports),
        out: output.stdoutText,
        err: output.stderrText,
        ...sectionsOf(output.stdoutText, reports),
      };
    }
    return typeof exitCode === 'number' ? finish(exitCode) : finishLater(exitCode, finish);
  }

  function run(root: string, extra: readonly string[] = [], options: RunOptions = {}): MonorepoRun {
    const result = start(root, extra, options);
    if (result instanceof Promise) {
      throw new TypeError('this run finishes asynchronously: use runAsync');
    }
    return result;
  }

  async function runAsync(
    root: string,
    extra: readonly string[] = [],
    options: RunOptions = {},
  ): Promise<MonorepoRun> {
    return await start(root, extra, options);
  }

  return { repository, run, runAsync, temporaryRoot: git.temporaryRoot };
}
