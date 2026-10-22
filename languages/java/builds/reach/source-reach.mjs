import path from 'node:path';
import { readInside } from '../../../../shared/conventions/read-inside.mjs';

const PACKAGE = /^\s*package\s+([\w.]+)/mu;
const IMPORT = /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+?)(\.\*)?(?:[ \t;].*)?$/gmu;
const COMMENTS_AND_STRINGS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"/gu;
const JAVA_MODIFIERS = 'public|protected|private|abstract|final|sealed|non-sealed|static|strictfp';
const KOTLIN_MODIFIERS = [
  'public|internal|private|open|abstract|final|sealed|data|enum|annotation|value',
  'inline|fun|inner|expect|actual|const|lateinit|suspend|tailrec|operator|infix|external',
].join('|');
const JAVA_TYPE = new RegExp(
  String.raw`^(?:(?:${JAVA_MODIFIERS})\s+)*(?:class|interface|enum|record|@interface)\s+(\w+)`,
  'gmu',
);
const KOTLIN_DECLARATION = new RegExp(
  String.raw`^(?:(?:${KOTLIN_MODIFIERS})\s+)*(class|interface|object|typealias|fun|val|var)\s+` +
    String.raw`(?:<[^>\n]*>\s*)?([\w.<>?]+\.)?(\w+)`,
  'gmu',
);
const CALLABLES = new Set(['fun', 'val', 'var']);
const ALIAS = /[ \t]as[ \t]+(\w+)/u;
const QUALIFIED = /\b[a-z_]\w*(?:\.\w+)+/gu;
const IDENTIFIER = /\b[A-Za-z_]\w*\b/gu;
const BARE_IDENTIFIER = /(?<!\.\s*)\b[A-Za-z_]\w*\b/gu;
const SOURCE_FILE = /\.(?:java|kt)$/u;

function codeOf(text) {
  return text.replaceAll(COMMENTS_AND_STRINGS, ' ');
}

function declaredNames(file, code) {
  const stem = path.posix.basename(file).replace(/\.\w+$/u, '');
  if (!file.endsWith('.kt')) {
    return { types: new Set([stem, ...[...code.matchAll(JAVA_TYPE)].map((match) => match[1])]) };
  }
  const declarations = [...code.matchAll(KOTLIN_DECLARATION)];
  const isCallable = ([, keyword, receiver]) => CALLABLES.has(keyword) && receiver === undefined;
  return {
    types: new Set([
      stem,
      ...declarations.filter((match) => !isCallable(match)).map((match) => match[3]),
    ]),
    callables: new Set(declarations.filter(isCallable).map((match) => match[3])),
  };
}

function importedName({ name, alias }) {
  return alias ?? name.split('.').at(-1);
}

function describe(file, text) {
  const code = codeOf(text);
  const imports = [...code.matchAll(IMPORT)].map((match) => ({
    name: match[1],
    wildcard: match[2] !== undefined,
    alias: ALIAS.exec(match[0])?.[1],
  }));
  const body = code.replaceAll(IMPORT, ' ').replace(PACKAGE, ' ');
  const declared = declaredNames(file, code);
  return {
    file,
    package: PACKAGE.exec(code)?.[1] ?? '',
    names: new Set([...declared.types, ...(declared.callables ?? [])]),
    types: declared.types,
    callables: declared.callables ?? new Set(),
    imports,
    explicit: new Set(imports.filter(({ wildcard }) => !wildcard).map(importedName)),
    identifiers: new Set(body.match(IDENTIFIER) ?? []),
    bare: new Set(body.match(BARE_IDENTIFIER) ?? []),
    qualified: body.match(QUALIFIED) ?? [],
  };
}

function longestKnown(name, byName) {
  const parts = name.split('.');
  return parts
    .map((_part, dropped) => byName.get(parts.slice(0, parts.length - dropped).join('.')))
    .find((entry) => entry !== undefined);
}

function indexOf(described) {
  const byName = new Map();
  const byPackage = new Map();
  for (const entry of described) {
    byPackage.set(entry.package, [...(byPackage.get(entry.package) ?? []), entry]);
    for (const name of entry.names) {
      const qualified = entry.package === '' ? name : `${entry.package}.${name}`;
      byName.set(qualified, byName.get(qualified) ?? entry);
    }
  }
  return { byName, byPackage };
}

function usedFrom(importer, { byName, byPackage }) {
  const packages = new Set([
    importer.package,
    ...importer.imports.filter(({ wildcard }) => wildcard).map(({ name }) => name),
  ]);
  const unshadowed = (name) => !importer.explicit.has(name);
  const sameOrWildcard = [...packages]
    .flatMap((name) => byPackage.get(name) ?? [])
    .filter(
      (entry) =>
        [...entry.types].some((name) => unshadowed(name) && importer.identifiers.has(name)) ||
        [...entry.callables].some((name) => unshadowed(name) && importer.bare.has(name)),
    );
  const named = [...importer.imports.map(({ name }) => name), ...importer.qualified]
    .map((name) => longestKnown(name, byName))
    .filter((entry) => entry !== undefined);
  return [...sameOrWildcard, ...named].filter((entry) => entry !== importer);
}

function enqueue(target, importerLabel, { labels, pending }) {
  if (!labels.has(target.file)) {
    labels.set(target.file, importerLabel);
    pending.push(target.file);
  }
}

export function jvmProductionReach(projectRoot, { files, isImporter }) {
  const described = files
    .filter((file) => SOURCE_FILE.test(file))
    .map((file) => describe(file, readInside(projectRoot, file, 'utf8') ?? ''));
  const index = indexOf(described);
  const entries = new Map(described.map((entry) => [entry.file, entry]));
  const starts = described.filter(({ file }) => isImporter(file)).map(({ file }) => file);
  const queue = { labels: new Map(starts.map((file) => [file, file])), pending: [...starts] };
  for (const file of queue.pending) {
    for (const target of usedFrom(entries.get(file), index)) {
      enqueue(target, queue.labels.get(file), queue);
    }
  }
  return new Map([...queue.labels].filter(([file]) => !starts.includes(file)));
}
