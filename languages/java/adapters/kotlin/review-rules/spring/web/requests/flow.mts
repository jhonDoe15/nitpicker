import { appendAll } from '../../../../../../../../shared/lists/lists.mts';
import { grouping } from '../../../kotlin-facts.mts';
import { typeArguments } from '../../spring-names.mts';
import { bindingIndex } from './bindings.mts';
import { helperEdges } from './helper-calls.mts';
import { DIRECT, memberTainted, seeds } from './sources.mts';
import type { InvocationFact, Read, ScopeFact, SpringView } from '../../typed/spring-shapes.mts';
import type {
  BindingIndex,
  Found,
  Holder,
  Mode,
  Place,
  RequestFlow,
  Taint,
} from '../../typed/request-types.mts';

type Site = Place & { scope: number | undefined };
type Target = { target: string; mode: Mode };

const TEMPLATE_CALLS = new Set([
  'buildAndExpand',
  'expand',
  'fragment',
  'path',
  'pathSegment',
  'queryParam',
  'queryParams',
  'replaceQueryParam',
  'uriVariables',
]);
const VALUE_HOSTS = new Set(['let', 'also', 'takeIf', 'takeUnless', 'use']);
const RECEIVER_HOSTS = new Set(['apply', 'run', 'with']);
const ELEMENT_HOSTS = new Set([
  'all',
  'any',
  'associate',
  'associateBy',
  'associateWith',
  'count',
  'distinctBy',
  'filter',
  'filterIndexed',
  'filterNot',
  'find',
  'first',
  'firstNotNullOf',
  'firstNotNullOfOrNull',
  'firstOrNull',
  'flatMap',
  'forEach',
  'forEachIndexed',
  'groupBy',
  'last',
  'lastOrNull',
  'map',
  'mapIndexed',
  'mapIndexedNotNull',
  'mapNotNull',
  'none',
  'onEach',
  'partition',
  'single',
  'singleOrNull',
  'sortedBy',
  'sortedByDescending',
  'sumOf',
]);
const LOOPS = new Set(['loop', 'foreach']);
const ALIAS: Mode = 'alias';
const ELEMENT: Mode = 'element';

function strength(state: Taint | undefined): number {
  if (state === undefined) {
    return 0;
  }
  return state === DIRECT ? 2 : 1;
}

function counted(read: Read): boolean {
  return !(read.calls ?? []).some((call) => TEMPLATE_CALLS.has(call));
}

function resolved(index: BindingIndex, reads: Read[] | undefined, site: Site): Found[] {
  const { scope, via, ...place } = site;
  return (reads ?? []).filter(counted).flatMap((read) => {
    const found = index.resolve(read, scope, place);
    if (found === undefined) {
      return [];
    }
    const member = found.member === via ? undefined : found.member;
    return [{ node: found.node, member, implicit: found.implicit, read }];
  });
}

function parameterOf(scope: ScopeFact, position: number): string | undefined {
  const declared = scope.params?.[position]?.name ?? (position === 0 ? 'it' : undefined);
  return declared === undefined ? undefined : `${String(scope.id)}:${declared}`;
}

function scopeTargets(scope: ScopeFact): Target[] {
  const host = scope.host ?? '';
  if (LOOPS.has(scope.k)) {
    return (scope.params ?? []).map(({ name }) => ({
      target: `${String(scope.id)}:${name}`,
      mode: ELEMENT,
    }));
  }
  if (scope.k !== 'lambda') {
    return [];
  }
  if (RECEIVER_HOSTS.has(host) && (scope.qualifier ?? scope.argument) !== undefined) {
    return [{ target: `${String(scope.id)}:this`, mode: ALIAS }];
  }
  const position = scope.host?.includes('Indexed') ? 1 : 0;
  const target = parameterOf(scope, position);
  if (target === undefined) {
    return [];
  }
  if (VALUE_HOSTS.has(host)) {
    return [{ target, mode: ALIAS }];
  }
  return ELEMENT_HOSTS.has(host) ? [{ target, mode: ELEMENT }] : [];
}

function readsOfScope(scope: ScopeFact): Read[] {
  return [...(scope.reads ?? [])].filter((read) => typeof read !== 'string');
}

function scopeHolders(view: SpringView, index: BindingIndex): Holder[] {
  return view.file.scopes.flatMap((scope) =>
    scopeTargets(scope).map(({ target, mode }) => ({
      target,
      mode,
      reads: resolved(index, readsOfScope(scope), {
        scope: scope.parent,
        line: scope.line,
        via: scope.host,
      }),
    })),
  );
}

function assignmentTarget(index: BindingIndex, invocation: InvocationFact): string | undefined {
  const place = { line: invocation.line };
  if (invocation.receiver === undefined) {
    return index.declaration(invocation.scope, invocation.name, place)?.key;
  }
  if (invocation.name === 'plusAssign' || invocation.name === 'minusAssign') {
    return index.declaration(invocation.scope, invocation.receiver, place)?.key;
  }
  if (invocation.receiver !== 'this') {
    return undefined;
  }
  const found = index.resolve({ name: 'this', member: invocation.name }, invocation.scope, place);
  return found?.member === undefined ? found?.node : undefined;
}

function assignmentHolders(view: SpringView, index: BindingIndex): Holder[] {
  return view.file.invocations
    .filter(({ assign }) => assign === true)
    .flatMap((invocation): Holder[] => {
      const target = assignmentTarget(index, invocation);
      const place = { line: invocation.line };
      const reads = resolved(index, invocation.arguments[0]?.reads, {
        scope: invocation.scope,
        ...place,
      });
      const mode = invocation.receiver === undefined ? ALIAS : undefined;
      return target === undefined ? [] : [{ target, mode, reads }];
    });
}

function valueHolders(view: SpringView, index: BindingIndex): Holder[] {
  const classScopes = new Map(
    view.file.scopes
      .filter(({ k }) => k === 'class')
      .map((scope): [string | undefined, ScopeFact] => [scope.qualified, scope]),
  );
  const properties = view.file.properties.flatMap((property): Holder[] => {
    const scope = classScopes.get(property.owner);
    return scope === undefined
      ? []
      : [
          {
            target: `${String(scope.id)}:${property.name}`,
            mode: ALIAS,
            reads: resolved(index, property.reads, { scope: scope.id, line: property.line }),
          },
        ];
  });
  const locals = (view.file.locals ?? []).map((local): Holder => ({
    target: index.localKey(local),
    mode: local.component === undefined ? ALIAS : undefined,
    reads: resolved(index, local.reads, { scope: local.scope, line: local.line, holder: local }),
  }));
  const results = (view.file.returnValues ?? [])
    .filter(({ lambda }) => lambda === true)
    .map(({ scope, line, reads }): Holder => ({
      target: `r:${String(scope)}`,
      mode: ALIAS,
      reads: resolved(index, reads, { scope, line }),
    }));
  return [...properties, ...locals, ...results];
}

function edgeHolders(view: SpringView, index: BindingIndex): Holder[] {
  return helperEdges(view, index).map((edge) => ({
    target: edge.target,
    mode: edge.kind === DIRECT ? undefined : ALIAS,
    type: edge.kind?.type,
    reads: resolved(index, edge.reads, { scope: edge.scope, line: edge.line, via: edge.via }),
  }));
}

function makeTaints(view: SpringView, states: Map<string, Taint>): (found: Found) => boolean {
  return ({ node, member, implicit }) => {
    const state = states.get(node);
    return (
      (state === DIRECT && implicit !== true) ||
      (state?.type !== undefined && member !== undefined && memberTainted(view, state.type, member))
    );
  };
}

function evaluate(
  holder: Holder,
  states: Map<string, Taint>,
  taints: (found: Found) => boolean,
): Taint | undefined {
  const [only] = holder.reads;
  if (
    only !== undefined &&
    holder.reads.length === 1 &&
    only.member === undefined &&
    holder.mode !== undefined
  ) {
    const state = states.get(only.node);
    if (state === undefined || state === DIRECT) {
      return state;
    }
    if (holder.mode === ELEMENT) {
      const element = typeArguments(state.type)[0];
      return element === undefined ? undefined : { type: element };
    }
    return holder.type === undefined ? state : { type: holder.type };
  }
  return holder.reads.some((read) => taints(read)) ? DIRECT : undefined;
}

function solve(view: SpringView, holders: Holder[]): (found: Found) => boolean {
  const states = new Map(seeds(view).map(({ key, kind }): [string, Taint] => [key, kind]));
  const taints = makeTaints(view, states);
  const dependents = grouping<string, Holder>();
  for (const holder of holders) {
    for (const { node } of holder.reads) {
      dependents.append(node, holder);
    }
  }
  const pending = [...holders];
  for (const holder of pending) {
    const state = evaluate(holder, states, taints);
    if (state !== undefined && strength(state) > strength(states.get(holder.target))) {
      states.set(holder.target, state);
      appendAll(pending, dependents.groups.get(holder.target) ?? []);
    }
  }
  return taints;
}

function build(view: SpringView): RequestFlow {
  const index = bindingIndex(view);
  const taints = solve(view, [
    ...scopeHolders(view, index),
    ...assignmentHolders(view, index),
    ...valueHolders(view, index),
    ...edgeHolders(view, index),
  ]);
  return {
    taintedRead: (read, scope, place) =>
      resolved(index, [read], { scope, ...place }).some((found) => taints(found)),
    tainted: (reads, scope, place) =>
      resolved(index, reads, { scope, ...place }).some((found) => taints(found)),
  };
}

export function requestFlow(view: SpringView): RequestFlow {
  return view.memo(
    'requestFlow',
    () => build(view),
    (value): value is RequestFlow =>
      typeof value === 'object' && value !== null && 'taintedRead' in value && 'tainted' in value,
  );
}
