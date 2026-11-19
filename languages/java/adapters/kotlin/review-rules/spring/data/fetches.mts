import type { FetchOwner, Joined, RelationOf } from '../../../../jpa/fetches/fetch-types.mts';
import { crossedCollections } from '../../../../../../../shared/joins/crossed-collections.mjs';
import {
  graphFetches,
  jpqlFetches,
  resolvedFetches,
} from '../../../../jpa/fetches/fetch-paths.mts';
import { graphPaths, namedGraphPaths, stringsIn } from '../../../../jpa/fetches/graph-texts.mts';
import { annotationIn, stringValue, typeArguments, typeName } from '../spring-names.mts';
import { entriesOf, report, symbolOf } from '../spring-scopes.mts';
import {
  CRITERIA_FETCHES,
  ENTITY,
  ENTITY_GRAPH,
  JPA_QUERY,
  NAMED_GRAPHS,
  NAMED_QUERIES,
} from './data-types.mts';
import { relations } from '../typed/entity-relations.mts';
import type {
  Annotation,
  Argument,
  Declaration,
  InvocationFact,
  Reported,
  SourceFile,
  SpringView,
} from '../typed/spring-shapes.mts';

type Alias = { entity: string; key: string | undefined; chainedField?: string | undefined };
type Stepper = (owner: Alias | undefined, field: string) => FetchOwner | undefined;
type CriteriaState = { aliases: Map<string, Alias>; step: Stepper };

const crossedOf: (joined: Joined) => unknown = crossedCollections;
const RULE = 'JpaMultipleCollectionFetch';
const QUERY_CALLS = new Set(['createQuery', 'createSelectionQuery']);
const FETCH = 'fetch';
const FROM = 'from';
const NAMED_QUERY = /NamedQuery\s*\(/u;
const CHAINED_FETCH = /^([\w$]+)\.fetch(?:<[^>]*>)?\(\s*"([\w$]+)"/u;

function crossed(joined: Joined, node: Declaration, symbol: string): Reported[] {
  return crossedOf(joined) === undefined ? [] : [report(RULE, node, symbol)];
}

function queryText(entry: Annotation): string {
  return stringsIn(entry.arguments.map(({ text }) => text).join(' ')).join(' ');
}

function repositoryEntity(view: SpringView, owner: string): string | undefined {
  const declared = view.classes.get(owner);
  const repository = (declared?.genericSupers ?? []).find((text) => view.isRepository(text));
  return (
    typeName(typeArguments(repository)[0] ?? '')
      .split('.')
      .at(-1) || undefined
  );
}

function functionFetches(view: SpringView, relationOf: RelationOf): Reported[] {
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

function argumentText({ name, text }: Argument): string {
  return name === undefined ? text : `${name} = ${text}`;
}

function argumentsText(entry: Annotation): string {
  return entry.arguments.map(argumentText).join(', ');
}

function classFetches(view: SpringView, relationOf: RelationOf): Reported[] {
  return view.file.classes.flatMap((declared) => {
    const named = annotationIn(view.resolve, declared.annotations, NAMED_QUERIES);
    const graph = annotationIn(view.resolve, declared.annotations, NAMED_GRAPHS);
    const entity =
      annotationIn(view.resolve, declared.annotations, ENTITY) === undefined
        ? undefined
        : declared.name;
    const queries = named === undefined ? [] : argumentsText(named).split(NAMED_QUERY);
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
            graphFetches(entity, namedGraphPaths(argumentsText(graph)), relationOf),
            declared,
            declared.qualified,
          )),
    ];
  });
}

function calledQueries(view: SpringView, relationOf: RelationOf): Reported[] {
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

function fetchStart(
  view: SpringView,
  invocation: InvocationFact,
  aliases: Map<string, Alias>,
): Alias | undefined {
  const chained = CHAINED_FETCH.exec(invocation.receiver ?? '');
  if (chained !== null) {
    const owner = aliases.get(chained[1] ?? '');
    return owner === undefined ? undefined : { ...owner, chainedField: chained[2] };
  }
  if (invocation.receiver !== undefined && aliases.has(invocation.receiver)) {
    return aliases.get(invocation.receiver);
  }
  const type = view.typeOf(invocation.scope, invocation.receiver);
  if (type === undefined || !view.is(type, CRITERIA_FETCHES)) {
    return undefined;
  }
  const entity =
    typeName(typeArguments(type).at(-1) ?? '')
      .split('.')
      .at(-1) ?? '';
  return { entity, key: invocation.receiver };
}

function stepper(relationOf: RelationOf, joined: Joined): Stepper {
  return (owner: Alias | undefined, field: string) => {
    const relation = owner === undefined ? undefined : relationOf(owner.entity, field);
    if (owner === undefined || relation === undefined) {
      return undefined;
    }
    const key = `${String(owner.key)}.${field}`;
    joined.set(key, relation.many);
    return { entity: relation.target, key };
  };
}

function fromRoot(invocation: InvocationFact): [string, Alias] | undefined {
  const entity = /^([\w$.]+)::class(?:\.java)?$/u.exec(invocation.arguments[0]?.text ?? '')?.[1];
  return entity === undefined || invocation.assignedTo === undefined
    ? undefined
    : [
        invocation.assignedTo,
        { entity: entity.split('.').at(-1) ?? '', key: invocation.assignedTo },
      ];
}

function fetchEnd(
  view: SpringView,
  invocation: InvocationFact,
  { aliases, step }: CriteriaState,
): FetchOwner | undefined {
  const start = fetchStart(view, invocation, aliases);
  const owner = start?.chainedField === undefined ? start : step(start, start.chainedField);
  const field = stringValue(invocation.arguments[0]?.text);
  return field === undefined ? undefined : step(owner, field);
}

function sameRoot(joined: Joined, key: string): Joined {
  const root = key.split('.')[0];
  return new Map([...joined].filter(([other]) => other.split('.')[0] === root));
}

function functionCriteria(
  view: SpringView,
  invocations: InvocationFact[],
  relationOf: RelationOf,
): Reported[] {
  const aliases = new Map<string, Alias>();
  const joined: Joined = new Map();
  const state = { aliases, step: stepper(relationOf, joined) };
  for (const invocation of invocations) {
    const root = invocation.name === FROM ? fromRoot(invocation) : undefined;
    if (root !== undefined) {
      aliases.set(...root);
    }
    const end = invocation.name === FETCH ? fetchEnd(view, invocation, state) : undefined;
    if (end !== undefined && invocation.assignedTo !== undefined) {
      aliases.set(invocation.assignedTo, end);
    }
    if (end !== undefined && crossedOf(sameRoot(joined, end.key)) !== undefined) {
      return [report(RULE, invocation, symbolOf(view, invocation.scope, FETCH))];
    }
  }
  return [];
}

function criteriaFetches(view: SpringView, relationOf: RelationOf): Reported[] {
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

export function collectionFetches(
  view: SpringView,
  { projectFiles = [] }: { projectFiles?: SourceFile[] } = {},
): Reported[] {
  const relationOf = relations(projectFiles);
  return [
    ...functionFetches(view, relationOf),
    ...classFetches(view, relationOf),
    ...calledQueries(view, relationOf),
    ...criteriaFetches(view, relationOf),
  ];
}
