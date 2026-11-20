import { agreedPairs } from '../qualified-names.mts';
import { declaredPackage, JVM_SOURCE } from './declared-package.mts';
import type { DeclaredMoves } from './move-types.mts';

const KOTLIN_FACADE = 'Kt';

type NamePair = [string, string];
type Texts = {
  readonly baseTexts: ReadonlyMap<string, string>;
  readonly headTexts: ReadonlyMap<string, string>;
};
type PackagePair = { readonly base: string; readonly head: string };
type ReadableFile = {
  readonly oldPath: string;
  readonly packages: PackagePair;
  readonly named: NamePair[];
};

function stemOf(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf('/') + 1).replace(JVM_SOURCE, '');
}

function qualified(packageName: string, stem: string): string {
  return packageName === '' ? stem : `${packageName}.${stem}`;
}

function sameLanguage(oldPath: string, newPath: string): boolean {
  return JVM_SOURCE.exec(oldPath)?.[1] === JVM_SOURCE.exec(newPath)?.[1];
}

function namesOf(oldPath: string, newPath: string, packages: PackagePair): NamePair[] {
  const from = qualified(packages.base, stemOf(oldPath));
  const to = qualified(packages.head, stemOf(newPath));
  const facade: NamePair[] = oldPath.endsWith('.kt')
    ? [[from + KOTLIN_FACADE, to + KOTLIN_FACADE]]
    : [];
  const names: NamePair[] = [[from, to], ...facade];
  return names.filter(([left, right]) => left !== right);
}

function readable(
  [oldPath, newPath]: readonly [string, string],
  { baseTexts, headTexts }: Texts,
): ReadableFile[] {
  const base = declaredPackage(baseTexts.get(oldPath));
  const head = declaredPackage(headTexts.get(newPath));
  if (!(JVM_SOURCE.test(oldPath) && sameLanguage(oldPath, newPath))) {
    return [];
  }
  return base !== undefined && head !== undefined
    ? [{ oldPath, packages: { base, head }, named: namesOf(oldPath, newPath, { base, head }) }]
    : [];
}

function ownBareName({ oldPath, named }: ReadableFile): [string, NamePair][] {
  const [own] = named;
  return own !== undefined && !own[0].includes('.') ? [[oldPath, own]] : [];
}

function changedPackage({ oldPath, packages }: ReadableFile): [string, Map<string, string>][] {
  const moved = packages.base !== '' && packages.head !== '' && packages.base !== packages.head;
  return moved ? [[oldPath, new Map([[packages.base, packages.head]])]] : [];
}

export function declaredMoves({
  renames,
  baseTexts,
  headTexts,
}: Texts & { readonly renames: Iterable<readonly [string, string]> }): DeclaredMoves {
  const files = [...renames].flatMap((rename) => readable(rename, { baseTexts, headTexts }));
  const pairs = agreedPairs(files.flatMap(({ named }) => named));
  return {
    names: new Map([...pairs].filter(([from]) => from.includes('.'))),
    bare: new Map(files.flatMap(ownBareName)),
    filePackages: new Map(files.flatMap(changedPackage)),
    covered: new Set(files.map(({ oldPath }) => oldPath)),
    folders: new Map(),
    packageDirs: new Set(),
  };
}
