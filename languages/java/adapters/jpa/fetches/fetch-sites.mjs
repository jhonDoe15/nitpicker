import { blankComments, blankLiterals } from '../../review-rules/java-sources.mjs';
import { crossedCollections, graphFetches, jpqlFetches, resolvedFetches } from './fetch-paths.mjs';
import {
  BRACES,
  argumentsAt,
  closingOf,
  closingParen,
  graphPaths,
  namedGraphPaths,
  stringsIn,
} from './graph-texts.mjs';

const SITES = [
  ['query', /@\s*(?:[\w.]*\.)?(?:Query|NamedQuery)\s*\(/u],
  ['query', /\b(?:createQuery|createSelectionQuery)\s*\(/u],
  ['graph', /@\s*(?:[\w.]*\.)?EntityGraph\s*\(/u],
  ['namedGraph', /@\s*(?:[\w.]*\.)?NamedEntityGraph\s*\(/u],
  ['criteria', /[\w$]+\s*\.\s*fetch\s*\(/u],
];
const REPOSITORY = /\binterface\s+[\w$]+[^{]*?\b[\w$]*Repository\s*<\s*([\w$.]+)/gu;
const CLASS_AFTER = /\bclass\s+([\w$]+)/u;
const FROM_ROOT = /([\w$]+)\s*=\s*[\w$.]+\s*\.\s*from\s*\(\s*([\w$.]+)\s*\.\s*class\s*\)/gu;
const ROOT_DECLARED = /\bRoot\s*<\s*([\w$.]+)\s*>\s+([\w$]+)/gu;
const SPECIFICATION = /\bSpecification\s*<\s*([\w$.]+)\s*>/u;
const LAMBDA_ROOT = /\(\s*([\w$]+)\s*,\s*[\w$]+\s*,\s*[\w$]+\s*\)\s*->/gu;
const CHAIN_START = /(?:([\w$]+)\s*=\s*)?(?<![\w$.)\]])([\w$]+)(?=\s*\.\s*fetch\s*\()/gu;
const FETCH_STEP = /^\s*\.\s*fetch\s*\(\s*(?:"([\w$]+)"|[\w$.]+_\s*\.\s*([\w$]+))/u;

function lineStart(text, line) {
  const lines = text.split('\n').slice(0, line - 1);
  return lines.reduce((offset, current) => offset + current.length + 1, 0);
}

function siteAt(text, line) {
  const start = lineStart(text, line);
  const rest = text.slice(start);
  const found = SITES.map(([kind, pattern]) => [kind, pattern.exec(rest)])
    .filter(([, match]) => match !== null)
    .toSorted(([, left], [, right]) => left.index - right.index)[0];
  return found === undefined ? undefined : { kind: found[0], at: start + found[1].index };
}

function repositoryEntity(text, at) {
  const declared = [...blankLiterals(text.slice(0, at)).matchAll(REPOSITORY)].at(-1);
  return declared?.[1].split('.').at(-1);
}

function braceDepths(text) {
  const depths = new Int32Array(text.length + 1);
  for (const [index, character] of [...text].entries()) {
    depths[index + 1] = depths[index] + (BRACES[character] ?? 0);
  }
  return depths;
}

function memberOpen(text, depths, at) {
  const wanted = Math.min(1, depths[at] - 1);
  const before = text.slice(0, at);
  const opens = [...before.matchAll(/\{/gu)].filter(({ index }) => depths[index] === wanted);
  return opens.at(-1)?.index;
}

function enclosingBody(text, at) {
  const blanked = blankLiterals(text);
  const depths = braceDepths(blanked);
  const open = memberOpen(blanked, depths, at);
  if (open === undefined) {
    return '';
  }
  const before = blanked.slice(0, open);
  const start = Math.max(
    before.lastIndexOf(';'),
    before.lastIndexOf('}'),
    before.lastIndexOf('{'),
    0,
  );
  return text.slice(start, closingOf(blanked, open, BRACES));
}

function simple(name) {
  return name.split('.').at(-1);
}

function criteriaRoots(body) {
  const roots = new Map([
    ...[...body.matchAll(ROOT_DECLARED)].map(([, entity, name]) => [name, simple(entity)]),
    ...[...body.matchAll(FROM_ROOT)].map(([, name, entity]) => [name, simple(entity)]),
  ]);
  const specified = SPECIFICATION.exec(body)?.[1];
  for (const [, root] of specified === undefined ? [] : body.matchAll(LAMBDA_ROOT)) {
    roots.set(root, simple(specified));
  }
  return roots;
}

function chainSteps(body, from) {
  const steps = [];
  const cursors = [from];
  for (const cursor of cursors) {
    const step = FETCH_STEP.exec(body.slice(cursor));
    if (step !== null) {
      steps.push(step[1] ?? step[2]);
      cursors.push(closingParen(body, body.indexOf('(', cursor + step.index)) + 1);
    }
  }
  return steps;
}

function criteriaFetches(body, relationOf) {
  const aliases = new Map(
    [...criteriaRoots(body)].map(([name, entity]) => [name, { entity, key: entity }]),
  );
  const joined = new Map();
  for (const match of body.matchAll(CHAIN_START)) {
    const [, assigned, receiver] = match;
    const end = chainSteps(body, match.index + match[0].length).reduce((owner, field) => {
      const relation = owner === undefined ? undefined : relationOf(owner.entity, field);
      if (relation === undefined) {
        return undefined;
      }
      const key = `${owner.key}.${field}`;
      joined.set(key, relation.many);
      return { entity: relation.target, key };
    }, aliases.get(receiver));
    if (assigned !== undefined && end !== undefined) {
      aliases.set(assigned, end);
    }
  }
  return joined;
}

function queryText(source, at) {
  const inline = argumentsAt(source, at);
  const strings = stringsIn(inline);
  const constant = /^\s*([\w$]+)\s*(?:,|$)/u.exec(inline)?.[1];
  if (strings.length > 0 || constant === undefined) {
    return strings.join(' ');
  }
  const declared = new RegExp(String.raw`\b${constant}\s*=([^;]*);`, 'u').exec(source)?.[1];
  return stringsIn(declared ?? '').join(' ');
}

function joinedAt(source, site, relationOf) {
  if (site.kind === 'query') {
    return resolvedFetches(jpqlFetches(queryText(source, site.at)), relationOf);
  }
  if (site.kind === 'graph') {
    const entity = repositoryEntity(source, site.at);
    return graphFetches(entity, graphPaths(argumentsAt(source, site.at)), relationOf);
  }
  if (site.kind === 'namedGraph') {
    const entity = CLASS_AFTER.exec(blankLiterals(source.slice(site.at)))?.[1];
    return graphFetches(entity, namedGraphPaths(argumentsAt(source, site.at)), relationOf);
  }
  return criteriaFetches(enclosingBody(source, site.at), relationOf);
}

export function crossedFetchAt(raw, line, relationOf) {
  const source = blankComments(raw);
  const site = siteAt(source, line);
  return site === undefined ? undefined : crossedCollections(joinedAt(source, site, relationOf));
}
