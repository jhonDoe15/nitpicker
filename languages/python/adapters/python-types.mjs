import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { writeMypyConfig } from './configuration/mypy-config.mjs';
import { probe, run } from './execution/python-process.mjs';
import { importRoots } from './execution/python-project.mjs';

export const TYPES_REPORT = 'type-check.json';
const TYPES_FAILED_RULE = 'types-failed';
const PYRIGHT_CONFIG = 'pyrightconfig.json';
const MYPY_CACHE = 'mypy-cache';
const TYPE_CHECKERS = ['mypy', 'pyright'];
const PYRIGHT_SECTION = /^\s*\[\s*tool\.pyright\s*\]/m;
const PYRIGHT_DEFAULT_EXCLUDE = ['**/node_modules', '**/__pycache__', '**/.*'];
const EXECUTABLE_PROBE = ['python', '-c', 'import sys; print(sys.executable)'];

function typesError(message) {
  return Object.assign(new Error(message), { rule: TYPES_FAILED_RULE });
}

export function resolveTypeChecker(context) {
  const { typeCheckers } = context.project;
  const candidates = typeCheckers.length === 0 ? TYPE_CHECKERS : typeCheckers;
  return candidates.length === 1
    ? candidates[0]
    : candidates.find((checker) => probe(context, [checker, '--version']).status === 0);
}

function environmentPython(context) {
  return run(context, EXECUTABLE_PROBE, { rule: TYPES_FAILED_RULE }).stdout.trim();
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
      '--config-file',
      writeMypyConfig(context),
      '--python-executable',
      environmentPython(context),
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

function pyrightExclude({ projectRoot, reportRoot, exclude }) {
  return [
    ...PYRIGHT_DEFAULT_EXCLUDE,
    ...exclude.map((glob) => path.relative(reportRoot, path.resolve(projectRoot, glob))),
  ];
}

export function pyrightConfig({ projectRoot, reportRoot, project, exclude }) {
  const inherited = projectPyrightConfig(projectRoot);
  return {
    ...(inherited === undefined ? {} : { extends: inherited }),
    typeCheckingMode: 'strict',
    enableTypeIgnoreComments: false,
    ignore: [],
    exclude: pyrightExclude({ projectRoot, reportRoot, exclude }),
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
