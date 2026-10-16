import { existsSync } from 'node:fs';
import path from 'node:path';
import { importRoots } from '../../execution/python-project.mjs';
import { requireProjectConfig, toolLayers, unique } from '../project-tool-layers.mjs';
import { environmentOf, readProjectPyright } from './pyright-project-config.mjs';

export const PYRIGHT_TOOL = 'pyright';
const PYRIGHT_DEFAULT_EXCLUDE = ['**/node_modules', '**/__pycache__', '**/.*'];
const LOOKED =
  'a pyright config (pyrightconfig.json, or pyproject.toml with a [tool.pyright] or [tool.basedpyright] table)';
const STUBS_DIRECTORY = 'typings';

function relativeToReport(reportRoot, entries) {
  return entries.map((entry) => path.relative(reportRoot, entry));
}

function nitpickerConfig({ projectRoot, reportRoot, project, exclude }) {
  return {
    typeCheckingMode: 'strict',
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

function projectKeys(context, checker) {
  const { optedIn, nitpickerFirst, configRoot } = toolLayers(context, PYRIGHT_TOOL);
  const found = readProjectPyright(configRoot, checker);
  if (!optedIn) {
    return found === undefined ? {} : environmentOf(found.config);
  }
  const { config } = requireProjectConfig(found, {
    tool: PYRIGHT_TOOL,
    looked: LOOKED,
    configRoot,
  });
  return nitpickerFirst ? environmentOf(config) : config;
}

function layered(base, keys, { reportRoot }) {
  const { extraPaths = [], exclude = [], include, executionEnvironments = [], ...rest } = keys;
  return {
    ...base,
    ...rest,
    extraPaths: unique([...extraPaths, ...base.extraPaths]),
    exclude: unique([...base.exclude, ...relativeToReport(reportRoot, exclude)]),
    include: include === undefined ? base.include : relativeToReport(reportRoot, include),
    executionEnvironments: executionEnvironments.map((environment) =>
      environment.extraPaths === undefined
        ? environment
        : { ...environment, extraPaths: unique([...environment.extraPaths, ...base.extraPaths]) },
    ),
  };
}

export function pyrightConfig(context, checker = 'pyright') {
  const keys = projectKeys(context, checker);
  const stubs = path.join(context.projectRoot, STUBS_DIRECTORY);
  const withStubs =
    keys.stubPath === undefined && existsSync(stubs) ? { ...keys, stubPath: stubs } : keys;
  return layered(nitpickerConfig(context), withStubs, context);
}
