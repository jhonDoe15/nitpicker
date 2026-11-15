import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { vi } from 'vitest';
import path from 'node:path';
import { fieldOf, parseJson, textOf, textsOf } from '../../../../../shared/values/readers.mts';
import { createRootTracker } from '../environments/base/test-support/temporary-projects.mts';
import { installFakeToolchain } from '../../test-support/fake-toolchain.mts';
import { createToolContext, type ToolContext } from '../../test-support/typed/tool-context.mts';
import { createToolContext as createLooseContext } from '../../typed/runner/runner-views.mts';
import { UNTESTABLE_LINES } from '../../configuration/coverage-config/python-coverage-config.mjs';

const tracker = createRootTracker();

export function temporaryRoot(): string {
  return tracker.track(realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-tools-'))));
}

type ToolCall = {
  readonly tool: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
};

function callOf(line: string): ToolCall {
  const call = parseJson(line);
  const cwd = fieldOf(call, 'cwd');
  return {
    tool: textOf(fieldOf(call, 'tool')),
    args: textsOf(fieldOf(call, 'args')),
    cwd: cwd === undefined ? undefined : textOf(cwd),
  };
}

const DJANGO_OMIT = ['    */tests.py', '    */tests_*.py', '    */*_tests.py'];

export function coverageRc(
  root: string,
  sources: readonly string[],
  { carried = [], django }: { carried?: readonly string[]; django?: true } = {},
): string {
  return [
    '[run]',
    'branch = True',
    'parallel = False',
    'source =',
    ...sources.map((source) => `    ${path.join(root, source)}`),
    'omit =',
    '    */test_*.py',
    '    */*_test.py',
    '    */conftest.py',
    '    */tests/*',
    '    */test/*',
    `    ${path.join(root, 'testing/*')}`,
    ...(django === true ? DJANGO_OMIT : []),
    ...carried,
    '[report]',
    'exclude_lines =',
    ...UNTESTABLE_LINES.map((pattern) => `    ${pattern}`),
    'partial_branches =',
    '',
  ].join('\n');
}

export function setEnvironment(name: string, value: string | undefined): void {
  vi.stubEnv(name, value);
}

export function restoreTemporaryState(): void {
  vi.unstubAllEnvs();
  for (const root of tracker.drain()) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function project(
  files: Readonly<Record<string, string>> = {},
  { tools }: { tools?: readonly string[] } = {},
): string {
  const root = temporaryRoot();
  installFakeToolchain(path.join(root, '.venv/bin'), tools);
  mkdirSync(path.join(root, 'src/demo'), { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`${relative} is outside the project`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

export function contextFor(
  root: string,
  settings: Readonly<Record<string, unknown>> = {},
  exclude: readonly string[] = [],
): { context: ToolContext; reportRoot: string } {
  const reportRoot = temporaryRoot();
  return {
    context: createToolContext({
      projectRoot: root,
      liveRoot: root,
      settings,
      reportRoot,
      exclude,
    }),
    reportRoot,
  };
}

export function contextWithConventions(
  root: string,
  conventions: unknown,
  toolPrecedence?: unknown,
): { context: unknown; reportRoot: string } {
  const reportRoot = temporaryRoot();
  return {
    context: createLooseContext({
      projectRoot: root,
      liveRoot: root,
      reportRoot,
      conventions,
      toolPrecedence,
    }),
    reportRoot,
  };
}

export function callsLog(): (tool: string, subcommand: string) => ToolCall[] {
  const log = path.join(temporaryRoot(), 'calls.jsonl');
  writeFileSync(log, '');
  setEnvironment('FAKE_PYTHON_LOG', log);
  return (tool: string, subcommand: string) =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(callOf)
      .filter((call) => call.tool === tool && call.args[0] === subcommand);
}

export function readReport(reportRoot: string, name: string): string {
  const target = path.resolve(reportRoot, name);
  if (!target.startsWith(reportRoot + path.sep)) {
    throw new Error(`${name} is outside the report`);
  }
  return readFileSync(target, 'utf8');
}
