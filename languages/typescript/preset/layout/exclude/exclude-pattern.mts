import {
  escapeRegExp as untypedEscapeRegExp,
  globToRegExpSource,
} from '../../../../../shared/paths/glob.mts';

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
const GLOB_SYNTAX = /[*?{}[\]\\]/u;
const FOLDER_GLOB = /^(?<folder>[^*?{}[\]\\]+)\/\*\*$/u;
const NAMED_FOLDER_GLOB = /^\*\*\/(?<name>[^*?{}[\]\\/]+)\/\*\*$/u;

function folderOf(glob: string): string | undefined {
  const folder = FOLDER_GLOB.exec(glob)?.groups?.['folder'];
  return folder === undefined || GLOB_SYNTAX.test(folder) ? undefined : folder;
}

function namedFolderOf(glob: string): string | undefined {
  return NAMED_FOLDER_GLOB.exec(glob)?.groups?.['name'];
}

export function excludePatternOf(globs: readonly string[]): string | undefined {
  const folders: string[] = [];
  const named: string[] = [];
  const others: string[] = [];
  for (const glob of globs) {
    const folder = folderOf(glob);
    const name = namedFolderOf(glob);
    if (folder !== undefined) folders.push(escapeRegExp(folder));
    else if (name !== undefined) named.push(escapeRegExp(name));
    else others.push(globToRegExpSource(glob));
  }
  const parts = [
    ...(folders.length === 0 ? [] : [`^(?:${folders.join('|')})/`]),
    ...(named.length === 0 ? [] : [`(?:^|/)(?:${named.join('|')})/`]),
    ...others,
  ];
  return parts.length === 0 ? undefined : parts.join('|');
}
