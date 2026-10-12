import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execute, run } from './python-execute.mjs';
import { importRoots } from './python-project.mjs';

export const TYPES_REPORT = 'type-check.json';
export const TYPES_FAILED_RULE = 'types-failed';
const PYRIGHT_CONFIG = 'pyrightconfig.json';
const MYPY_CACHE = 'mypy-cache';
const TYPE_CHECKERS = ['mypy', 'pyright'];
const PYRIGHT_SECTION = /^\s*\[tool\.pyright\]/m;

function typesError(message) {
  return Object.assign(new Error(message), { rule: TYPES_FAILED_RULE });
}

export function resolveTypeChecker(context) {
  return (
    context.project.typeChecker ??
    TYPE_CHECKERS.find((checker) => execute(context, [checker, '--version']).status === 0)
  );
}

function mypyPath(context) {
  return [...importRoots(context.projectRoot, context.project.sourceRoots), process.env.MYPYPATH]
    .filter((entry) => entry !== undefined && entry !== '')
    .join(path.delimiter);
}

function runMypy(context) {
  return run(
    context,
    [
      'mypy',
      '--strict',
      '--explicit-package-bases',
      '--show-error-codes',
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

function projectPyrightConfig(projectRoot) {
  const json = path.join(projectRoot, PYRIGHT_CONFIG);
  if (existsSync(json)) {
    return json;
  }
  const pyproject = path.join(projectRoot, 'pyproject.toml');
  const declaresPyright =
    existsSync(pyproject) && PYRIGHT_SECTION.test(readFileSync(pyproject, 'utf8'));
  return declaresPyright ? pyproject : undefined;
}

export function pyrightConfig({ projectRoot, reportRoot, project }) {
  const inherited = projectPyrightConfig(projectRoot);
  return {
    ...(inherited === undefined ? {} : { extends: inherited }),
    typeCheckingMode: 'strict',
    enableTypeIgnoreComments: false,
    include: project.sourceRoots.map((root) =>
      path.relative(reportRoot, path.resolve(projectRoot, root)),
    ),
    extraPaths: importRoots(projectRoot, project.sourceRoots),
  };
}

function runPyright(context) {
  const config = path.join(context.reportRoot, PYRIGHT_CONFIG);
  writeFileSync(config, JSON.stringify(pyrightConfig(context)));
  return run(context, ['pyright', '--outputjson', '--project', config], {
    accepted: [0, 1],
    rule: TYPES_FAILED_RULE,
  });
}

const RUNNERS = { mypy: runMypy, pyright: runPyright };

export function typeCheck(context) {
  const checker = resolveTypeChecker(context);
  if (checker === undefined) {
    throw typesError(
      `No type checker found in the ${context.launcher.description} environment: install mypy or pyright there, or set "python.typeChecker" in nitpicker.config.json`,
    );
  }
  const { stdout } = RUNNERS[checker](context);
  writeFileSync(
    path.join(context.reportRoot, TYPES_REPORT),
    JSON.stringify({ checker, output: stdout }),
  );
}
