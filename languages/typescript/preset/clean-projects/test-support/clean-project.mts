import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll } from 'vitest';
import { containedPath as untypedContainedPath } from '../../../../../core/fix/common/contained-path.mjs';
import { runCli } from '../../../../../core/cli.mts';
import type { ExitCode } from '../../../../../core/cli-context.mts';
import {
  fieldOf,
  fieldsOf,
  listOf,
  parseJson,
  textOf,
} from '../../../../../shared/values/readers.mts';
import { withDefaultAnalyzerParallelism as untypedWithDefaultAnalyzerParallelism } from '../../../../../core/diff/execution/test-support/analyzer-parallelism.mts';
import {
  copyGitTemplate as untypedCopyGitTemplate,
  createGitTemplate as untypedCreateGitTemplate,
} from '../../../../../core/diff/git/test-support/git-repository.mts';

const withDefaultAnalyzerParallelism: <Result>(run: () => Result) => Result =
  untypedWithDefaultAnalyzerParallelism;
export const createGitTemplate: () => string = untypedCreateGitTemplate;
const containedPath: (root: string, name: string) => string = untypedContainedPath;
const copyGitTemplate: (template: string, root: string) => void = untypedCopyGitTemplate;

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const GIT_TIMEOUT_MS = 30_000;

export function git(root: string, environment: NodeJS.ProcessEnv, ...args: string[]): Buffer {
  return execFileSync('git', args, {
    cwd: root,
    env: { ...environment, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    timeout: GIT_TIMEOUT_MS,
  });
}

function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [name, text] of Object.entries(files)) {
    const target = containedPath(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

export function createCleanProject({
  fixtureRoot,
  gitTemplateRoot,
  name,
  environment,
  files = {},
}: {
  readonly fixtureRoot: string;
  readonly gitTemplateRoot: string;
  readonly name: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly files?: Readonly<Record<string, string>>;
}): string {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-${name}-`));
  cpSync(fixtureRoot, root, { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\nreports/\n');
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  writeFiles(root, files);
  copyGitTemplate(gitTemplateRoot, root);
  git(root, environment, 'add', '-A');
  git(root, environment, 'commit', '-q', '-m', 'fixture');
  return root;
}

export function useCleanProjects(environment: NodeJS.ProcessEnv): {
  readonly gitTemplate: () => string;
  readonly createProject: (options: {
    readonly fixtureRoot: string;
    readonly name: string;
    readonly files?: Readonly<Record<string, string>>;
  }) => string;
} {
  const temporaryRoots: string[] = [];
  let gitTemplateRoot: string;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  return {
    gitTemplate: () => gitTemplateRoot,
    createProject(options) {
      const root = createCleanProject({ ...options, gitTemplateRoot, environment });
      temporaryRoots.push(root);
      return root;
    },
  };
}

export function runNitpicker(
  root: string,
  argumentsList: readonly string[],
): { exitCode: ExitCode; stdoutText: string; stderrText: string } {
  let stdoutText = '';
  let stderrText = '';
  const exitCode = withDefaultAnalyzerParallelism(() =>
    runCli({
      arguments_: argumentsList,
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: { write: (text: string) => (stdoutText += text) },
      stderr: { write: (text: string) => (stderrText += text) },
      progress: { write: () => undefined },
    }),
  );
  return { exitCode, stdoutText, stderrText };
}

export function readReport(root: string, ...segments: string[]): unknown {
  return parseJson(readFileSync(containedPath(root, path.join(...segments)), 'utf8'));
}

export type FindingView = {
  readonly rule: string;
  readonly path: string;
  readonly tool: string;
  readonly classification: string;
  readonly message: string;
  readonly symbol: string;
  readonly location: Readonly<Record<string, unknown>>;
  readonly fields: string[];
  readonly allowedForm: unknown;
  readonly exception: unknown;
  readonly exceptionList: unknown;
};

export function viewFindings(report: unknown): FindingView[] {
  return listOf(report).map((finding) => ({
    rule: textOf(fieldOf(finding, 'rule')),
    path: textOf(fieldOf(finding, 'path')),
    tool: textOf(fieldOf(finding, 'tool')),
    classification: textOf(fieldOf(finding, 'classification')),
    message: textOf(fieldOf(finding, 'message')),
    symbol: textOf(fieldOf(finding, 'symbol')),
    location: fieldsOf(fieldOf(finding, 'location')),
    fields: Object.keys(fieldsOf(finding)),
    allowedForm: fieldOf(finding, 'allowedForm'),
    exception: fieldOf(finding, 'exception'),
    exceptionList: fieldOf(finding, 'exceptionList'),
  }));
}
