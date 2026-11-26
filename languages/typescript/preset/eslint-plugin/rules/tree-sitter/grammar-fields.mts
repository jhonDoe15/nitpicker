import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, fieldsOf } from '../../../../../../shared/values/readers.mts';
import { parseJsonText, readFileText } from '../../fixes/support/project/read-file.mts';

export type GrammarFields = {
  readonly all: ReadonlySet<string>;
  readonly byType: ReadonlyMap<string, ReadonlySet<string>>;
};

type Listing =
  { readonly kind: 'entries'; readonly names: string[] } | { readonly kind: 'unreadable' };

const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const GRAMMAR_PACKAGE = /(?:^|\/)tree-sitter-[\w-]+$/u;

function addAll(target: Set<string>, values: Iterable<string>): void {
  for (const value of values) {
    target.add(value);
  }
}

function knownFields(byType: Map<string, Set<string>>, type: string): Set<string> {
  const known = byType.get(type) ?? new Set<string>();
  byType.set(type, known);
  return known;
}

function parsedFile(file: string): unknown {
  const text = readFileText(file);
  if (text.kind === 'unreadable') {
    return undefined;
  }
  const parsed = parseJsonText(text.text);
  return parsed.kind === 'json' ? parsed.value : undefined;
}

function fieldNames(entry: unknown): string[] {
  return Object.keys(fieldsOf(fieldOf(entry, 'fields')));
}

function parseNodeTypes(file: string): GrammarFields | undefined {
  const entries = parsedFile(file);
  if (!Array.isArray(entries)) {
    return undefined;
  }
  const list: readonly unknown[] = entries;
  const all = new Set<string>();
  const byType = new Map<string, Set<string>>();
  for (const entry of list) {
    const fields = fieldNames(entry);
    addAll(all, fields);
    const type = fieldOf(entry, 'type');
    if (typeof type === 'string') {
      addAll(knownFields(byType, type), fields);
    }
  }
  return { all, byType };
}

function merge(parts: readonly GrammarFields[]): GrammarFields | undefined {
  if (parts.length === 0) {
    return undefined;
  }
  const all = new Set<string>();
  const byType = new Map<string, Set<string>>();
  for (const part of parts) {
    addAll(all, part.all);
    for (const [type, fields] of part.byType) {
      addAll(knownFields(byType, type), fields);
    }
  }
  return { all, byType };
}

function listDirectory(directory: string): Listing {
  try {
    const names = readdirSync(directory, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'src',
      )
      .map((entry) => entry.name);
    return { kind: 'entries', names };
  } catch {
    return { kind: 'unreadable' };
  }
}

function nodeTypeFiles(packageDirectory: string): string[] {
  const listing = listDirectory(packageDirectory);
  if (listing.kind === 'unreadable') {
    return [];
  }
  const candidates = [
    path.join(packageDirectory, 'src', 'node-types.json'),
    ...listing.names.map((name) => path.join(packageDirectory, name, 'src', 'node-types.json')),
  ];
  return candidates.filter((file) => existsSync(file));
}

function loadFields(packageDirectory: string): GrammarFields | undefined {
  const parsed = nodeTypeFiles(packageDirectory).flatMap((file) => {
    const fields = parseNodeTypes(file);
    return fields === undefined ? [] : [fields];
  });
  return merge(parsed);
}

export function directoriesUp(start: string): string[] {
  const chain = [start];
  for (const current of chain) {
    const parent = path.dirname(current);
    if (parent !== current) {
      chain.push(parent);
    }
  }
  return chain;
}

export function grammarFieldsOf(directory: string, packageName: string): GrammarFields | undefined {
  for (const base of directoriesUp(directory)) {
    const fields = loadFields(path.join(base, 'node_modules', packageName));
    if (fields !== undefined) {
      return fields;
    }
  }
  return undefined;
}

function packagesOfManifest(file: string): string[] | undefined {
  const manifest = parsedFile(file);
  if (manifest === undefined) {
    return [];
  }
  const names = DEPENDENCY_SECTIONS.flatMap((key) => Object.keys(fieldsOf(fieldOf(manifest, key))));
  const grammars = names.filter((name) => GRAMMAR_PACKAGE.test(name));
  return grammars.length > 0 ? grammars : undefined;
}

export function projectGrammarPackages(directory: string): string[] {
  for (const base of directoriesUp(directory)) {
    const file = path.join(base, 'package.json');
    const grammars = existsSync(file) ? packagesOfManifest(file) : undefined;
    if (grammars !== undefined) {
      return grammars;
    }
  }
  return [];
}
