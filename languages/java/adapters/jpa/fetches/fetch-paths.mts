import type {
  FetchOwner,
  Joined,
  JpqlFetches,
  JpqlJoin,
  JpqlRoot,
  Relation,
  RelationOf,
} from './fetch-types.mts';
import { textOf } from '../../../../../shared/values/readers.mts';
import { typeArguments } from '../../kotlin/review-rules/spring/spring-names.mts';

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

function aliasOf(word: string | undefined): string | undefined {
  return word === undefined || KEYWORDS.has(word.toLowerCase()) ? undefined : word;
}

export function jpqlFetches(text: string): JpqlFetches {
  const roots: JpqlRoot[] = [...text.matchAll(ROOT)]
    .filter(([, , alias]) => aliasOf(alias) !== undefined)
    .map(([, entity = '', alias]) => ({ alias, entity: entity.split('.').at(-1) ?? '' }));
  const joins: JpqlJoin[] = [...text.matchAll(JOIN)].map(([, fetch, target = '', alias]) => {
    const [owner = '', ...path] = target.split('.');
    return { owner, path, alias: aliasOf(alias), fetched: fetch !== undefined };
  });
  return { roots, joins };
}

export function stepInto(
  relationOf: RelationOf,
  record: (key: string, many: boolean) => void,
): (owner: FetchOwner | undefined, field: string) => FetchOwner | undefined {
  return (owner, field) => {
    const relation = owner === undefined ? undefined : relationOf(owner.entity, field);
    if (owner === undefined || relation === undefined) {
      return undefined;
    }
    const key = `${owner.key}.${field}`;
    record(key, relation.many);
    return { entity: relation.target, key };
  };
}

export function resolvedFetches({ roots, joins }: JpqlFetches, relationOf: RelationOf): Joined {
  const aliases = new Map<string | undefined, FetchOwner>(
    roots.map(({ alias, entity }) => [alias, { entity, key: entity }]),
  );
  const joined: Joined = new Map();
  for (const join of joins) {
    const start = aliases.get(join.owner);
    const end = join.path.reduce<FetchOwner | undefined>(
      stepInto(relationOf, (key, many) => {
        if (join.fetched) {
          joined.set(key, many);
        }
      }),
      start,
    );
    if (end !== undefined && join.alias !== undefined) {
      aliases.set(join.alias, end);
    }
  }
  return joined;
}

export function graphFetches(
  entity: string | undefined,
  paths: readonly (readonly string[])[],
  relationOf: RelationOf,
): Joined {
  const joined: Joined = new Map();
  for (const path of paths) {
    path.reduce<FetchOwner | undefined>(
      stepInto(relationOf, (key, many) => {
        joined.set(key, many);
      }),
      {
        entity: textOf(entity),
        key: textOf(entity),
      },
    );
  }
  return joined;
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
const TO_ONE = /^(?:ManyToOne|OneToOne|Embedded|EmbeddedId)$/u;

function simpleName(type: string): string {
  return (
    type
      .replace(/<.*$/su, '')
      .replaceAll(/[?!\s]/gu, '')
      .split('.')
      .at(-1) ?? ''
  );
}

export function fieldRelation(type: string, annotations: readonly string[]): Relation {
  const compact = type.replaceAll(/\s+/gu, '');
  const head = simpleName(compact);
  const toOne = annotations.some((name) => TO_ONE.test(name));
  const many =
    !toOne && (COLLECTION_TYPES.has(head) || annotations.some((name) => TO_MANY.test(name)));
  const element = many ? (typeArguments(compact).at(-1) ?? '') : compact;
  return { many, target: simpleName(element.replace(/^(?:out|in)\s*/u, '')) };
}
