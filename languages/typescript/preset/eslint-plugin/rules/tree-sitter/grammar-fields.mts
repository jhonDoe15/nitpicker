import { existsSync, readFileSync } from 'node:fs';
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

function loadFields(file: string): GrammarFields | undefined {
  if (!cache.has(file)) {
    cache.set(file, existsSync(file) ? parseNodeTypes(file) : undefined);
  }
  return cache.get(file);
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
    const fields = loadFields(
      path.join(base, 'node_modules', packageName, 'src', 'node-types.json'),
    );
    if (fields !== undefined) {
      return fields;
    }
  }
  return undefined;
}

export function projectGrammarPackages(directory: string): string[] {
  for (const base of directoriesUp(directory)) {
    const file = path.join(base, 'package.json');
    if (!existsSync(file)) {
      continue;
    }
    try {
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      const names = ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((key) => {
        const section = manifest[key];
        return typeof section === 'object' && section !== null ? Object.keys(section) : [];
      });
      const grammars = names.filter((name) => /(?:^|\/)tree-sitter-[\w-]+$/u.test(name));
      if (grammars.length > 0) {
        return grammars;
      }
    } catch {
      return [];
    }
  }
  return [];
}
