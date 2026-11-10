import { escapeRegExp } from '../../../../../../shared/paths/glob.mjs';
import { crossedCollections } from '../../../../../../shared/joins/crossed-collections.mjs';
import { blankComments, blankLiterals } from '../../../review-rules/java-sources.mjs';
import { graphFetches, jpqlFetches, resolvedFetches } from '../fetch-paths.mjs';
import { criteriaFetches } from './criteria-fetches.mjs';
import {
  BRACES,
  argumentsAt,
  closingOf,
  graphPaths,
  namedGraphPaths,
  stringsIn,
} from '../graph-texts.mjs';

const SITES = [
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

function lineStarts(text) {
  const starts = [0];
  for (const [index, character] of [...text].entries()) {
    if (character === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function braceDepths(text) {
  const depths = new Int32Array(text.length + 1);
  for (const [index, character] of [...text].entries()) {
    depths[index + 1] = depths[index] + (BRACES[character] ?? 0);
  }
  return depths;
}

export function fetchSource(raw) {
  const source = blankComments(raw);
  const blanked = blankLiterals(source);
  return { source, blanked, depths: braceDepths(blanked), starts: lineStarts(source) };
}

function sitesFrom(prepared, start) {
  return SITES.flatMap(([kind, pattern]) =>
    [...prepared.blanked.slice(start).matchAll(pattern)].map((match) => ({
      kind,
      at: start + match.index,
    })),
  ).toSorted((left, right) => left.at - right.at);
}

function sitesAt(prepared, line) {
  const start = prepared.starts[line - 1] ?? prepared.source.length;
  const end = prepared.starts[line] ?? prepared.source.length;
  const sites = sitesFrom(prepared, start);
  const onLine = sites.filter(({ at }) => at < end);
  return onLine.length > 0 ? onLine : sites.slice(0, 1);
}

function repositoryEntity(prepared, at) {
  const declared = [...prepared.blanked.slice(0, at).matchAll(INTERFACE)].at(-1);
  if (declared === undefined) {
    return undefined;
  }
  const header = prepared.blanked.slice(
    declared.index,
    prepared.blanked.indexOf('{', declared.index),
  );
  const repository = [...header.matchAll(GENERIC)].find(([, name]) =>
    name.endsWith(REPOSITORY_SUFFIX),
  );
  return repository?.[2].split('.').at(-1);
}

function enclosingOpens({ blanked, depths }, at) {
  const opens = [];
  let wanted = depths[at] - 1;
  for (const { index } of [...blanked.slice(0, at).matchAll(OPEN)].toReversed()) {
    if (depths[index] === wanted) {
      opens.push(index);
      wanted -= 1;
    }
  }
  return opens;
}

function headerStart(blanked, open) {
  const before = blanked.slice(0, open);
  return (
    Math.max(before.lastIndexOf(';'), before.lastIndexOf('}'), before.lastIndexOf('{'), -1) + 1
  );
}

function headerKind(blanked, open) {
  const header = blanked.slice(headerStart(blanked, open), open).trim();
  const bare = header.replace(THROWS, '').trimEnd();
  if (bare.endsWith('->')) {
    return 'lambda';
  }
  return bare.endsWith(')') && !CONTROL.test(header) ? 'method' : 'block';
}

function enclosingBody(prepared, at) {
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

function queryText(source, at) {
  const inline = argumentsAt(source, at);
  const strings = stringsIn(inline);
  const constant = CONSTANT.exec(inline)?.[1];
  if (strings.length > 0 || constant === undefined) {
    return strings.join(' ');
  }
  const declared = new RegExp(String.raw`\b${escapeRegExp(constant)}\s*=([^;]*);`, 'u');
  return stringsIn(declared.exec(source)?.[1] ?? '').join(' ');
}

function joinedAt(prepared, site, relationOf) {
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

export function crossedFetchAt(prepared, line, relationOf) {
  return sitesAt(prepared, line)
    .flatMap((site) => joinedAt(prepared, site, relationOf))
    .map((joined) => crossedCollections(joined))
    .find((crossed) => crossed !== undefined);
}
