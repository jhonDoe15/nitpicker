import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RUFF_CONFIG, ruffConfigFor } from '../../configuration/python-ruff-config.mts';
import {
  fieldOf,
  fieldsOf,
  messageOf,
  textOf,
  textsOf,
  type Fields,
} from '../../../../../shared/values/readers.mts';
import type { ToolContext } from '../../typed/context/tool-context-types.mts';
import type { IgnoreEntry, LintSettings, RuffLayers, RuffProject } from '../typed/ruff-types.mts';
import type { ToolLayers } from '../typed/tool-types.mts';
import { PYTHON_SETTING_IDS } from '../../../conventions/python-conventions.mts';
import { followed } from '../../formatting/format-options.mts';
import { readRuffLayers as untypedReadLayers } from '../../formatting/project-format-config.mts';
import {
  attempt,
  parseToml,
  requireProjectConfig,
  stringifyToml,
  toolLayers,
  unique,
} from '../project-tool-layers.mts';
import { optionsBesideNitpicker, optionsOverNitpicker } from './ruff-option-linters.mts';
import { layoutGlobals, mergeTables, projectLint } from './ruff-project-lint.mts';
import { resolvedLint } from './ruff-settings.mts';

const readRuffLayers: (root: string) => RuffLayers | undefined = untypedReadLayers;
type LayeredInput = {
  nitpicker: Fields;
  project: RuffProject;
  own: ReadonlySet<string>;
  resolved: LintSettings;
  nitpickerFirst: boolean;
};

const RUFF_TOOL = 'ruff';
const LAYERED_CONFIG = 'nitpicker-ruff-layered.toml';
const LOOKED = [
  'a ruff config (.ruff.toml, ruff.toml, or pyproject.toml with a [tool.ruff] table,',
  'in the project folder or a parent up to the repository root)',
].join(' ');

function readProject(configRoot: string): RuffLayers | undefined {
  const { value, error } = attempt(() => readRuffLayers(configRoot));
  if (error !== undefined) {
    const file = fieldOf(error, 'file');
    return { file: typeof file === 'string' ? file : configRoot, unreadable: messageOf(error) };
  }
  return value;
}

function filteredIgnores(
  perFileIgnores: readonly IgnoreEntry[],
  extra: ReadonlySet<string>,
): Fields {
  const codes = new Map<string, string[]>();
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

function nonEmpty(key: string, value: readonly unknown[] | Fields): Fields {
  const empty = Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0;
  return empty ? {} : { [key]: value };
}

function nitpickerIgnores(ignore: readonly string[], enabled: ReadonlySet<string>): Set<string> {
  return new Set(
    [...enabled].filter((code) => ignore.some((selector) => code.startsWith(selector))),
  );
}

function layeredConfig({
  nitpicker,
  project,
  own,
  resolved,
  nitpickerFirst,
}: LayeredInput): Fields {
  const { ignore, ...rest } = fieldsOf(nitpicker['lint']);
  const nitpickerOptions = Object.fromEntries(
    Object.entries(rest).filter(([key]) => key !== 'select'),
  );
  const ignoredByNitpicker = nitpickerIgnores(textsOf(ignore), resolved.enabled);
  const extra = new Set(
    [...resolved.enabled]
      .filter((code) => !own.has(code))
      .filter((code) => !(nitpickerFirst && ignoredByNitpicker.has(code))),
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

function lineLength(
  { conventions }: Pick<ToolContext, 'conventions'>,
  { layers, own }: { layers?: ToolLayers; own?: unknown },
): string {
  const measured = conventions[PYTHON_SETTING_IDS.lineLength];
  const projectWins =
    layers?.nitpickerFirst === false &&
    own !== undefined &&
    (measured === undefined || measured === textOf(own));
  return projectWins ? textOf(own) : followed(conventions, 'lineLength');
}

export function ruffLintConfig(context: ToolContext): {
  file: string;
  setsTargetVersion: boolean;
  lineLength: string;
} {
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
  const project = projectLint(found.layers ?? [], {
    policyRoot: layers.configRoot,
    projectRoot: context.projectRoot,
  });
  const config = layeredConfig({
    nitpicker: parseToml(readFileSync(nitpickerFile, 'utf8')),
    project,
    own: resolvedLint(context, {
      file: nitpickerFile,
      configRoot: context.reportRoot,
      preview: true,
    }).enabled,
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

export function optionsOverNitpickerRules(root: string): string[] {
  const project = readRuffLayers(root);
  if (project === undefined) {
    return [];
  }
  const { options } = projectLint(project.layers ?? [], { policyRoot: root, projectRoot: root });
  const selected = textsOf(fieldOf(parseToml(readFileSync(RUFF_CONFIG, 'utf8'))['lint'], 'select'));
  return optionsOverNitpicker(options, new Set(selected));
}
