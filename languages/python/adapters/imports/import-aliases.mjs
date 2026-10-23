function importedBase(entry, importer) {
  if (entry.name === undefined) {
    return entry.module;
  }
  if ((entry.level ?? 0) === 0) {
    return `${entry.module}.${entry.name}`;
  }
  const owner = importer.isPackage
    ? importer.module
    : importer.module.split('.').slice(0, -1).join('.');
  const parts = owner === '' ? [] : owner.split('.');
  const kept = parts.slice(0, Math.max(0, parts.length - (entry.level - 1)));
  return [...kept, ...(entry.module ?? '').split('.'), entry.name].filter(Boolean).join('.');
}

function aliasOf(entry, importer) {
  if (entry.name === undefined) {
    const top = entry.module.split('.')[0];
    return typeof entry.asname === 'string' ? [entry.asname, entry.module] : [top, top];
  }
  return [entry.asname ?? entry.name, importedBase(entry, importer)];
}

export function aliases(imports, importer) {
  return new Map(imports.map((entry) => aliasOf(entry, importer)));
}
