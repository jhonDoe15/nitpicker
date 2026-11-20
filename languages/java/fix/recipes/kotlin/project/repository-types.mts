import { escapeRegExp } from '../shared/kotlin-scan.mts';
import { projectLines } from '../../../project/project-lines.mts';

const SOURCES = ['*.kt', '*.java'];
const HEADER_LINES = 4;
const MAX_DEPTH = 4;
const BATCH_BASES = new Set([
  ...['CrudRepository', 'ListCrudRepository', 'JpaRepository', 'MongoRepository'],
  ...['ElasticsearchRepository', 'CassandraRepository', 'Neo4jRepository', 'KeyValueRepository'],
]);
const NESTING = [1, 2, 3, 4, 5, 6];
const GENERICS = /<[^<>]*>/gu;
const CHUNK_BREAK = /^--$/u;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/u;
const LINE_COMMENT = /\/\/.*$|\/\*.*?\*\//gu;

export type RepositoryTypes = { readonly hasBatchCalls: (type: string) => boolean };

function withoutGenerics(text: string): string {
  return NESTING.reduce((current) => current.replace(GENERICS, ''), text);
}

function chunksOf(lines: readonly string[]): string[] {
  const chunks: string[][] = [[]];
  for (const line of lines) {
    if (CHUNK_BREAK.test(line)) {
      chunks.push([]);
    } else if (!COMMENT_LINE.test(line)) {
      chunks.at(-1)?.push(line.replace(LINE_COMMENT, ''));
    }
  }
  return chunks.map((chunk) => chunk.join(' ')).filter((chunk) => chunk.trim() !== '');
}

function supertypesOf(header: string): string[] {
  const heritage = /(?::|\bextends\b|\bimplements\b)(.*)$/u.exec(
    header.replace(/\([^()]*\)/gu, ''),
  );
  return (heritage?.[1] ?? '')
    .split(/,|\bextends\b|\bimplements\b|\bwhere\b|\s+/u)
    .map((name) => name.trim().split('.').at(-1) ?? '')
    .filter((name) => /^[A-Z]\w*$/u.test(name));
}

function supertypesIn(chunk: string, type: string): string[][] {
  const declaration = new RegExp(
    String.raw`^(?:interface|class)\s+${escapeRegExp(type)}(?![\w$])([^{]*)`,
    'u',
  );
  return withoutGenerics(chunk)
    .split(/(?=\b(?:interface|class|object|fun|val|var)\s)/u)
    .flatMap((part) => {
      const match = declaration.exec(part);
      return match === null ? [] : [supertypesOf(match[1] ?? '')];
    });
}

export function repositoryTypes(projectRoot: string | undefined): RepositoryTypes {
  const known = new Map<string, readonly (readonly string[])[] | undefined>();
  function declarationsOf(type: string): readonly (readonly string[])[] | undefined {
    if (!known.has(type)) {
      const lines = projectLines(projectRoot, {
        pattern: String.raw`(interface|class)[[:space:]]+${escapeRegExp(type)}([^[:alnum:]_$]|$)`,
        files: SOURCES,
        after: HEADER_LINES,
      });
      known.set(
        type,
        lines === undefined
          ? undefined
          : chunksOf(lines).flatMap((chunk) => supertypesIn(chunk, type)),
      );
    }
    return known.get(type);
  }
  function reachable(type: string): string[] {
    const pending = [{ type, depth: 0 }];
    const seen = new Set([type]);
    for (const current of pending) {
      const supertypes = (declarationsOf(current.type) ?? []).flat();
      for (const supertype of current.depth < MAX_DEPTH ? supertypes : []) {
        if (!seen.has(supertype)) {
          seen.add(supertype);
          pending.push({ type: supertype, depth: current.depth + 1 });
        }
      }
    }
    return [...seen];
  }
  function batching(type: string, good: ReadonlySet<string>): boolean {
    const declarations = declarationsOf(type);
    if (declarations === undefined || declarations.length === 0) {
      return declarations !== undefined && BATCH_BASES.has(type);
    }
    return declarations.every((supertypes) => supertypes.some((supertype) => good.has(supertype)));
  }
  function hasBatchCalls(type: string): boolean {
    const types = reachable(type);
    const good = types.reduce<ReadonlySet<string>>(
      (found) => new Set(types.filter((candidate) => batching(candidate, found))),
      new Set(),
    );
    return good.has(type);
  }
  return { hasBatchCalls };
}
