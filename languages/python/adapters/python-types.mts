import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { mypyExcludeArguments, writeMypyConfig } from './configuration/mypy/mypy-config.mts';
import { probe, run } from './execution/python-process.mts';
import { importRoots } from './execution/python-project.mts';
import { mypyLayers } from './project-tools/mypy-layers.mts';
import { pyrightConfig } from './project-tools/pyright/pyright-config.mts';
import type { SpawnResult } from './execution/typed/process-types.mts';
import type { ToolContext } from './typed/context/tool-context-types.mts';

export const TYPES_REPORT = 'type-check.json';
const TYPES_FAILED_RULE = 'types-failed';
const PYRIGHT_CONFIG = 'pyrightconfig.json';
const MYPY_CACHE = 'mypy-cache';
const TYPE_CHECKERS = ['mypy', 'pyright', 'basedpyright'];
const DEPRECATED_CODE_SINCE = { major: 1, minor: 14 };
const MYPY_VERSION = /^mypy (\d+)\.(\d+)/;
const EXECUTABLE_PROBE = ['python', '-c', 'import sys; print(sys.executable)'];

function typesError(message: string): Error {
  return Object.assign(new Error(message), { rule: TYPES_FAILED_RULE });
}

export function resolveTypeChecker(context: ToolContext): string | undefined {
  const { typeCheckers } = context.project;
  const candidates = typeCheckers.length === 0 ? TYPE_CHECKERS : typeCheckers;
  return candidates.length === 1
    ? candidates[0]
    : candidates.find((checker) => probe(context, [checker, '--version']).status === 0);
}

function environmentPython(context: ToolContext): string {
  return run(context, EXECUTABLE_PROBE, { rule: TYPES_FAILED_RULE }).stdout.trim();
}

function mypyPath(context: ToolContext): string {
  return [...importRoots(context.projectRoot, context.project.sourceRoots), process.env['MYPYPATH']]
    .filter((entry) => entry !== undefined && entry !== '')
    .join(path.delimiter);
}

function mypyReportsDeprecations(context: ToolContext): boolean {
  const match = MYPY_VERSION.exec(probe(context, ['mypy', '--version']).stdout);
  if (match === null) {
    return false;
  }
  const [major = 0, minor = 0] = match.slice(1).map(Number);
  return (
    major > DEPRECATED_CODE_SINCE.major ||
    (major === DEPRECATED_CODE_SINCE.major && minor >= DEPRECATED_CODE_SINCE.minor)
  );
}

export function runMypy(context: ToolContext): SpawnResult {
  const config = writeMypyConfig(context);
  return run(
    context,
    [
      'mypy',
      '--config-file',
      config,
      '--python-executable',
      environmentPython(context),
      ...(mypyLayers(context).appliesProject ? [] : ['--strict']),
      ...(mypyReportsDeprecations(context) ? ['--enable-error-code', 'deprecated'] : []),
      ...mypyExcludeArguments(context),
      '--explicit-package-bases',
      '--show-error-codes',
      '--show-column-numbers',
      '--no-error-summary',
      '--no-pretty',
      '--hide-error-context',
      '--no-color-output',
      '--cache-dir',
      path.join(context.reportRoot, MYPY_CACHE),
      ...context.project.sourceRoots,
    ],
    { accepted: [0, 1], rule: TYPES_FAILED_RULE, env: { MYPYPATH: mypyPath(context) } },
  );
}

function pyrightRunner(checker: string): (context: ToolContext) => SpawnResult {
  return (context) => {
    const config = path.join(context.reportRoot, PYRIGHT_CONFIG);
    writeFileSync(config, JSON.stringify(pyrightConfig(context, checker)));
    return run(context, [checker, '--outputjson', '--project', config], {
      accepted: [0, 1],
      rule: TYPES_FAILED_RULE,
    });
  };
}

const RUNNERS: Readonly<Record<string, (context: ToolContext) => SpawnResult>> = {
  mypy: runMypy,
  pyright: pyrightRunner('pyright'),
  basedpyright: pyrightRunner('basedpyright'),
};

export function typeCheck(context: ToolContext): void {
  const checker = resolveTypeChecker(context);
  if (checker === undefined) {
    throw typesError(
      `No type checker found in the ${context.launcher.description} environment: install mypy, pyright or basedpyright there, or set "python.typeChecker" in nitpicker.config.json`,
    );
  }
  const runChecker = RUNNERS[checker];
  if (runChecker === undefined) {
    throw typesError(`Unsupported type checker: ${checker}`);
  }
  const { stdout } = runChecker(context);
  writeFileSync(
    path.join(context.reportRoot, TYPES_REPORT),
    JSON.stringify({ checker, output: stdout }),
  );
}
