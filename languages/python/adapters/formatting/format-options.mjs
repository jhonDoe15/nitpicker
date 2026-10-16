import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  PYTHON_INDENTATION,
  PYTHON_LINE_LENGTH,
  PYTHON_QUOTES,
} from '../../conventions/python-conventions.mjs';
import { precedenceLayers } from '../../../../shared/tool-precedence.mjs';
import { readBlackConfig, readRuffConfig } from './project-format-config.mjs';

const DEFAULTS = { lineLength: '88', quotes: 'double', indentation: '4' };
const IDS = {
  lineLength: PYTHON_LINE_LENGTH,
  quotes: PYTHON_QUOTES,
  indentation: PYTHON_INDENTATION,
};
const BLACK_CONFIG = 'nitpicker-black.toml';
const SHELL_WORD = /^[\w./=:@%+-]+$/;

function optIn(tool) {
  return `"tools": { "${tool}": { "precedence": ["project", "nitpicker"] } }`;
}

function formatWith(command) {
  return `Format with \`${command}\`.`;
}

function shellWord(word) {
  return SHELL_WORD.test(word) ? word : `'${word.replaceAll("'", String.raw`'\''`)}'`;
}

function followed(conventions, key) {
  return conventions[IDS[key]] ?? DEFAULTS[key];
}

function projectWins(project, nitpickerFirst, key) {
  return project !== undefined && project.set[key] !== undefined && !nitpickerFirst;
}

function ruffFlags({ conventions, wins }) {
  return [
    ...(wins('lineLength') ? [] : ['--line-length', followed(conventions, 'lineLength')]),
    ...(wins('quotes')
      ? []
      : ['--config', `format.quote-style = "${followed(conventions, 'quotes')}"`]),
    ...(wins('indentation')
      ? []
      : ['--config', `indent-width = ${followed(conventions, 'indentation')}`]),
  ];
}

function blackFlags({ conventions, wins }) {
  return [
    ...(wins('lineLength') ? [] : ['--line-length', followed(conventions, 'lineLength')]),
    ...(!wins('quotes') && followed(conventions, 'quotes') === 'single'
      ? ['--skip-string-normalization']
      : []),
  ];
}

function ruffPlan({ conventions, project, wins, targetVersion, policyRoot }) {
  const flags = ruffFlags({ conventions, wins });
  const options =
    project === undefined
      ? ['--isolated', '--target-version', targetVersion, ...flags]
      : ['--config', path.relative(policyRoot, project.file), ...flags];
  const command = ['ruff', 'format', ...options, '.'].map(shellWord).join(' ');
  return {
    options: project === undefined ? options : ['--config', project.file, ...flags],
    advice:
      project === undefined
        ? `${formatWith(command)} To use your ruff config instead, add ${optIn('ruff')} to nitpicker.config.json.`
        : `Nitpicker uses ${path.relative(policyRoot, project.file)} for the options it sets. ${formatWith(command)}`,
  };
}

function blackPlan({ conventions, project, wins, reportRoot, policyRoot }) {
  const flags = blackFlags({ conventions, wins });
  if (project !== undefined) {
    const command = ['black', '--config', path.relative(policyRoot, project.file), ...flags, '.']
      .map(shellWord)
      .join(' ');
    return {
      options: ['--config', project.file, ...flags],
      advice: `Nitpicker uses ${path.relative(policyRoot, project.file)} for the options it sets. ${formatWith(command)}`,
    };
  }
  const single = followed(conventions, 'quotes') === 'single';
  const lineLength = followed(conventions, 'lineLength');
  const file = path.join(reportRoot, BLACK_CONFIG);
  writeFileSync(
    file,
    `[tool.black]\nline-length = ${lineLength}\nskip-string-normalization = ${String(single)}\n`,
  );
  return {
    options: ['--config', file],
    advice: `Nitpicker checks with black line-length ${lineLength}${single ? ' and string normalization off' : ''} and ignores your [tool.black] table. Put the same settings in [tool.black] and add ${optIn('black')} to nitpicker.config.json, then run black.`,
  };
}

export function formatterPlan(settings) {
  const { formatter, precedence = ['nitpicker'], policyRoot } = settings;
  const { usesProject, nitpickerFirst } = precedenceLayers(precedence);
  const read = formatter === 'black' ? readBlackConfig : readRuffConfig;
  const project = usesProject ? read(policyRoot) : undefined;
  const plan = formatter === 'black' ? blackPlan : ruffPlan;
  return plan({
    ...settings,
    conventions: settings.conventions ?? {},
    project,
    wins: (key) => projectWins(project, nitpickerFirst, key),
  });
}
