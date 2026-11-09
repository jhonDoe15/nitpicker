import { MESSAGES, RULE_IDS, messageFields } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';

const ANY_NAME = '*';

export function folderOf(file) {
  return file.slice(0, file.lastIndexOf('/') + 1);
}

function publicNamesOf(record, entry) {
  const listed = new Set(entry.publicNames);
  return record.names
    .filter(({ name, alias }) => name !== ANY_NAME && listed.has(alias ?? name))
    .map(({ name, alias }) => ({ name, publicName: alias ?? name }));
}

function reexportedNames(record, modules) {
  const entry = modules.get(record.from);
  return record.reexport === true &&
    entry?.role === 'production' &&
    Array.isArray(entry.publicNames)
    ? publicNamesOf(record, entry).map((listed) => ({ ...listed, record }))
    : [];
}

function reexportIndex(imports, modules) {
  const index = new Map();
  const reexported = imports.flatMap((record) => reexportedNames(record, modules));
  for (const { name, publicName, record } of reexported) {
    const key = `${record.to}\0${name}`;
    index.set(key, [...(index.get(key) ?? []), { entry: record.from, name: publicName }]);
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

function outermostEntry(entries, { from, to }) {
  return entries
    .map((entry) => ({ ...entry, folder: folderOf(entry.entry) }))
    .filter(
      ({ entry, folder }) =>
        folder !== '' && entry !== to && to.startsWith(folder) && !from.startsWith(folder),
    )
    .toSorted((left, right) => left.folder.length - right.folder.length)[0];
}

function isJudged(record, modules) {
  const importer = modules.get(record.from);
  return (
    importer?.role === 'production' &&
    modules.get(record.to)?.role === 'production' &&
    importer.entry !== true &&
    importer.compositionRoot !== true &&
    ![record.reexport, record.conditional, record.typeOnly, record.local].includes(true)
  );
}

function bypassesOf(record, { index, modules }) {
  if (!isJudged(record, modules)) {
    return [];
  }
  const byEntry = new Map();
  for (const { name } of record.names.filter(({ name: each }) => each !== ANY_NAME)) {
    const found = outermostEntry(entriesOf(index, { file: record.to, name }), record);
    if (found !== undefined) {
      byEntry.set(found.entry, [...(byEntry.get(found.entry) ?? []), [name, found.name]]);
    }
  }
  return [...byEntry].map(([entry, pairs]) => ({
    source: record.from,
    target: record.to,
    entry,
    entryName: modules.get(entry).entryName ?? entry,
    names: unique(pairs.map(([name]) => name)),
    publicNames: unique(pairs.map(([, publicName]) => publicName)),
  }));
}

function unique(names) {
  return [...new Set(names)].toSorted((left, right) => left.localeCompare(right));
}

export function publicAlternativeBypasses({ modules, imports }) {
  const context = {
    index: reexportIndex(imports, new Map(modules.map((module) => [module.file, module]))),
    modules: new Map(modules.map((module) => [module.file, module])),
  };
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
        entry: bypass.entryName,
        publicNames: bypass.publicNames.join(', '),
        exception: exceptionText(rule, bypass.source),
      }),
      classification: 'enforceable',
    }));
}
