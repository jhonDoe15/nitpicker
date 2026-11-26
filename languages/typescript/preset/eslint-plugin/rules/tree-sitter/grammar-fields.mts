import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type GrammarFields = {
  readonly all: ReadonlySet<string>;
  readonly byType: ReadonlyMap<string, ReadonlySet<string>>;
};

const cache = new Map<string, GrammarFields | undefined>();

function parseNodeTypes(file: string): GrammarFields | undefined {
  try {
    const entries: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(entries)) {
      return undefined;
    }
    const all = new Set<string>();
    const byType = new Map<string, Set<string>>();
    for (const entry of entries as { type?: unknown; fields?: unknown }[]) {
      const fields =
        typeof entry.fields === 'object' && entry.fields !== null ? Object.keys(entry.fields) : [];
      for (const field of fields) {
        all.add(field);
      }
      if (typeof entry.type === 'string') {
        const known = byType.get(entry.type) ?? new Set<string>();
        fields.forEach((field) => known.add(field));
        byType.set(entry.type, known);
      }
    }
    return { all, byType };
  } catch {
    return undefined;
  }
}

function merge(parts: readonly GrammarFields[]): GrammarFields | undefined {
  if (parts.length === 0) {
    return undefined;
  }
  const all = new Set<string>();
  const byType = new Map<string, Set<string>>();
  for (const part of parts) {
    part.all.forEach((field) => all.add(field));
    for (const [type, fields] of part.byType) {
      const known = byType.get(type) ?? new Set<string>();
      fields.forEach((field) => known.add(field));
      byType.set(type, known);
    }
  }
  return { all, byType };
}

function nodeTypeFiles(packageDirectory: string): string[] {
  const candidates = [path.join(packageDirectory, 'src', 'node-types.json')];
  try {
    for (const entry of readdirSync(packageDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'src') {
        candidates.push(path.join(packageDirectory, entry.name, 'src', 'node-types.json'));
      }
    }
  } catch {
    return [];
  }
  return candidates.filter((file) => existsSync(file));
}

function loadFields(packageDirectory: string): GrammarFields | undefined {
  if (!cache.has(packageDirectory)) {
    const parsed = nodeTypeFiles(packageDirectory).flatMap((file) => {
      const fields = parseNodeTypes(file);
      return fields === undefined ? [] : [fields];
    });
    cache.set(packageDirectory, merge(parsed));
  }
  return cache.get(packageDirectory);
}

export function directoriesUp(start: string): string[] {
  const result: string[] = [];
  for (let current = start; ; current = path.dirname(current)) {
    result.push(current);
    if (path.dirname(current) === current) {
      return result;
    }
  }
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

const packagesCache = new Map<string, string[]>();

function packagesOfManifest(file: string): string[] | undefined {
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const names = ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((key) => {
      const section = manifest[key];
      return typeof section === 'object' && section !== null ? Object.keys(section) : [];
    });
    const grammars = names.filter((name) => /(?:^|\/)tree-sitter-[\w-]+$/u.test(name));
    return grammars.length > 0 ? grammars : undefined;
  } catch {
    return [];
  }
}

function findProjectGrammarPackages(directory: string): string[] {
  for (const base of directoriesUp(directory)) {
    const file = path.join(base, 'package.json');
    if (!existsSync(file)) {
      continue;
    }
    const grammars = packagesOfManifest(file);
    if (grammars !== undefined) {
      return grammars;
    }
  }
  return [];
}

export function projectGrammarPackages(directory: string): string[] {
  const known = packagesCache.get(directory);
  if (known !== undefined) {
    return known;
  }
  const found = findProjectGrammarPackages(directory);
  packagesCache.set(directory, found);
  return found;
}
