import { existsSync } from 'node:fs';
import path from 'node:path';
import { importRoots } from '../../execution/python-project.mts';
import {
  fieldOf,
  fieldsOf,
  listOf,
  textsOf,
  type Fields,
} from '../../../../../shared/values/readers.mts';
import type { ToolContext } from '../typed/tool-types.mts';
import { requireProjectConfig, toolLayers, unique } from '../project-tool-layers.mts';
import { environmentOf, readProjectPyright } from './pyright-project-config.mts';

export const PYRIGHT_TOOL = 'pyright';
const PYRIGHT_DEFAULT_EXCLUDE = ['**/node_modules', '**/__pycache__', '**/.*'];
const LOOKED =
  'a pyright config (pyrightconfig.json, or pyproject.toml with a [tool.pyright] or [tool.basedpyright] table)';
type PyrightContext = ToolContext & {
  readonly reportRoot: string;
  readonly project: { readonly sourceRoots: readonly string[] };
  readonly exclude: readonly string[];
};
const EXTRA_PATHS = 'extraPaths';
const STUBS_DIRECTORY = 'typings';

function relativeToReport(reportRoot: string, entries: readonly string[]): string[] {
  return entries.map((entry) => path.relative(reportRoot, entry));
}

function nitpickerConfig({ projectRoot, reportRoot, project, exclude }: PyrightContext): Fields {
  return {
    typeCheckingMode: 'strict',
    reportDeprecated: 'error',
    enableTypeIgnoreComments: false,
    ignore: [],
    executionEnvironments: [],
    exclude: [
      ...PYRIGHT_DEFAULT_EXCLUDE,
      ...exclude.map((glob) => path.relative(reportRoot, path.resolve(projectRoot, glob))),
    ],
    include: project.sourceRoots.map((root) =>
      path.relative(reportRoot, path.resolve(projectRoot, root)),
    ),
    extraPaths: importRoots(projectRoot, project.sourceRoots),
  };
}

function projectKeys(context: ToolContext, checker: string): Fields {
  const { optedIn, nitpickerFirst, configRoot } = toolLayers(context, PYRIGHT_TOOL);
  const found = readProjectPyright(configRoot, checker, {
    upward: optedIn,
    projectRoot: context.projectRoot,
  });
  if (!optedIn) {
    return found?.config === undefined ? {} : environmentOf(found.config);
  }
  const { config = {} } = requireProjectConfig(found, {
    tool: PYRIGHT_TOOL,
    looked: LOOKED,
    configRoot,
  });
  return nitpickerFirst ? environmentOf(config) : config;
}

function layered(base: Fields, keys: Fields, { reportRoot }: { reportRoot: string }): Fields {
  const { extraPaths, exclude, include, executionEnvironments, ...rest } = keys;
  const baseExtraPaths = textsOf(base[EXTRA_PATHS]);
  return {
    ...base,
    ...rest,
    extraPaths: unique([...textsOf(extraPaths), ...baseExtraPaths]),
    exclude: unique([
      ...textsOf(base['exclude']),
      ...relativeToReport(reportRoot, textsOf(exclude)),
    ]),
    include:
      include === undefined ? base['include'] : relativeToReport(reportRoot, textsOf(include)),
    executionEnvironments: listOf(executionEnvironments).map((environment) =>
      fieldOf(environment, EXTRA_PATHS) === undefined
        ? environment
        : {
            ...fieldsOf(environment),
            extraPaths: unique([...textsOf(fieldOf(environment, EXTRA_PATHS)), ...baseExtraPaths]),
          },
    ),
  };
}

export function pyrightConfig(context: PyrightContext, checker: string = 'pyright'): Fields {
  const keys = projectKeys(context, checker);
  const stubs = path.join(context.projectRoot, STUBS_DIRECTORY);
  const withStubs =
    keys['stubPath'] === undefined && existsSync(stubs) ? { ...keys, stubPath: stubs } : keys;
  return layered(nitpickerConfig(context), withStubs, context);
}
