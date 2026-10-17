import path from 'node:path';
import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../shared/conventions/tool-precedence.mjs';
import {
  detectFormatter,
  detectFormatterFromSource,
  detectTargetVersion,
} from '../adapters/execution/python-project.mjs';
import { formatterPlan } from '../adapters/formatting/format-command.mjs';
import { readBlackConfig, readRuffConfig } from '../adapters/formatting/project-format-config.mjs';
import { PYTHON_INDENTATION, PYTHON_QUOTES, PYTHON_SETTING_IDS } from './python-conventions.mjs';

const BLACK_QUOTES = { preserve: 'single', normalize: 'double' };
const BLACK_NOTE = 'black accepts both quote styles';
const PYPROJECT = 'pyproject.toml';

function projectChoices(formatter, project) {
  if (project === undefined) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(project.set).map(([key, value]) => [
      PYTHON_SETTING_IDS[key],
      {
        choice: formatter === 'black' && key === 'quotes' ? BLACK_QUOTES[value] : String(value),
        from: `your ${formatter} config`,
      },
    ]),
  );
}

function ignoredConfig(formatter, projectRoot) {
  const project =
    formatter === 'black' ? readBlackConfig(projectRoot) : readRuffConfig(projectRoot);
  if (project === undefined || project.hasTable === false) {
    return [];
  }
  const relative = path.relative(projectRoot, project.file).split(path.sep).join('/');
  const table = `[tool.${formatter}]`;
  return [
    ignoredConfigNotice(
      path.basename(project.file) === PYPROJECT ? `${table} in ${relative}` : relative,
      formatter,
    ),
  ];
}

function formattingLines({ formatter, precedence, conventions, projectRoot }) {
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
    return [`Could not read the Python formatting settings: ${error.message}`];
  }
}

function unusedFor(formatter) {
  return formatter === 'black' ? { [PYTHON_INDENTATION]: 'black has no indentation setting' } : {};
}

function projectSettings({ formatter, precedence }, configRoot) {
  const layers = precedenceLayers(precedence);
  if (!layers.usesProject || layers.nitpickerFirst) {
    return undefined;
  }
  const read = formatter === 'black' ? readBlackConfig : readRuffConfig;
  return read(configRoot().path);
}

export function pythonStyle({
  config,
  projectRoot,
  source,
  configRoot = () => ({ path: projectRoot }),
}) {
  const setting = config.python?.formatter;
  const formatter =
    source === undefined
      ? detectFormatter(projectRoot, setting)
      : detectFormatterFromSource(source, setting);
  const headFormatter = detectFormatter(projectRoot, setting);
  const precedence = config.tools?.[formatter]?.precedence;
  return {
    unused: formatter === headFormatter ? unusedFor(formatter) : {},
    project: projectChoices(formatter, projectSettings({ formatter, precedence }, configRoot)),
    note: (id, choice) =>
      formatter === 'black' && id === PYTHON_QUOTES && choice === 'single' ? BLACK_NOTE : undefined,
    summary: (conventions) => formattingLines({ formatter, precedence, conventions, projectRoot }),
  };
}
