import {
  crossedCollections,
  fieldRelation,
  graphFetches,
  jpqlFetches,
  resolvedFetches,
} from '../../../../jpa/fetches/fetch-paths.mjs';
import { graphPaths, namedGraphPaths, stringsIn } from '../../../../jpa/fetches/graph-texts.mjs';
import {
  annotationIn,
  argumentOf,
  stringValue,
  typeArguments,
  typeName,
} from '../spring-names.mjs';
import { entriesOf, report, symbolOf } from '../spring-scopes.mjs';
import {
  CRITERIA_FETCHES,
  ENTITY,
  ENTITY_GRAPH,
  JPA_QUERY,
  NAMED_GRAPHS,
  NAMED_QUERIES,
} from './data-types.mjs';

const RULE = 'JpaMultipleCollectionFetch';
const QUERY_CALLS = new Set(['createQuery', 'createSelectionQuery']);
const FETCH = 'fetch';
const FROM = 'from';
const NAMED_QUERY = /NamedQuery\s*\(/u;
const CHAINED_FETCH = /^([\w$]+)\.fetch(?:<[^>]*>)?\(\s*"([\w$]+)"/u;
const MAX_SUPERS = 4;
const INDEXES = new WeakMap();

function entityIndex(projectFiles) {
  const index = new Map();
  for (const file of projectFiles) {
    for (const declared of file.classes) {
      const members = [
        ...declared.primaryParameters.filter(({ property }) => property !== undefined),
        ...file.properties.filter(({ owner }) => owner === declared.qualified),
      ];
      const entity = declared.annotations.find(({ name }) => name === 'Entity');
      const names = [
        declared.name,
        stringValue(argumentOf(entity ?? { arguments: [] }, 'name', { positional: true })),
      ];
      for (const name of new Set(names.filter(Boolean))) {
        index.set(name, [...(index.get(name) ?? []), { declared, members }]);
      }
    }
  }
  return index;
}

function relations(projectFiles) {
  if (!INDEXES.has(projectFiles)) {
    INDEXES.set(projectFiles, entityIndex(projectFiles));
  }
  const index = INDEXES.get(projectFiles);
  function relationOf(entity, field, depth = 0) {
    const found = index.get(entity) ?? [];
    if (found.length !== 1 || depth > MAX_SUPERS) {
      return undefined;
    }
    const [{ declared, members }] = found;
    const member = members.find(({ name }) => name === field);
    if (member !== undefined) {
      const annotations = entriesOf(member).map(({ name }) => name);
      return fieldRelation(member.type ?? member.initializer ?? '', annotations);
    }
    return declared.supers
      .map((name) => relationOf(typeName(name).split('.').at(-1), field, depth + 1))
      .find((relation) => relation !== undefined);
  }
  return relationOf;
}

function crossed(joined, node, symbol) {
  return crossedCollections(joined) === undefined ? [] : [report(RULE, node, symbol)];
}

function queryText(entry) {
  return stringsIn(entry.arguments.map(({ text }) => text).join(' ')).join(' ');
}

function repositoryEntity(view, owner) {
  const declared = view.classes.get(owner);
  const repository = (declared?.genericSupers ?? []).find((text) => view.isRepository(text));
  return (
    typeName(typeArguments(repository)[0] ?? '')
      .split('.')
      .at(-1) || undefined
  );
}

function functionFetches(view, relationOf) {
  return view.file.functions.flatMap((fn) => {
    const symbol = `${fn.owner}.${fn.name}`;
    const query = annotationIn(view.resolve, entriesOf(fn), JPA_QUERY);
    const graph = annotationIn(view.resolve, entriesOf(fn), ENTITY_GRAPH);
    const fromQuery =
      query === undefined
        ? []
        : crossed(resolvedFetches(jpqlFetches(queryText(query)), relationOf), fn, symbol);
    const paths =
      graph === undefined ? [] : graphPaths(graph.arguments.map(argumentText).join(', '));
    const fromGraph =
      paths.length < 2
        ? []
        : crossed(graphFetches(repositoryEntity(view, fn.owner), paths, relationOf), fn, symbol);
    return [...fromQuery, ...fromGraph];
  });
}

function argumentText({ name, text }) {
  return name === undefined ? text : `${name} = ${text}`;
}

function classFetches(view, relationOf) {
  return view.file.classes.flatMap((declared) => {
    const named = annotationIn(view.resolve, declared.annotations, NAMED_QUERIES);
    const graph = annotationIn(view.resolve, declared.annotations, NAMED_GRAPHS);
    const text = (entry) => entry.arguments.map(argumentText).join(', ');
    const entity =
      annotationIn(view.resolve, declared.annotations, ENTITY) === undefined
        ? undefined
        : declared.name;
    const queries = named === undefined ? [] : text(named).split(NAMED_QUERY);
    return [
      ...queries
        .flatMap((query) =>
          crossed(
            resolvedFetches(jpqlFetches(stringsIn(query).join(' ')), relationOf),
            declared,
            declared.qualified,
          ),
        )
        .slice(0, 1),
      ...(graph === undefined || entity === undefined
        ? []
        : crossed(
            graphFetches(entity, namedGraphPaths(text(graph)), relationOf),
            declared,
            declared.qualified,
          )),
    ];
  });
}

function calledQueries(view, relationOf) {
  return view.file.invocations
    .filter((invocation) => QUERY_CALLS.has(invocation.name))
    .flatMap((invocation) => {
      const text = stringsIn(invocation.arguments[0]?.text ?? '').join(' ');
      return crossed(
        resolvedFetches(jpqlFetches(text), relationOf),
        invocation,
        symbolOf(view, invocation.scope, invocation.name),
      );
    });
}

function fetchStart(view, invocation, aliases) {
  const chained = CHAINED_FETCH.exec(invocation.receiver ?? '');
  if (chained !== null) {
    const owner = aliases.get(chained[1]);
    return owner === undefined ? undefined : { ...owner, chainedField: chained[2] };
  }
  if (aliases.has(invocation.receiver)) {
    return aliases.get(invocation.receiver);
  }
  const type = view.typeOf(invocation.scope, invocation.receiver);
  if (type === undefined || !view.is(type, CRITERIA_FETCHES)) {
    return undefined;
  }
  const entity = typeName(typeArguments(type).at(-1) ?? '')
    .split('.')
    .at(-1);
  return { entity, key: entity };
}

function step(owner, field, relationOf, joined) {
  const relation = owner === undefined ? undefined : relationOf(owner.entity, field);
  if (relation === undefined) {
    return undefined;
  }
  const key = `${owner.key}.${field}`;
  joined.set(key, relation.many);
  return { entity: relation.target, key };
}

function fromRoot(invocation) {
  const entity = /^([\w$.]+)::class(?:\.java)?$/u.exec(invocation.arguments[0]?.text ?? '')?.[1];
  return entity === undefined || invocation.assignedTo === undefined
    ? undefined
    : [invocation.assignedTo, { entity: entity.split('.').at(-1), key: entity.split('.').at(-1) }];
}

function functionCriteria(view, invocations, relationOf) {
  const aliases = new Map();
  const joined = new Map();
  for (const invocation of invocations) {
    const root = invocation.name === FROM ? fromRoot(invocation) : undefined;
    if (root !== undefined) {
      aliases.set(...root);
    }
    const start = invocation.name === FETCH ? fetchStart(view, invocation, aliases) : undefined;
    const owner =
      start?.chainedField === undefined
        ? start
        : step(start, start.chainedField, relationOf, joined);
    const field = stringValue(invocation.arguments[0]?.text);
    const end = field === undefined ? undefined : step(owner, field, relationOf, joined);
    if (end !== undefined && invocation.assignedTo !== undefined) {
      aliases.set(invocation.assignedTo, end);
    }
    if (end !== undefined && crossedCollections(joined) !== undefined) {
      return [report(RULE, invocation, symbolOf(view, invocation.scope, FETCH))];
    }
  }
  return [];
}

function criteriaFetches(view, relationOf) {
  const byFunction = Map.groupBy(
    view.file.invocations.filter(({ name }) => name === FETCH || name === FROM),
    (invocation) => view.chain(invocation.scope).find(({ k }) => k === 'fun')?.id,
  );
  return [...byFunction.values()].flatMap((invocations) =>
    functionCriteria(
      view,
      invocations.toSorted((left, right) => left.line - right.line),
      relationOf,
    ),
  );
}

export function collectionFetches(view, { projectFiles = [] } = {}) {
  const relationOf = relations(projectFiles);
  return [
    ...functionFetches(view, relationOf),
    ...classFetches(view, relationOf),
    ...calledQueries(view, relationOf),
    ...criteriaFetches(view, relationOf),
  ];
}
