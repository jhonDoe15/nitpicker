import { featureLayout, featureRoles } from '../../../../shared/rules/features/feature-roles.mjs';

function featurePackage(packageName, folder) {
  const parts = packageName.split('.');
  const length = parts
    .map((_, index) => parts.length - index)
    .find((count) => folder.endsWith(`/${parts.slice(0, count).join('/')}`));
  return length === undefined ? undefined : parts.slice(0, length).join('.');
}

function insideRoots(packageName, roots) {
  return roots.some((root) => packageName === root || packageName.startsWith(`${root}.`));
}

function featureFolders(layout, classes) {
  const roleOf = featureRoles(featureLayout(layout));
  const folders = new Map();
  for (const entry of classes) {
    const { kind, directory } = roleOf(entry.file);
    if (kind === 'feature') {
      folders.set(directory, [...(folders.get(directory) ?? []), entry]);
    }
  }
  return folders;
}

function aliasesOf(folders) {
  const byPackage = new Map();
  for (const [folder, [{ qualifier, packageName }]] of folders) {
    const name = featurePackage(packageName, folder);
    const key = name === undefined ? folder : `${qualifier}\0${name}`;
    byPackage.set(key, [...(byPackage.get(key) ?? []), folder]);
  }
  return Object.fromEntries(
    [...byPackage.values()].flatMap((group) => {
      const [first] = group.toSorted();
      return group.filter((folder) => folder !== first).map((folder) => [folder, first]);
    }),
  );
}

export function featureUnits(layout, { classes, roots }) {
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
    ...(outside.length === 0 ? {} : { notFeatureFolders: outside.sort() }),
    aliases: aliasesOf(kept),
  };
}
