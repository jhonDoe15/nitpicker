import { lineStarts } from '../../../doc-comments/doc-scopes.mts';
import { escapeRegExp } from '../../../../../../shared/paths/glob.mjs';
import { crossedCollections } from '../../../../../../shared/joins/crossed-collections.mjs';
import { blankComments, blankLiterals } from '../../../review-rules/java-sources.mts';
import type { FetchSite, FetchSource, Joined, RelationOf } from '../fetch-types.mts';
import { graphFetches, jpqlFetches, resolvedFetches } from '../fetch-paths.mts';
import { criteriaFetches } from './criteria-fetches.mts';
import {
  BRACES,
  argumentsAt,
  braceDepths,
  closingOf,
  graphPaths,
  namedGraphPaths,
  stringsIn,
} from '../graph-texts.mts';

const SITES: readonly (readonly [string, RegExp])[] = [
  ['query', /@\s*(?:[\w.]*\.)?(?:Query|NamedQuery)\s*\(/gu],
  ['query', /\b(?:createQuery|createSelectionQuery)\s*\(/gu],
  ['graph', /@\s*(?:[\w.]*\.)?EntityGraph\s*\(/gu],
  ['namedGraph', /@\s*(?:[\w.]*\.)?NamedEntityGraph\s*\(/gu],
  ['criteria', /[\w$]+\s*\.\s*fetch\s*\(/gu],
];
const INTERFACE = /\binterface\s+[\w$]+/gu;
const GENERIC = /([\w$]+)\s*<\s*([\w$.]+)/gu;
const CLASS_AFTER = /\bclass\s+([\w$]+)/u;
const CONSTANT = /^\s*([\w$]+)\s*(?:,|$)/u;
const THROWS = /\bthrows\b[^()]*$/u;
const CONTROL = /^(?:else\s+)?(?:if|for|while|switch|catch|synchronized|try)\b/u;
const REPOSITORY_SUFFIX = 'Repository';
const OPEN = /\{/gu;

export function fetchSource(raw: string): FetchSource {
  const source = blankComments(raw);
  const blanked = blankLiterals(source);
  return { source, blanked, depths: braceDepths(blanked), starts: lineStarts(source) };
}

function sitesFrom(prepared: FetchSource, start: number): FetchSite[] {
  return SITES.flatMap(([kind, pattern]) =>
    [...prepared.blanked.slice(start).matchAll(pattern)].map((match) => ({
      kind,
      at: start + match.index,
    })),
  ).toSorted((left, right) => left.at - right.at);
}

function sitesAt(prepared: FetchSource, line: number): FetchSite[] {
  const start = prepared.starts[line - 1] ?? prepared.source.length;
  const end = prepared.starts[line] ?? prepared.source.length;
  const sites = sitesFrom(prepared, start);
  const onLine = sites.filter(({ at }) => at < end);
  return onLine.length > 0 ? onLine : sites.slice(0, 1);
}

function repositoryEntity(prepared: FetchSource, at: number): string | undefined {
  const declared = [...prepared.blanked.slice(0, at).matchAll(INTERFACE)].at(-1);
  if (declared === undefined) {
    return undefined;
  }
  const header = prepared.blanked.slice(
    declared.index,
    prepared.blanked.indexOf('{', declared.index),
  );
  const repository = [...header.matchAll(GENERIC)].find(([, name]) =>
    (name ?? '').endsWith(REPOSITORY_SUFFIX),
  );
  return repository?.[2]?.split('.').at(-1);
}

function enclosingOpens({ blanked, depths }: FetchSource, at: number): number[] {
  const opens: number[] = [];
  let wanted = (depths[at] ?? 0) - 1;
  for (const { index } of [...blanked.slice(0, at).matchAll(OPEN)].toReversed()) {
    if (depths[index] === wanted) {
      opens.push(index);
      wanted -= 1;
    }
  }
  return opens;
}

function headerStart(blanked: string, open: number): number {
  const before = blanked.slice(0, open);
  return (
    Math.max(before.lastIndexOf(';'), before.lastIndexOf('}'), before.lastIndexOf('{'), -1) + 1
  );
}

function headerKind(blanked: string, open: number): string {
  const header = blanked.slice(headerStart(blanked, open), open).trim();
  const bare = header.replace(THROWS, '').trimEnd();
  if (bare.endsWith('->')) {
    return 'lambda';
  }
  return bare.endsWith(')') && !CONTROL.test(header) ? 'method' : 'block';
}

function enclosingBody(prepared: FetchSource, at: number): string {
  const { source, blanked } = prepared;
  const opens = enclosingOpens(prepared, at);
  const kinds = opens.map((open) => headerKind(blanked, open));
  const chosen =
    opens[kinds.indexOf('method')] ??
    opens[kinds.indexOf('lambda')] ??
    opens[opens.length - 2] ??
    opens[0];
  return chosen === undefined
    ? ''
    : source.slice(headerStart(blanked, chosen), closingOf(blanked, chosen, BRACES) + 1);
}

function queryText(source: string, at: number): string {
  const inline = argumentsAt(source, at);
  const strings = stringsIn(inline);
  const constant = CONSTANT.exec(inline)?.[1];
  if (strings.length > 0 || constant === undefined) {
    return strings.join(' ');
  }
  const declared = new RegExp(String.raw`\b${escapeRegExp(constant)}\s*=([^;]*);`, 'u');
  return stringsIn(declared.exec(source)?.[1] ?? '').join(' ');
}

function joinedAt(prepared: FetchSource, site: FetchSite, relationOf: RelationOf): Joined[] {
  const { source, blanked } = prepared;
  if (site.kind === 'query') {
    return [resolvedFetches(jpqlFetches(queryText(source, site.at)), relationOf)];
  }
  if (site.kind === 'graph') {
    const entity = repositoryEntity(prepared, site.at);
    return [graphFetches(entity, graphPaths(argumentsAt(source, site.at)), relationOf)];
  }
  if (site.kind === 'namedGraph') {
    const entity = CLASS_AFTER.exec(blanked.slice(site.at))?.[1];
    return [graphFetches(entity, namedGraphPaths(argumentsAt(source, site.at)), relationOf)];
  }
  return criteriaFetches(enclosingBody(prepared, site.at), relationOf);
}

export function crossedFetchAt(
  prepared: FetchSource,
  line: number,
  relationOf: RelationOf,
): unknown {
  return sitesAt(prepared, line)
    .flatMap((site) => joinedAt(prepared, site, relationOf))
    .map((joined): unknown => crossedCollections(joined))
    .find((crossed) => crossed !== undefined);
}
