import { mapFolder } from './module-folders.mts';
import type { DeclaredMoves } from './declared/move-types.mts';

const MODULE_SUFFIX = /^([\s\S]*)@(:[\w.-]+(?::[\w.-]+)*)$/u;

type Places = {
  readonly declared: Pick<DeclaredMoves, 'folders'>;
  readonly headPlaces: ReadonlySet<string>;
};

export function headPlacesOf(
  headFindings: readonly { readonly path: string; readonly identity: string }[],
): Set<string> {
  const places = new Set<string>();
  for (const { path: findingPath, identity } of headFindings) {
    places.add(findingPath);
    const project = typeof identity === 'string' ? MODULE_SUFFIX.exec(identity)?.[2] : undefined;
    if (project !== undefined) {
      places.add(project);
    }
  }
  return places;
}

function unambiguous(original: string, mapped: string, places: ReadonlySet<string>): string {
  return mapped !== original && places.has(mapped) && !places.has(original) ? mapped : original;
}

export function movedFolder(
  findingPath: string,
  { declared, headPlaces }: Places,
): string | undefined {
  if (findingPath.includes('.') || declared.folders.size === 0) {
    return undefined;
  }
  const moved = unambiguous(findingPath, mapFolder(findingPath, declared.folders), headPlaces);
  return moved === findingPath ? undefined : moved;
}

export function remapModuleSuffix(identity: string, { declared, headPlaces }: Places): string {
  const parts = typeof identity === 'string' ? MODULE_SUFFIX.exec(identity)?.slice(1) : undefined;
  if (parts === undefined || declared.folders.size === 0) {
    return identity;
  }
  const [rest = '', project = ''] = parts;
  const folder = project.slice(1).replaceAll(':', '/');
  const moved = mapFolder(folder, declared.folders);
  const mapped = `:${moved.replaceAll('/', ':')}`;
  return `${rest}@${unambiguous(project, mapped, headPlaces)}`;
}
