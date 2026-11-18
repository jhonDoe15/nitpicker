import { existsSync, readdirSync, type Dirent } from 'node:fs';
import path from 'node:path';
import { importRoots } from '../execution/python-project.mts';
import { textOf, textsOf } from '../../../../shared/values/readers.mts';
import { toolLayers } from './project-tool-layers.mts';
import type { ToolContext, ToolLayers } from './typed/tool-types.mts';

export const MYPY_TOOL = 'mypy';
export const MYPY_LOOKED =
  'a mypy config (mypy.ini, .mypy.ini, pyproject.toml with a [tool.mypy] table, or setup.cfg with a [mypy] section)';
type MypyModel = { readonly options?: Readonly<Record<string, unknown>> | undefined };
const ANY_MODULE = '*';

export function mypyLayers(context: ToolContext): ToolLayers {
  return toolLayers(context, MYPY_TOOL);
}

const MODULE_SUFFIX = /\.pyi?$/u;
const STUBS_SUFFIX = /-stubs$/u;
const CONFIG_DIRECTORY_VARIABLE = /\$\{?MYPY_CONFIG_FILE_DIR\}?/gu;

function moduleName(entry: Dirent): string | undefined {
  if (entry.isDirectory()) {
    return entry.name.startsWith('.') ? undefined : entry.name.replace(STUBS_SUFFIX, '');
  }
  return MODULE_SUFFIX.test(entry.name) ? entry.name.replace(MODULE_SUFFIX, '') : undefined;
}

function ownModuleNames(roots: readonly string[]): Set<string> {
  return new Set(
    roots
      .filter((root) => existsSync(root))
      .flatMap((root) => readdirSync(root, { withFileTypes: true }))
      .map(moduleName)
      .filter((name) => name !== undefined),
  );
}

export function isOwnModulePattern(pattern: string, own: ReadonlySet<string>): boolean {
  const first = pattern.split('.')[0];
  return first === ANY_MODULE || (first !== undefined && own.has(first));
}

function mypyPathRoots(projectRoot: string, mypyPath: unknown): string[] {
  const entries = Array.isArray(mypyPath)
    ? textsOf(mypyPath)
    : (mypyPath === undefined ? '' : textOf(mypyPath)).split(/[:,]/u);
  return entries
    .map((entry) => entry.trim().replace(CONFIG_DIRECTORY_VARIABLE, projectRoot))
    .filter((entry) => entry !== '')
    .map((entry) => path.resolve(projectRoot, entry));
}

export function mypyOwnModules(
  { projectRoot, project }: { projectRoot: string; project: { sourceRoots: readonly string[] } },
  model?: MypyModel,
): Set<string> {
  const root = path.resolve(projectRoot);
  return ownModuleNames([
    ...importRoots(root, project.sourceRoots),
    ...mypyPathRoots(root, model?.options?.['mypy_path']),
  ]);
}
