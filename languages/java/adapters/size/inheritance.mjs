export function inheritanceDepths(report) {
  const byName = new Map(
    report.classes.map((entry) => [fullName(report.files[entry.file], entry), entry]),
  );
  return new Map(
    report.classes.map((entry) => [
      entry,
      depthOf(entry, (child) => resolve(report, byName, child)),
    ]),
  );
}

function depthOf(entry, parentOf) {
  const chain = [entry];
  for (const current of chain) {
    const parent = current.extends === undefined ? undefined : parentOf(current);
    if (parent !== undefined && !chain.includes(parent)) {
      chain.push(parent);
    }
  }
  return chain.filter((link) => link.extends !== undefined).length;
}

function fullName(file, entry) {
  return file.package === '' ? entry.name : `${file.package}.${entry.name}`;
}

function resolve(report, byName, entry) {
  const file = report.files[entry.file];
  const written = entry.extends;
  const [first, ...rest] = written.split('.');
  const suffix = rest.length === 0 ? '' : `.${rest.join('.')}`;
  const candidates = [
    ...enclosing(entry.name).map((owner) => fullName(file, { name: `${owner}.${written}` })),
    ...file.imports.filter((name) => name.endsWith(`.${first}`)).map((name) => `${name}${suffix}`),
    fullName(file, { name: written }),
    ...file.imports
      .filter((name) => name.endsWith('.*'))
      .map((name) => `${name.slice(0, -1)}${written}`),
    written,
  ];
  return candidates.map((name) => byName.get(name)).find((found) => found !== undefined);
}

function enclosing(name) {
  const parts = name.split('.');
  return parts.map((_, index) => parts.slice(0, parts.length - index).join('.'));
}
