import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RUFF_CONFIG, ruffConfigFor } from '../../configuration/python-ruff-config.mjs';
import { PYTHON_SETTING_IDS } from '../../../conventions/python-conventions.mjs';
import { followed } from '../../formatting/format-options.mjs';
import { readRuffLayers } from '../../formatting/project-format-config.mjs';
import {
  attempt,
  parseToml,
  requireProjectConfig,
  stringifyToml,
  toolLayers,
  unique,
} from '../project-tool-layers.mjs';
import { optionsBesideNitpicker, optionsOverNitpicker } from './ruff-option-linters.mjs';
import { layoutGlobals, mergeTables, projectLint } from './ruff-project-lint.mjs';
import { resolvedLint } from './ruff-settings.mjs';

const RUFF_TOOL = 'ruff';
const LAYERED_CONFIG = 'nitpicker-ruff-layered.toml';
const LOOKED = [
  'a ruff config (.ruff.toml, ruff.toml, or pyproject.toml with a [tool.ruff] table,',
  'in the project folder or a parent up to the repository root)',
].join(' ');

function readProject(configRoot) {
  const { value, error } = attempt(() => readRuffLayers(configRoot));
  if (error !== undefined) {
    return { file: error.file ?? configRoot, unreadable: error.message };
  }
  return value;
}

function filteredIgnores(perFileIgnores, extra) {
  const codes = new Map();
  for (const { pattern, codes: ignored } of perFileIgnores) {
    const kept = ignored.filter((code) => extra.has(code));
    codes.set(pattern, unique([...(codes.get(pattern) ?? []), ...kept]));
  }
  return Object.fromEntries(
    [...codes]
      .filter(([, kept]) => kept.length > 0)
      .map(([pattern, kept]) => [pattern, kept.toSorted()]),
  );
}

function nonEmpty(key, value) {
  const empty = Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0;
  return empty ? {} : { [key]: value };
}

function nitpickerIgnores(ignore, enabled) {
  return new Set(
    [...enabled].filter((code) => ignore.some((selector) => code.startsWith(selector))),
  );
}

function layeredConfig({ nitpicker, project, own, resolved, nitpickerFirst }) {
  const { ignore = [], ...rest } = nitpicker.lint ?? {};
  const nitpickerOptions = Object.fromEntries(
    Object.entries(rest).filter(([key]) => key !== 'select'),
  );
  const ignoredByNitpicker = nitpickerIgnores(ignore, resolved.enabled);
  const extra = new Set(
    [...resolved.enabled]
      .filter((code) => !own.has(code))
      .filter((code) => !nitpickerFirst || !ignoredByNitpicker.has(code)),
  );
  const options = nitpickerFirst
    ? mergeTables(nitpickerOptions, optionsBesideNitpicker(project.options, own), {
        joinLists: false,
      })
    : mergeTables(project.options, nitpickerOptions, { joinLists: true });
  return {
    ...(nitpickerFirst ? layoutGlobals(project.globals) : project.globals),
    ...nonEmpty('extend-exclude', project.exclude),
    lint: {
      ...options,
      select: [...own, ...extra].toSorted(),
      ...nonEmpty('per-file-ignores', filteredIgnores(resolved.perFileIgnores, extra)),
      ...nonEmpty('exclude', project.lintExclude),
    },
  };
}

function lineLength({ conventions = {} }, { layers, own }) {
  const measured = conventions[PYTHON_SETTING_IDS.lineLength];
  const projectWins =
    layers?.nitpickerFirst === false &&
    own !== undefined &&
    (measured === undefined || measured === String(own));
  return projectWins ? String(own) : followed(conventions, 'lineLength');
}

export function ruffLintConfig(context) {
  const nitpickerFile = ruffConfigFor(context);
  const layers = toolLayers(context, RUFF_TOOL);
  if (!layers.optedIn) {
    return { file: nitpickerFile, setsTargetVersion: false, lineLength: lineLength(context, {}) };
  }
  const found = requireProjectConfig(readProject(layers.configRoot), {
    tool: RUFF_TOOL,
    looked: LOOKED,
    configRoot: layers.configRoot,
  });
  const project = projectLint(found.layers, {
    policyRoot: layers.configRoot,
    projectRoot: context.projectRoot,
  });
  const config = layeredConfig({
    nitpicker: parseToml(readFileSync(nitpickerFile, 'utf8')),
    project,
    own: resolvedLint(context, { file: nitpickerFile }).enabled,
    resolved: resolvedLint(context, {
      file: found.file,
      configRoot: layers.configRoot,
      preview: !layers.nitpickerFirst,
    }),
    nitpickerFirst: layers.nitpickerFirst,
  });
  const file = path.join(context.reportRoot, LAYERED_CONFIG);
  writeFileSync(file, stringifyToml(config));
  return {
    file,
    setsTargetVersion: config['target-version'] !== undefined,
    lineLength: lineLength(context, { layers, own: config['line-length'] }),
  };
}

export function optionsOverNitpickerRules(root) {
  const project = readRuffLayers(root);
  if (project === undefined) {
    return [];
  }
  const { options } = projectLint(project.layers, { policyRoot: root, projectRoot: root });
  const selected = parseToml(readFileSync(RUFF_CONFIG, 'utf8')).lint?.select ?? [];
  return optionsOverNitpicker(options, new Set(selected));
}
