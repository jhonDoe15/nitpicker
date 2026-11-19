import { simpleTypeName } from '../../spring-names.mts';
import { acceptsArguments, invocationsNamed, isSelfCall, ownerOf } from '../../spring-scopes.mts';
import { sourceKind } from './sources.mts';
import type {
  Argument,
  FunctionFact,
  InvocationFact,
  ScopeFact,
  SpringView,
} from '../../typed/spring-shapes.mts';
import type { BindingIndex, Edge } from '../../typed/request-types.mts';

type FunctionInScope = { fn: FunctionFact; scope: ScopeFact };

const COMPANION = /\.Companion$/u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const LITERALS: readonly (readonly [RegExp, string])[] = [
  [/^"/u, 'String'],
  [/^-?\d+L$/u, 'Long'],
  [/^-?\d+$/u, 'Int'],
  [/^-?\d+\.\d+$/u, 'Double'],
  [/^(?:true|false)$/u, 'Boolean'],
];
const WIDER: Record<string, Set<string> | undefined> = {
  CharSequence: new Set(['String']),
  Any: undefined,
};

function isHelper(fn: FunctionFact): boolean {
  return fn.local === true || fn.visibility === 'private';
}

function inClass(view: SpringView, invocation: InvocationFact, qualified: string): boolean {
  return view
    .chain(invocation.scope)
    .some((scope) => scope.k === 'class' && scope.qualified === qualified);
}

function visibleTo(
  view: SpringView,
  { fn, scope }: FunctionInScope,
  invocation: InvocationFact,
): boolean {
  if (invocation.reference === true || invocation.assign === true) {
    return false;
  }
  if (fn.local === true) {
    return view.chain(invocation.scope).some(({ id }) => id === scope.parent);
  }
  if (fn.receiver !== undefined) {
    return (
      invocation.receiver !== undefined && (fn.owner === '' || inClass(view, invocation, fn.owner))
    );
  }
  if (fn.owner === '') {
    return invocation.receiver === undefined;
  }
  if (COMPANION.test(fn.owner)) {
    const outer = fn.owner.replace(COMPANION, '');
    return (
      (invocation.receiver === undefined || invocation.receiver === outer.split('.').at(-1)) &&
      (inClass(view, invocation, fn.owner) || inClass(view, invocation, outer))
    );
  }
  return isSelfCall(view, invocation) && ownerOf(view, invocation) === fn.owner;
}

function argumentType(
  view: SpringView,
  invocation: InvocationFact,
  argument: Argument,
): string | undefined {
  const { text } = argument;
  const literal = LITERALS.find(([pattern]) => pattern.test(text));
  if (literal !== undefined) {
    return literal[1];
  }
  return IDENTIFIER.test(text) ? view.typeOf(invocation.scope, text) : undefined;
}

function compatible(parameterType: string | undefined, argumentType: string | undefined): boolean {
  if (parameterType === undefined || argumentType === undefined) {
    return true;
  }
  const wanted = simpleTypeName(parameterType);
  const given = simpleTypeName(argumentType);
  return wanted === given || (Object.hasOwn(WIDER, wanted) && (WIDER[wanted]?.has(given) ?? true));
}

function argumentFor(
  invocation: InvocationFact,
  fn: FunctionFact,
  index: number,
): Argument | undefined {
  const named = invocation.arguments.find(({ name }) => name === fn.parameters[index]?.name);
  return named ?? invocation.arguments.filter(({ name }) => name === undefined)[index];
}

function fits(view: SpringView, fn: FunctionFact, invocation: InvocationFact): boolean {
  return fn.parameters.every((parameter, index) => {
    const argument = argumentFor(invocation, fn, index);
    return (
      argument === undefined || compatible(parameter.type, argumentType(view, invocation, argument))
    );
  });
}

function targetsOf(
  view: SpringView,
  candidates: FunctionInScope[],
  invocation: InvocationFact,
): FunctionInScope[] {
  const counted = candidates.filter(({ fn }) => acceptsArguments(fn, invocation.arguments.length));
  return counted.length > 1 ? counted.filter(({ fn }) => fits(view, fn, invocation)) : counted;
}

function parameterEdges(
  view: SpringView,
  { fn, scope }: FunctionInScope,
  invocation: InvocationFact,
): Edge[] {
  const edges = fn.parameters.flatMap((parameter, index) => {
    const kind = sourceKind(view, parameter);
    const argument = argumentFor(invocation, fn, index);
    return kind === undefined || argument?.reads === undefined
      ? []
      : [{ target: `${String(scope.id)}:${parameter.name}`, reads: argument.reads, kind }];
  });
  const receiver =
    fn.receiver === undefined || invocation.receiverReads === undefined
      ? []
      : [{ target: `${String(scope.id)}:this`, reads: invocation.receiverReads, via: fn.name }];
  return [...edges, ...receiver].map((edge) => ({
    ...edge,
    scope: invocation.scope,
    line: invocation.line,
  }));
}

export function helperEdges(view: SpringView, index: BindingIndex): Edge[] {
  const helpers = view.file.functions
    .filter((fn) => isHelper(fn))
    .flatMap((fn) => {
      const scope = index.functionScope(fn);
      return scope === undefined ? [] : [{ fn, scope }];
    });
  const byName = Map.groupBy(helpers, ({ fn }) => fn.name);
  return [...byName].flatMap(([name, named]) =>
    invocationsNamed(view, name).flatMap((invocation) => {
      const visible = named.filter((helper) => visibleTo(view, helper, invocation));
      return targetsOf(view, visible, invocation).flatMap((helper) =>
        parameterEdges(view, helper, invocation),
      );
    }),
  );
}
