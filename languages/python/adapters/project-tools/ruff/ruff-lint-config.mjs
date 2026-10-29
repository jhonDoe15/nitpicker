import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { listRuffRules, ruffConfigFor } from '../../configuration/python-ruff-config.mjs';
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
import { mergeTables, projectLint } from './ruff-project-lint.mjs';
import { expandSelectors, resolveSelection, ruleCatalog } from './ruff-selection.mjs';

const RUFF_TOOL = 'ruff';
const LAYERED_CONFIG = 'nitpicker-ruff-layered.toml';
const LOOKED = [
  'a ruff config (.ruff.toml, ruff.toml, or pyproject.toml with a [tool.ruff] table,',
  'in the project folder or a parent up to the repository root)',
].join(' ');
const NO_RULES = [
  'ruff could not list its rules (ruff rule --all --output-format json),',
  "which layering the project lint config on nitpicker's needs:",
  'install a ruff that can, or remove "project" from tools.ruff.precedence',
].join(' ');

function readProject(configRoot) {
  const { value, error } = attempt(() => readRuffLayers(configRoot));
  if (error !== undefined) {
    return { file: error.file ?? configRoot, unreadable: error.message };
  }
  return value;
}

function filteredIgnores(perFileIgnores, { catalog, extra }) {
  const codes = new Map();
  for (const { pattern, selectors } of perFileIgnores) {
    const kept = [...expandSelectors(selectors, catalog)].filter((code) => extra.has(code));
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

function layeredConfig({ nitpicker, project, catalog, nitpickerFirst }) {
  const { select = [], ignore = [], ...nitpickerOptions } = nitpicker.lint ?? {};
  const stable = catalog.filter((rule) => rule.preview !== true);
  const own = resolveSelection([{ select, extendSelect: [], ignore }], { catalog: stable });
  const ignoredByNitpicker = expandSelectors(ignore, catalog);
  const extra = new Set(
    [...resolveSelection(project.selection, { catalog, preview: project.preview })]
      .filter((code) => !own.has(code))
      .filter((code) => !nitpickerFirst || !ignoredByNitpicker.has(code)),
  );
  const options = nitpickerFirst
    ? mergeTables(nitpickerOptions, project.options, { joinLists: true })
    : mergeTables(project.options, nitpickerOptions, { joinLists: true });
  return {
    ...project.globals,
    ...nonEmpty('extend-exclude', project.exclude),
    lint: {
      ...options,
      select: [...own, ...extra].toSorted(),
      ...nonEmpty('per-file-ignores', filteredIgnores(project.perFileIgnores, { catalog, extra })),
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
  const rules = listRuffRules(context);
  if (rules === undefined) {
    throw new Error(NO_RULES);
  }
  const project = projectLint(found.layers, {
    policyRoot: layers.configRoot,
    projectRoot: context.projectRoot,
  });
  const config = layeredConfig({
    nitpicker: parseToml(readFileSync(nitpickerFile, 'utf8')),
    project,
    catalog: ruleCatalog(rules),
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
