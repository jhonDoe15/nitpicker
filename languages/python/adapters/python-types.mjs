import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { writeMypyConfig } from './configuration/mypy-config.mjs';
import { probe, run } from './execution/python-process.mjs';
import { importRoots } from './execution/python-project.mjs';

export const TYPES_REPORT = 'type-check.json';
const TYPES_FAILED_RULE = 'types-failed';
const PYRIGHT_CONFIG = 'pyrightconfig.json';
const MYPY_CACHE = 'mypy-cache';
const TYPE_CHECKERS = ['mypy', 'pyright', 'basedpyright'];
const PYRIGHT_FAMILY = {
  pyright: {
    files: [PYRIGHT_CONFIG],
    section: /^\s*\[\s*tool\.pyright\s*\]/m,
  },
  basedpyright: {
    files: [PYRIGHT_CONFIG],
    section: /^\s*\[\s*tool\.(?:basedpyright|pyright)\s*\]/m,
  },
};
const PYRIGHT_DEFAULT_EXCLUDE = ['**/node_modules', '**/__pycache__', '**/.*'];
const DEPRECATED_CODE_SINCE = { major: 1, minor: 14 };
const MYPY_VERSION = /^mypy (\d+)\.(\d+)/;
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

function mypyReportsDeprecations(context) {
  const match = MYPY_VERSION.exec(probe(context, ['mypy', '--version']).stdout);
  if (match === null) {
    return false;
  }
  const [major, minor] = match.slice(1).map(Number);
  return (
    major > DEPRECATED_CODE_SINCE.major ||
    (major === DEPRECATED_CODE_SINCE.major && minor >= DEPRECATED_CODE_SINCE.minor)
  );
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
      ...(mypyReportsDeprecations(context) ? ['--enable-error-code', 'deprecated'] : []),
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

function projectPyrightConfig(projectRoot, checker) {
  const { files, section } = PYRIGHT_FAMILY[checker];
  const json = files.map((file) => path.join(projectRoot, file)).find((file) => existsSync(file));
  if (json !== undefined) {
    return json;
  }
  const pyproject = path.join(projectRoot, 'pyproject.toml');
  const declaresSection = existsSync(pyproject) && section.test(readFileSync(pyproject, 'utf8'));
  return declaresSection ? pyproject : undefined;
}

function pyrightExclude({ projectRoot, reportRoot, exclude }) {
  return [
    ...PYRIGHT_DEFAULT_EXCLUDE,
    ...exclude.map((glob) => path.relative(reportRoot, path.resolve(projectRoot, glob))),
  ];
}

export function pyrightConfig({ projectRoot, reportRoot, project, exclude }, checker = 'pyright') {
  const inherited = projectPyrightConfig(projectRoot, checker);
  return {
    ...(inherited === undefined ? {} : { extends: inherited }),
    typeCheckingMode: 'strict',
    reportDeprecated: 'error',
    enableTypeIgnoreComments: false,
    ignore: [],
    executionEnvironments: [],
    exclude: pyrightExclude({ projectRoot, reportRoot, exclude }),
    include: project.sourceRoots.map((root) =>
      path.relative(reportRoot, path.resolve(projectRoot, root)),
    ),
    extraPaths: importRoots(projectRoot, project.sourceRoots),
  };
}

function pyrightRunner(checker) {
  return (context) => {
    const config = path.join(context.reportRoot, PYRIGHT_CONFIG);
    writeFileSync(config, JSON.stringify(pyrightConfig(context, checker)));
    return run(context, [checker, '--outputjson', '--project', config], {
      accepted: [0, 1],
      rule: TYPES_FAILED_RULE,
    });
  };
}

const RUNNERS = {
  mypy: runMypy,
  pyright: pyrightRunner('pyright'),
  basedpyright: pyrightRunner('basedpyright'),
};

export function typeCheck(context) {
  const checker = resolveTypeChecker(context);
  if (checker === undefined) {
    throw typesError(
      `No type checker found in the ${context.launcher.description} environment: install mypy, pyright or basedpyright there, or set "python.typeChecker" in nitpicker.config.json`,
    );
  }
  const { stdout } = RUNNERS[checker](context);
  writeFileSync(
    path.join(context.reportRoot, TYPES_REPORT),
    JSON.stringify({ checker, output: stdout }),
  );
}
