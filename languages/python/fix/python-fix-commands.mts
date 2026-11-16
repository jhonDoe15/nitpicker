import type { ToolContext } from '../adapters/typed/context/tool-context-types.mts';
import { contextFormatPlan as untypedFormatPlan } from '../adapters/formatting/format-command.mts';
import { projectConfigFor as untypedProjectConfig } from '../adapters/formatting/format-options.mts';
import { lintOptions } from '../adapters/python-tools.mts';

type BlackContext = {
  readonly project: { readonly formatter: string };
  readonly toolPrecedence?: Readonly<Record<string, string[] | undefined>> | undefined;
  readonly policyRoot?: string | undefined;
  readonly projectRoot: string;
  readonly conventions: Readonly<Record<string, unknown>>;
};
type BlackScope = { exclude: unknown; extendExclude: unknown; forceExclude: unknown };

const contextFormatPlan: (context: ToolContext) => { options: string[] } = untypedFormatPlan;
const projectConfigFor: (options: {
  formatter: string;
  precedence: string[] | undefined;
  policyRoot: string;
  conventions: Readonly<Record<string, unknown>>;
}) => { project: { scope: BlackScope } | undefined; optedIn: boolean } = untypedProjectConfig;

export { FORMAT_FAILURE_STATUS } from '../adapters/python-tools.mts';

const FORCE_EXCLUDE = '--force-exclude';

export const BLACK_DEFAULT_EXCLUDES =
  '/(\\.direnv|\\.eggs|\\.git|\\.hg|\\.ipynb_checkpoints|\\.mypy_cache|\\.nox|\\.pytest_cache|\\.ruff_cache|\\.tox|\\.svn|\\.venv|\\.vscode|__pypackages__|_build|buck-out|build|dist|venv)/';

export function lintFixCommands(
  context: ToolContext,
  fixable: readonly string[] = [],
): (file: string) => string[] {
  const options = lintOptions(context).filter((option) => option !== '--ignore-noqa');
  return (file: string) => [
    'ruff',
    'check',
    ...options,
    FORCE_EXCLUDE,
    '--fix-only',
    ...(fixable.length === 0 ? [] : ['--fixable', fixable.join(',')]),
    '--exit-non-zero-on-fix',
    `--stdin-filename=${file}`,
    '-',
  ];
}

export function reviewFixCommands(
  context: ToolContext,
  codes: readonly string[],
): (file: string) => string[] {
  const first = lintFixCommands(context)('');
  const [tool = '', subcommand = '', ...rest] = first;
  const options = rest.filter(
    (option) => !option.startsWith('--stdin-filename=') && option !== '-',
  );
  return (file: string) => [
    tool,
    subcommand,
    ...options,
    '--unsafe-fixes',
    '--select',
    codes.join(','),
    `--stdin-filename=${file}`,
    '-',
  ];
}

function flagValues(options: readonly string[], flag: string): string[] {
  return options.flatMap((option, index) => (option === flag ? [options[index + 1] ?? ''] : []));
}

function projectBlackPatterns(context: BlackContext): string[] {
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

export function blackForceExclude(context: BlackContext, options: readonly string[]): string[] {
  const excludes = flagValues(options, '--exclude');
  const patterns = [
    ...(excludes.length === 0 ? [BLACK_DEFAULT_EXCLUDES] : excludes),
    ...flagValues(options, '--extend-exclude'),
    ...flagValues(options, FORCE_EXCLUDE),
    ...projectBlackPatterns(context),
  ];
  return [FORCE_EXCLUDE, patterns.map((pattern) => `(?:${pattern})`).join('|')];
}

function withoutForceExclude(options: readonly string[]): string[] {
  return options.filter(
    (option, index) => option !== FORCE_EXCLUDE && options[index - 1] !== FORCE_EXCLUDE,
  );
}

const NOTEBOOK = /\.ipynb$/u;

export function formatStdinCommand(context: ToolContext, file: string): string[] {
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
    FORCE_EXCLUDE,
    `--stdin-filename=${file}`,
    '-',
  ];
}
