import { readFileSync } from 'node:fs';
import path from 'node:path';

const PACKAGE = /^\s*package\s+([\w.]+)/mu;
const IMPORT = /^\s*import\s+(?:static\s+)?([\w.]+?)(\.\*)?(?:\s+as\s+\w+)?\s*;?\s*$/gmu;
const COMMENTS_AND_STRINGS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"/gu;
const JAVA_TYPE =
  /^(?:(?:public|protected|private|abstract|final|sealed|non-sealed|static|strictfp)\s+)*(?:class|interface|enum|record|@interface)\s+(\w+)/gmu;
const KOTLIN_DECLARATION =
  /^(?:(?:public|internal|private|open|abstract|final|sealed|data|enum|annotation|value|inline|fun|inner|expect|actual|const|lateinit|suspend|tailrec|operator|infix|external)\s+)*(?:class|interface|object|typealias|fun|val|var)\s+(?:<[^>\n]*>\s*)?(?:[\w.<>?]+\.)?(\w+)/gmu;
const QUALIFIED = /\b[a-z_]\w*(?:\.\w+)+/gu;
const IDENTIFIER = /\b[A-Za-z_]\w*\b/gu;
const SOURCE_FILE = /\.(?:java|kt)$/u;

function codeOf(text) {
  return text.replaceAll(COMMENTS_AND_STRINGS, ' ');
}

function declaredNames(file, code) {
  const stem = path.posix.basename(file).replace(/\.\w+$/u, '');
  const pattern = file.endsWith('.kt') ? KOTLIN_DECLARATION : JAVA_TYPE;
  return new Set([stem, ...[...code.matchAll(pattern)].map((match) => match[1])]);
}

function describe(file, text) {
  const code = codeOf(text);
  const imports = [...code.matchAll(IMPORT)].map((match) => ({
    name: match[1],
    wildcard: match[2] !== undefined,
  }));
  const body = code.replaceAll(IMPORT, ' ').replace(PACKAGE, ' ');
  return {
    file,
    package: PACKAGE.exec(code)?.[1] ?? '',
    names: declaredNames(file, code),
    imports,
    identifiers: new Set(body.match(IDENTIFIER) ?? []),
    qualified: body.match(QUALIFIED) ?? [],
  };
}

function longestKnown(name, byName) {
  const parts = name.split('.');
  for (let length = parts.length; length > 0; length -= 1) {
    const found = byName.get(parts.slice(0, length).join('.'));
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
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
  const sameOrWildcard = [...packages]
    .flatMap((name) => byPackage.get(name) ?? [])
    .filter((entry) => [...entry.names].some((name) => importer.identifiers.has(name)));
  const named = [...importer.imports.map(({ name }) => name), ...importer.qualified]
    .map((name) => longestKnown(name, byName))
    .filter((entry) => entry !== undefined);
  return [...sameOrWildcard, ...named].filter((entry) => entry !== importer);
}

export function jvmProductionReach(projectRoot, { files, isImporter }) {
  const described = files
    .filter((file) => SOURCE_FILE.test(file))
    .map((file) => describe(file, readFileSync(path.join(projectRoot, file), 'utf8')));
  const index = indexOf(described);
  const entries = new Map(described.map((entry) => [entry.file, entry]));
  const labels = new Map(
    described.filter(({ file }) => isImporter(file)).map(({ file }) => [file, file]),
  );
  const starts = new Set(labels.keys());
  const pending = [...labels.keys()];
  for (const file of pending) {
    for (const target of usedFrom(entries.get(file), index)) {
      if (!labels.has(target.file)) {
        labels.set(target.file, labels.get(file));
        pending.push(target.file);
      }
    }
  }
  return new Map([...labels].filter(([file]) => !starts.has(file)));
}
