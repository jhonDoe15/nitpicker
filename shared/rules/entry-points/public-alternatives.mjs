import { MESSAGES, RULE_IDS, messageFields } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';

const ANY_NAME = '*';

function folderOf(file) {
  return file.slice(0, file.lastIndexOf('/') + 1);
}

function exportedNames(definitions) {
  const names = new Map();
  for (const { file, name, exported, exportNames } of definitions) {
    const listed = exportNames ?? (exported === false ? [] : [name]);
    names.set(file, [...(names.get(file) ?? []), ...listed]);
  }
  return names;
}

function reexportedNames({ to, names }, exported) {
  return names.flatMap(({ name, alias }) => {
    if (name !== ANY_NAME) {
      return [{ name, publicName: alias ?? name }];
    }
    return alias === undefined
      ? (exported.get(to) ?? []).map((each) => ({ name: each, publicName: each }))
      : [];
  });
}

function reexportIndex(imports, { definitions, isProduction }) {
  const exported = exportedNames(definitions);
  const index = new Map();
  for (const record of imports.filter(({ reexport, from }) => reexport && isProduction(from))) {
    for (const { name, publicName } of reexportedNames(record, exported)) {
      const key = `${record.to}\0${name}`;
      index.set(key, [...(index.get(key) ?? []), { entry: record.from, name: publicName }]);
    }
  }
  return index;
}

function entriesOf(index, start) {
  const seen = new Set();
  const pending = [start];
  const found = [];
  for (const step of pending) {
    const key = `${step.file}\0${step.name}`;
    const next = seen.has(key) ? [] : (index.get(key) ?? []);
    seen.add(key);
    found.push(...next);
    pending.push(...next.map(({ entry, name }) => ({ file: entry, name })));
  }
  return found;
}

function closestEntry(entries, { from, to }) {
  return entries
    .map(({ entry }) => ({ entry, folder: folderOf(entry) }))
    .filter(
      ({ entry, folder }) =>
        folder !== '' && entry !== to && to.startsWith(folder) && !from.startsWith(folder),
    )
    .toSorted((left, right) => left.folder.length - right.folder.length)[0]?.entry;
}

function bypassesOf(record, { index, isProduction }) {
  if (record.conditional === true || !isProduction(record.from) || !isProduction(record.to)) {
    return [];
  }
  const byEntry = new Map();
  for (const { name } of record.names.filter(({ name: each }) => each !== ANY_NAME)) {
    const entry = closestEntry(entriesOf(index, { file: record.to, name }), record);
    if (entry !== undefined) {
      byEntry.set(entry, [...(byEntry.get(entry) ?? []), name]);
    }
  }
  return [...byEntry].map(([entry, names]) => ({
    source: record.from,
    target: record.to,
    entry,
    names: [...new Set(names)].toSorted((left, right) => left.localeCompare(right)),
  }));
}

export function publicAlternativeBypasses({ modules, definitions = [], imports }) {
  const production = new Set(modules.filter(({ role }) => role !== 'test').map(({ file }) => file));
  function isProduction(file) {
    return production.has(file);
  }
  const context = { index: reexportIndex(imports, { definitions, isProduction }), isProduction };
  return imports
    .flatMap((record) => bypassesOf(record, context))
    .toSorted(
      (left, right) =>
        left.source.localeCompare(right.source) || left.target.localeCompare(right.target),
    );
}

export function publicAlternativeFindings(bypasses, { analyzerName, isExcepted }) {
  const rule = RULE_IDS.publicAlternativeBypass;
  return bypasses
    .filter(({ source }) => !isExcepted(rule, source))
    .map((bypass) => ({
      tool: analyzerName,
      rule,
      path: bypass.source,
      identity: `target:${bypass.target}`,
      ...messageFields(MESSAGES.publicAlternativeBypass, {
        names: bypass.names.join(', '),
        target: bypass.target,
        entry: bypass.entry,
        exception: exceptionText(rule, bypass.source),
      }),
      classification: 'enforceable',
    }));
}
