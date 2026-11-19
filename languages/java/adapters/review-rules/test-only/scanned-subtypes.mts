import path from 'node:path';
import type { ProjectText } from '../project-texts.mts';

const SCANNERS = [
  String.raw`ServiceLoader\s*\.\s*load(?:Installed)?`,
  'getAssignableClasses',
  'getSubTypesOf',
  'getSubclasses',
  'getSubclassesOf',
  'getClassesImplementing',
  'AssignableTypeFilter',
];
const SCAN_CALL = new RegExp(
  String.raw`\b(?:${SCANNERS.join('|')})\s*\(\s*([\w$.]+)\.class\b`,
  'gu',
);
const KEYWORDS = 'class|interface|object|enum|record';
const KEYWORD = String.raw`(?<![\w$.:])(?:${KEYWORDS})`;
const TYPE_DECLARATION = new RegExp(
  String.raw`${KEYWORD}\s+(?!(?:${KEYWORDS})\b)([\w$]+)((?:(?!${KEYWORD}\s)[^{;])*)`,
  'gu',
);
const TYPE_ARGUMENTS = /<[^<>]*>/gu;
const CONSTRUCTOR_CALL = /\([^()]*\)/gu;
const SUPERTYPE_CLAUSE = /\b(?:extends|implements)\b|:/u;
const CLAUSE_END = /\b(?:permits|where|by)\b/u;
const NAME_SEPARATOR = /[\s,]+|\b(?:extends|implements)\b|:/u;

type Declaration = {
  readonly name: string;
  readonly file: string;
  readonly supertypes: readonly string[];
};

function withoutNesting(text: string, pattern: RegExp): string {
  const forms = [text];
  for (const form of forms) {
    const next = form.replaceAll(pattern, ' ');
    if (next !== form) {
      forms.push(next);
    }
  }
  return forms.at(-1) ?? text;
}

function simpleName(name: string): string {
  return name.split('.').at(-1) ?? name;
}

function supertypesOf(header: string): string[] {
  const clause = withoutNesting(withoutNesting(header, TYPE_ARGUMENTS), CONSTRUCTOR_CALL);
  const start = clause.search(SUPERTYPE_CLAUSE);
  if (start < 0) {
    return [];
  }
  const rest = clause.slice(start);
  const end = rest.search(CLAUSE_END);
  return (end < 0 ? rest : rest.slice(0, end))
    .split(NAME_SEPARATOR)
    .filter((name) => /^[\w$.]+$/u.test(name))
    .map(simpleName);
}

function declarationsIn({ file, code }: { file: string; code: string }): Declaration[] {
  return [...code.matchAll(TYPE_DECLARATION)].map((match) => ({
    name: match[1] ?? '',
    file: path.basename(file, path.extname(file)),
    supertypes: supertypesOf(match[2] ?? ''),
  }));
}

function scannedTypes(codes: readonly string[]): string[] {
  return [
    ...new Set(
      codes.flatMap((code) =>
        [...code.matchAll(SCAN_CALL)].map((match) => simpleName(match[1] ?? '')),
      ),
    ),
  ];
}

export function scannedSubtypes(texts: readonly ProjectText[]): Set<string> {
  const sources = texts.flatMap(({ file, code }) => (code === undefined ? [] : [{ file, code }]));
  const declarations = sources.flatMap(declarationsIn);
  const subtypes = Map.groupBy(
    declarations.flatMap((declaration) =>
      declaration.supertypes.map((supertype) => ({ supertype, declaration })),
    ),
    ({ supertype }) => supertype,
  );
  const found = new Set<string>();
  const pending = scannedTypes(sources.map(({ code }) => code));
  for (const supertype of pending) {
    const fresh = (subtypes.get(supertype) ?? [])
      .map(({ declaration }) => declaration)
      .filter(({ name }) => !found.has(name));
    for (const { name, file } of fresh) {
      found.add(name).add(file);
      pending.push(name);
    }
  }
  return found;
}

export function isScannedSubtype(
  subtypes: ReadonlySet<string>,
  { className }: { readonly className: string },
): boolean {
  return subtypes.has(simpleName(className));
}
