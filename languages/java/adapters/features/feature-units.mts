import {
  featureRoleContract as featureRoleContractUntyped,
  PUBLIC_FACES,
} from '../../../../shared/rules/features/feature-roles.mjs';
import { byText as byTextUntyped } from '../../../../shared/text-order/by-text.mjs';
import type { ClassEntry } from '../domain/domain-types.mts';
import type { FeatureRole } from '../metrics/java-coupling-types.mts';
import type { FeatureLayout } from './feature-types.mts';

type Folders = Map<string, [ClassEntry, ...ClassEntry[]]>;

const byText: (left: string, right: string) => number = byTextUntyped;
const featureRoleContract: (layout: unknown, face: unknown) => (file: string) => FeatureRole =
  featureRoleContractUntyped;

function featurePackage(packageName: string, folder: string): string | undefined {
  const parts = packageName.split('.');
  const length = parts
    .map((_, index) => parts.length - index)
    .find((count) => folder.endsWith(`/${parts.slice(0, count).join('/')}`));
  return length === undefined ? undefined : parts.slice(0, length).join('.');
}

function insideRoots(packageName: string, roots: readonly string[]): boolean {
  return roots.some((root) => packageName === root || packageName.startsWith(`${root}.`));
}

function featureFolders(layout: FeatureLayout, classes: readonly ClassEntry[]): Folders {
  const roleOf = featureRoleContract(layout, PUBLIC_FACES.jvm);
  const folders: Folders = new Map();
  for (const entry of classes) {
    const { kind, directory } = roleOf(entry.file);
    if (kind === 'feature') {
      const members = folders.get(directory);
      folders.set(directory, members === undefined ? [entry] : [...members, entry]);
    }
  }
  return folders;
}

function aliasesOf(folders: Folders): Record<string, string> {
  const byPackage = new Map<string, string[]>();
  for (const [folder, [{ qualifier, packageName }]] of folders) {
    const name = featurePackage(packageName, folder);
    const key = name === undefined ? folder : `${qualifier}\0${name}`;
    byPackage.set(key, [...(byPackage.get(key) ?? []), folder]);
  }
  return Object.fromEntries(
    [...byPackage.values()].flatMap((group) => {
      const first = group.reduce((best, folder) => (byText(folder, best) < 0 ? folder : best));
      return group
        .filter((folder) => folder !== first)
        .map((folder): [string, string] => [folder, first]);
    }),
  );
}

export function featureUnits(
  layout: FeatureLayout,
  { classes, roots }: { classes: readonly ClassEntry[]; roots?: readonly string[] },
): FeatureLayout & { aliases: Record<string, string> } {
  const folders = featureFolders(layout, classes);
  const outside =
    roots === undefined
      ? []
      : [...folders]
          .filter(([, members]) =>
            members.every(({ packageName }) => !insideRoots(packageName, roots)),
          )
          .map(([folder]) => folder);
  const kept = new Map([...folders].filter(([folder]) => !outside.includes(folder)));
  return {
    ...layout,
    ...(outside.length === 0 ? {} : { notFeatureFolders: outside.toSorted(byText) }),
    aliases: aliasesOf(kept),
  };
}
