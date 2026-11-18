import path from 'node:path';
import { readInside } from '../../../../shared/conventions/read-inside.mjs';
import { optionalText } from '../../../../shared/values/readers.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';

type Import = {
  readonly name: string;
  readonly wildcard: boolean;
  readonly alias: string | undefined;
};
type Described = {
  readonly file: string;
  readonly package: string;
  readonly names: Set<string>;
  readonly types: Set<string>;
  readonly callables: Set<string>;
  readonly imports: Import[];
  readonly explicit: Set<string | undefined>;
  readonly identifiers: Set<string>;
  readonly bare: Set<string>;
  readonly qualified: string[];
};
type Index = {
  readonly byName: Map<string, Described>;
  readonly byPackage: Map<string, Described[]>;
};
type Queue = { readonly labels: Map<string, string>; readonly pending: string[] };

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

function codeOf(text: string): string {
  return text.replaceAll(COMMENTS_AND_STRINGS, ' ');
}

function declaredNames(
  file: string,
  code: string,
): { types: Set<string>; callables?: Set<string> } {
  const stem = path.posix.basename(file).replace(/\.\w+$/u, '');
  if (!file.endsWith('.kt')) {
    return {
      types: new Set([stem, ...[...code.matchAll(JAVA_TYPE)].map((match) => match[1] ?? '')]),
    };
  }
  const declarations = [...code.matchAll(KOTLIN_DECLARATION)];
  function isCallable([, keyword = '', receiver]: RegExpMatchArray): boolean {
    return CALLABLES.has(keyword) && receiver === undefined;
  }
  return {
    types: new Set([
      stem,
      ...declarations.filter((match) => !isCallable(match)).map((match) => match[3] ?? ''),
    ]),
    callables: new Set(declarations.filter(isCallable).map((match) => match[3] ?? '')),
  };
}

function importedName({ name, alias }: Import): string | undefined {
  return alias ?? name.split('.').at(-1);
}

function describe(file: string, text: string): Described {
  const code = codeOf(text);
  const imports = [...code.matchAll(IMPORT)].map((match) => ({
    name: match[1] ?? '',
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

function longestKnown(name: string, byName: ReadonlyMap<string, Described>): Described | undefined {
  const parts = name.split('.');
  return parts
    .map((_part, dropped) => byName.get(parts.slice(0, parts.length - dropped).join('.')))
    .find((entry) => entry !== undefined);
}

function indexOf(described: readonly Described[]): Index {
  const byName = new Map<string, Described>();
  const byPackage = new Map<string, Described[]>();
  for (const entry of described) {
    byPackage.set(entry.package, [...(byPackage.get(entry.package) ?? []), entry]);
    for (const name of entry.names) {
      const qualified = entry.package === '' ? name : `${entry.package}.${name}`;
      byName.set(qualified, byName.get(qualified) ?? entry);
    }
  }
  return { byName, byPackage };
}

function usedFrom(importer: Described, { byName, byPackage }: Index): Described[] {
  const packages = new Set([
    importer.package,
    ...importer.imports.filter(({ wildcard }) => wildcard).map(({ name }) => name),
  ]);
  function unshadowed(name: string): boolean {
    return !importer.explicit.has(name);
  }
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

function enqueue(target: Described, importerLabel: string, { labels, pending }: Queue): void {
  if (!labels.has(target.file)) {
    labels.set(target.file, importerLabel);
    pending.push(target.file);
  }
}

export function jvmProductionReach(
  projectRoot: string,
  {
    files,
    isImporter,
  }: { readonly files: readonly string[]; readonly isImporter: (file: string) => boolean },
): Map<string, string> {
  const described = files
    .filter((file) => SOURCE_FILE.test(file))
    .map((file) =>
      describe(file, optionalText(callUntyped(readInside, projectRoot, file, 'utf8')) ?? ''),
    );
  const index = indexOf(described);
  const entries = new Map(described.map((entry) => [entry.file, entry]));
  const starts = described.filter(({ file }) => isImporter(file)).map(({ file }) => file);
  const queue: Queue = {
    labels: new Map(starts.map((file) => [file, file])),
    pending: [...starts],
  };
  for (const file of queue.pending) {
    const entry = entries.get(file);
    const label = queue.labels.get(file);
    if (entry === undefined || label === undefined) {
      throw new TypeError(`${file} was queued without being described`);
    }
    for (const target of usedFrom(entry, index)) {
      enqueue(target, label, queue);
    }
  }
  return new Map([...queue.labels].filter(([file]) => !starts.includes(file)));
}
