import { contextFormatPlan } from '../adapters/formatting/format-command.mjs';
import { projectConfigFor } from '../adapters/formatting/format-options.mjs';
import { lintOptions } from '../adapters/python-tools.mjs';

export { FORMAT_FAILURE_STATUS } from '../adapters/python-tools.mjs';

export const BLACK_DEFAULT_EXCLUDES =
  '/(\\.direnv|\\.eggs|\\.git|\\.hg|\\.ipynb_checkpoints|\\.mypy_cache|\\.nox|\\.pytest_cache|\\.ruff_cache|\\.tox|\\.svn|\\.venv|\\.vscode|__pypackages__|_build|buck-out|build|dist|venv)/';

export function lintFixCommand(context, files) {
  const options = lintOptions(context).filter((option) => option !== '--ignore-noqa');
  return ['ruff', 'check', ...options, '--force-exclude', '--fix', '--', ...files];
}

function flagValues(options, flag) {
  return options.flatMap((option, index) => (option === flag ? [options[index + 1]] : []));
}

function projectBlackPatterns(context) {
  const { formatter } = context.project;
  const { project, optedIn } = projectConfigFor({
    formatter,
    precedence: context.toolPrecedence?.[formatter],
    policyRoot: context.policyRoot ?? context.projectRoot,
    conventions: context.conventions,
  });
  return optedIn && project !== undefined
    ? [project.scope.exclude, project.scope.extendExclude, project.scope.forceExclude].filter(
        (pattern) => typeof pattern === 'string',
      )
    : [];
}

export function blackForceExclude(context, options) {
  const excludes = flagValues(options, '--exclude');
  const patterns = [
    ...(excludes.length === 0 ? [BLACK_DEFAULT_EXCLUDES] : excludes),
    ...flagValues(options, '--extend-exclude'),
    ...flagValues(options, '--force-exclude'),
    ...projectBlackPatterns(context),
  ];
  return ['--force-exclude', patterns.map((pattern) => `(?:${pattern})`).join('|')];
}

function withoutForceExclude(options) {
  return options.filter(
    (option, index) => option !== '--force-exclude' && options[index - 1] !== '--force-exclude',
  );
}

const NOTEBOOK = /\.ipynb$/u;

export function formatStdinCommand(context, file) {
  const { options } = contextFormatPlan(context);
  if (context.project.formatter === 'black') {
    return [
      'black',
      ...(NOTEBOOK.test(file) ? [] : ['-q']),
      ...withoutForceExclude(options),
      ...blackForceExclude(context, options),
      `--stdin-filename=${file}`,
      '-',
    ];
  }
  return [
    'ruff',
    'format',
    '--no-cache',
    ...options,
    '--force-exclude',
    `--stdin-filename=${file}`,
    '-',
  ];
}
