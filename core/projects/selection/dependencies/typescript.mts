import { existsSync } from 'node:fs';
import path from 'node:path';
import { optionalText, textOf } from '../../../../shared/values/readers.mts';
import { parsedTsconfig } from '../../../../languages/typescript/preset/modules/tsconfig-files.mts';
import { textsUnder } from '../scan/texts-under.mts';
import type { DependencyUnit } from '../../project-types.mts';

type PathOptions = {
  readonly baseUrl?: string | undefined;
  readonly pathsBasePath?: unknown;
  readonly paths?: Readonly<Record<string, unknown>> | undefined;
};

const TSCONFIG = 'tsconfig.json';
const PATHS_LABEL = 'tsconfig paths';
const REFERENCES_LABEL = 'tsconfig references';
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/u;
const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', 'coverage', 'out']);

function relativeFolder(directory: string, target: string): string {
  return path.relative(directory, target).split(path.sep).join('/') || '.';
}

function aliasPrefix(alias: string): string {
  return alias.replace(/\*.*$/u, '');
}

function sourceTexts(directory: string): string[] {
  return textsUnder(directory, { skipped: SKIPPED_FOLDERS, accepts: SCRIPT_FILE });
}

function importsAlias(texts: readonly string[], alias: string): boolean {
  const prefix = aliasPrefix(alias);
  return texts.some(
    (text) =>
      text.includes(`'${prefix}`) || text.includes(`"${prefix}`) || text.includes(`\`${prefix}`),
  );
}

function pathTargets(directory: string, options: PathOptions): string[] {
  const base = options.baseUrl ?? optionalText(options.pathsBasePath) ?? directory;
  const texts = sourceTexts(directory);
  return Object.entries(options.paths ?? {})
    .filter(([alias]) => importsAlias(texts, alias))
    .flatMap(([, targets]): unknown[] => (Array.isArray(targets) ? targets : []))
    .map((target) => path.resolve(base, aliasPrefix(textOf(target))));
}

export function typescriptUnit(directory: string): DependencyUnit | undefined {
  const configFile = path.join(directory, TSCONFIG);
  if (!existsSync(configFile)) {
    return undefined;
  }
  const parsed = parsedTsconfig(configFile);
  const viaPaths = pathTargets(directory, parsed.options).map((target) =>
    relativeFolder(directory, target),
  );
  const viaReferences = (parsed.projectReferences ?? []).map(({ path: target }) =>
    relativeFolder(directory, target.endsWith('.json') ? path.dirname(target) : target),
  );
  return {
    names: [],
    needs: [],
    folders: [...viaPaths, ...viaReferences],
    labels: new Map<string, string>([
      ...viaReferences.map((folder): [string, string] => [folder, REFERENCES_LABEL]),
      ...viaPaths.map((folder): [string, string] => [folder, PATHS_LABEL]),
    ]),
  };
}
