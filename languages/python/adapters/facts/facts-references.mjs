export function named(name, alias) {
  return alias === null || alias === undefined || alias === name ? { name } : { name, alias };
}

const PACKAGE_WILDCARD = '.*';

function exactTarget(dotted, resolver) {
  const parts = dotted.split('.');
  const owners = parts.map((_, index) => {
    const length = parts.length - index;
    return { length, to: resolver.fileOf(resolver.moduleStem(parts.slice(0, length).join('.'))) };
  });
  const owner = owners.find(({ to }) => to !== undefined);
  if (owner === undefined) {
    return [];
  }
  const names = parts.slice(owner.length, owner.length + 1).map((name) => named(name));
  return [{ to: owner.to, names }];
}

function loadedTargets({ name }, fetched, resolver) {
  const names = fetched.map((fetchedName) => named(fetchedName));
  if (name.endsWith(PACKAGE_WILDCARD)) {
    const stem = resolver.moduleStem(name.slice(0, -PACKAGE_WILDCARD.length));
    return stem === undefined ? [] : resolver.filesUnder(stem).map((to) => ({ to, names }));
  }
  const to = resolver.fileOf(resolver.moduleStem(name));
  return to === undefined ? [] : [{ to, names }];
}

function attributeTargets(file, { binding, attributes }, resolver) {
  if (binding.kind === 'module') {
    return exactTarget([binding.module, ...attributes].join('.'), resolver);
  }
  const stem = resolver.baseStem(file, binding);
  const submodule = stem === undefined ? undefined : resolver.fileOf(`${stem}/${binding.name}`);
  return submodule === undefined
    ? []
    : [{ to: submodule, names: attributes.slice(0, 1).map((name) => named(name)) }];
}

export function referenceTargets(file, context) {
  const { scanned, resolver } = context;
  const fetched = scanned[file].fetchedNames ?? [];
  const strings = (scanned[file].references ?? []).map((reference) => [
    reference,
    reference.dynamic
      ? loadedTargets(reference, fetched, resolver)
      : exactTarget(reference.name, resolver),
  ]);
  const attributes = context.referenceOnly.has(file)
    ? (scanned[file].attributeUses ?? []).map((use) => [use, attributeTargets(file, use, resolver)])
    : [];
  return [...strings, ...attributes];
}
