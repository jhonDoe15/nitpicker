import { typeArguments } from '../../kotlin/review-rules/spring/spring-names.mjs';

const KEYWORDS = new Set([
  'as',
  'cross',
  'fetch',
  'full',
  'group',
  'having',
  'inner',
  'join',
  'left',
  'on',
  'order',
  'outer',
  'right',
  'select',
  'union',
  'where',
  'with',
]);
const KEYWORD_AHEAD = String.raw`(?!(?:${[...KEYWORDS].join('|')})\b)`;
const ROOT = new RegExp(String.raw`\bfrom\s+([\w$.]+)(?:\s+as)?\s+${KEYWORD_AHEAD}([\w$]+)`, 'giu');
const JOIN = new RegExp(
  String.raw`\b(?:(?:left|right|full)(?:\s+outer)?\s+|inner\s+)?join\s+(fetch\s+)?` +
    String.raw`([\w$]+(?:\.[\w$]+)+)(?:(?:\s+as)?\s+${KEYWORD_AHEAD}([\w$]+))?`,
  'giu',
);

function aliasOf(word) {
  return word === undefined || KEYWORDS.has(word.toLowerCase()) ? undefined : word;
}

export function jpqlFetches(text) {
  const roots = [...text.matchAll(ROOT)]
    .filter(([, , alias]) => aliasOf(alias) !== undefined)
    .map(([, entity, alias]) => ({ alias, entity: entity.split('.').at(-1) }));
  const joins = [...text.matchAll(JOIN)].map(([, fetch, target, alias]) => {
    const [owner, ...path] = target.split('.');
    return { owner, path, alias: aliasOf(alias), fetched: fetch !== undefined };
  });
  return { roots, joins };
}

export function resolvedFetches({ roots, joins }, relationOf) {
  const aliases = new Map(roots.map(({ alias, entity }) => [alias, { entity, key: entity }]));
  const joined = new Map();
  for (const join of joins) {
    const start = aliases.get(join.owner);
    const end = join.path.reduce((owner, field) => {
      const relation = owner === undefined ? undefined : relationOf(owner.entity, field);
      if (relation === undefined) {
        return undefined;
      }
      const key = `${owner.key}.${field}`;
      if (join.fetched) {
        joined.set(key, relation.many);
      }
      return { entity: relation.target, key };
    }, start);
    if (end !== undefined && join.alias !== undefined) {
      aliases.set(join.alias, end);
    }
  }
  return joined;
}

export function graphFetches(entity, paths, relationOf) {
  const joined = new Map();
  for (const path of paths) {
    path.reduce(
      (owner, field) => {
        const relation = owner === undefined ? undefined : relationOf(owner.entity, field);
        if (relation === undefined) {
          return undefined;
        }
        const key = `${owner.key}.${field}`;
        joined.set(key, relation.many);
        return { entity: relation.target, key };
      },
      { entity, key: entity },
    );
  }
  return joined;
}

function isNested(outer, inner) {
  return inner.startsWith(`${outer}.`);
}

export function crossedCollections(joined) {
  const collections = [...joined].filter(([, many]) => many).map(([key]) => key);
  for (const [index, first] of collections.entries()) {
    const second = collections
      .slice(index + 1)
      .find((other) => !isNested(first, other) && !isNested(other, first));
    if (second !== undefined) {
      return { first, second };
    }
  }
  return undefined;
}

const COLLECTION_TYPES = new Set([
  'Collection',
  'List',
  'Set',
  'SortedSet',
  'NavigableSet',
  'Map',
  'SortedMap',
  'Iterable',
  'ArrayList',
  'LinkedList',
  'HashSet',
  'LinkedHashSet',
  'TreeSet',
  'HashMap',
  'LinkedHashMap',
  'TreeMap',
  'MutableList',
  'MutableSet',
  'MutableMap',
  'MutableCollection',
]);
const TO_MANY = /^(?:OneToMany|ManyToMany|ElementCollection)$/u;

function simpleName(type) {
  return type
    .replace(/<.*$/su, '')
    .replaceAll(/[?!\s]/gu, '')
    .split('.')
    .at(-1);
}

export function fieldRelation(type, annotations) {
  const compact = type.replaceAll(/\s+/gu, '');
  const head = simpleName(compact);
  const many = COLLECTION_TYPES.has(head) || annotations.some((name) => TO_MANY.test(name));
  const element = many ? (typeArguments(compact).at(-1) ?? '') : compact;
  return { many, target: simpleName(element.replace(/^(?:out|in)\s*/u, '')) };
}
