import path from 'node:path';
import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../shared/conventions/tool-precedence.mjs';
import {
  detectFormatter,
  detectFormatterFromSource,
  detectTargetVersion,
} from '../adapters/execution/python-project.mts';
import { ignoredProjectToolNotices } from '../adapters/project-tools/ignored-notices.mts';
import { formatterPlan } from '../adapters/formatting/format-command.mts';
import { optionsOverNitpickerRules } from '../adapters/project-tools/ruff/ruff-lint-config.mts';
import { readBlackConfig, readRuffConfig } from '../adapters/formatting/project-format-config.mts';
import type { Formatter, FormatterSettings, StyleInput } from './typed/style-types.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import type { StyleParts } from '../../../core/conventions/typed/convention-types.mts';
import { messageOf } from '../../../shared/values/readers.mts';
import { PYTHON_INDENTATION, PYTHON_QUOTES, PYTHON_SETTING_IDS } from './python-conventions.mts';

const readConfig: Record<string, (root: string) => FormatterSettings | undefined> = {
  black: readBlackConfig,
  ruff: readRuffConfig,
};
const BLACK_QUOTES: Record<string, string> = { preserve: 'single', normalize: 'double' };
const SETTING_IDS: Record<string, string> = PYTHON_SETTING_IDS;
const BLACK = 'black';
const BLACK_NOTE = 'black accepts both quote styles';
const PYPROJECT = 'pyproject.toml';
const RUFF_NOTE = ' except lint.flake8-pytest-style';

function projectChoices(
  formatter: Formatter,
  project: FormatterSettings | undefined,
): Record<string, { choice: string; from: string }> {
  if (project === undefined) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(project.set).map(([key, value]) => [
      String(SETTING_IDS[key]),
      {
        choice:
          formatter === BLACK && key === 'quotes'
            ? (BLACK_QUOTES[String(value)] ?? String(value))
            : String(value),
        from: `your ${formatter} config`,
      },
    ]),
  );
}

function ignoredConfig(formatter: Formatter, projectRoot: string): string[] {
  const project = readConfig[formatter]?.(projectRoot);
  if (project === undefined || ('hasTable' in project && !project.hasTable)) {
    return [];
  }
  const relative = path.relative(projectRoot, project.file).split(path.sep).join('/');
  const table = `[tool.${formatter}]`;
  const label = path.basename(project.file) === PYPROJECT ? `${table} in ${relative}` : relative;
  return [ignoredConfigNotice(`${label}${formatter === 'ruff' ? RUFF_NOTE : ''}`, formatter)];
}

function formattingLines({
  formatter,
  precedence,
  conventions,
  projectRoot,
}: {
  formatter: Formatter;
  precedence: string[] | undefined;
  conventions: unknown;
  projectRoot: string;
}): string[] {
  try {
    const plan = formatterPlan({
      formatter,
      conventions,
      precedence,
      policyRoot: projectRoot,
      root: projectRoot,
      targetVersion: detectTargetVersion(projectRoot),
    });
    const ignored = precedenceLayers(precedence).usesProject
      ? []
      : ignoredConfig(formatter, projectRoot);
    return [`Format with ${formatter}: ${plan.command}`, ...ignored];
  } catch (error) {
    return [`Could not read the Python formatting settings: ${messageOf(error)}`];
  }
}

function replacedOptions(projectRoot: string): string[] {
  const keys = optionsOverNitpickerRules(projectRoot);
  return keys.length === 0
    ? []
    : [`ruff check: the project's ${keys.join(', ')} replace nitpicker's for its own rules`];
}

function lintLines({
  config,
  formatter,
  projectRoot,
}: {
  config: NitpickerConfig;
  formatter: Formatter;
  projectRoot: string;
}): string[] {
  const layers = precedenceLayers(config.tools?.['ruff']?.precedence);
  try {
    if (layers.usesProject) {
      return layers.nitpickerFirst ? [] : replacedOptions(projectRoot);
    }
    return formatter === 'ruff' ? [] : ignoredConfig('ruff', projectRoot);
  } catch (error) {
    return [`Could not read the ruff lint settings: ${messageOf(error)}`];
  }
}

function unusedFor(formatter: Formatter): Record<string, string> {
  return formatter === BLACK ? { [PYTHON_INDENTATION]: 'black has no indentation setting' } : {};
}

function projectSettings(
  { formatter, precedence }: { formatter: Formatter; precedence: string[] | undefined },
  configRoot: () => { readonly path: string },
): FormatterSettings | undefined {
  const layers = precedenceLayers(precedence);
  if (!layers.usesProject || layers.nitpickerFirst) {
    return undefined;
  }
  return readConfig[formatter]?.(configRoot().path);
}

export function pythonStyle({
  config,
  projectRoot,
  source,
  configRoot = () => ({ path: projectRoot }),
}: StyleInput): StyleParts {
  const configured = config.python?.['formatter'];
  const setting = typeof configured === 'string' ? configured : undefined;
  const formatter =
    source === undefined
      ? detectFormatter(projectRoot, setting)
      : detectFormatterFromSource(source, setting);
  const headFormatter = detectFormatter(projectRoot, setting);
  const precedence = config.tools?.[formatter]?.precedence;
  return {
    unused: formatter === headFormatter ? unusedFor(formatter) : {},
    project: projectChoices(formatter, projectSettings({ formatter, precedence }, configRoot)),
    note: (id: string, choice: unknown) =>
      formatter === BLACK && id === PYTHON_QUOTES && choice === 'single' ? BLACK_NOTE : undefined,
    summary: (conventions: unknown) => [
      ...formattingLines({ formatter, precedence, conventions, projectRoot }),
      ...lintLines({ config, formatter, projectRoot }),
      ...ignoredProjectToolNotices({ config, projectRoot }),
    ],
  };
}
