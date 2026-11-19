import { acceptsArguments, isSelfCall, ownerOf, report, symbolOf } from '../../spring-scopes.mts';
import { typeName } from '../../spring-names.mts';
import { isCollectionType, simpleName } from '../../view/member-types.mts';
import { ownersOf } from '../../view/project-types.mts';
import {
  elementIsCollection,
  entityWrite,
  inLoop,
  isCollection,
  referencesInLoops,
} from './loop-scopes.mts';
import type {
  Argument,
  FunctionFact,
  InvocationFact,
  ParameterFact,
  Reported,
  SpringView,
} from '../../typed/spring-shapes.mts';

function writingHelpers(view: SpringView): FunctionFact[] {
  return view.file.functions.filter((fn) =>
    view.file.invocations.some(
      (invocation) =>
        invocation.reference !== true &&
        entityWrite(view, invocation) &&
        view.functionAt(invocation.scope) === fn,
    ),
  );
}

const ANY_VALUE = new Set(['Any', 'Object', 'Serializable']);

function takesCollection(fn: FunctionFact, type: string | undefined): boolean {
  const bound = (fn.typeBounds ?? []).find(({ name }) => name === typeName(type));
  if (bound !== undefined) {
    return typeof bound.bound !== 'string' || isCollectionType(bound.bound);
  }
  return isCollectionType(type) || ANY_VALUE.has(simpleName(type));
}

function parameterFor(
  fn: FunctionFact,
  argument: Argument,
  index: number,
): ParameterFact | undefined {
  return argument.name === undefined
    ? fn.parameters[index]
    : fn.parameters.find(({ name }) => name === argument.name);
}

function argumentsFit(view: SpringView, fn: FunctionFact, invocation: InvocationFact): boolean {
  if (invocation.reference === true) {
    return (
      !elementIsCollection(view, invocation.scope, invocation.iterated) ||
      isCollectionType(fn.parameters[0]?.type)
    );
  }
  const receiverFits =
    fn.receiver === undefined ||
    !isCollection(view, invocation.scope, invocation.receiver) ||
    isCollectionType(fn.receiver);
  return (
    receiverFits &&
    invocation.arguments.every((argument, index) => {
      const parameter = parameterFor(fn, argument, index);
      return (
        parameter === undefined ||
        parameter.vararg ||
        takesCollection(fn, parameter.type) ||
        !isCollection(view, invocation.scope, argument.text)
      );
    })
  );
}

function sameOwner(view: SpringView, fn: FunctionFact, invocation: InvocationFact): boolean {
  return fn.owner === '' || ownersOf(view.file, ownerOf(view, invocation)).has(fn.owner);
}

function helperCalled(
  view: SpringView,
  helpers: FunctionFact[],
  invocation: InvocationFact,
): boolean {
  return helpers.some(
    (fn) =>
      fn.name === invocation.name &&
      sameOwner(view, fn, invocation) &&
      (invocation.reference === true || acceptsArguments(fn, invocation.arguments.length)) &&
      argumentsFit(view, fn, invocation),
  );
}

function receiverMatches(view: SpringView, fn: FunctionFact, invocation: InvocationFact): boolean {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  return type === undefined || simpleName(type) === simpleName(fn.receiver);
}

function extensionCall(
  view: SpringView,
  helpers: FunctionFact[],
  invocation: InvocationFact,
): boolean {
  return (
    invocation.receiver !== undefined &&
    invocation.assign !== true &&
    invocation.index !== true &&
    invocation.reference !== true &&
    view.implicitReceiver(invocation.scope)?.text === undefined &&
    helperCalled(
      view,
      helpers.filter((fn) => fn.receiver !== undefined && receiverMatches(view, fn, invocation)),
      invocation,
    )
  );
}

export function saveInLoopHelpers(view: SpringView): Reported[] {
  const helpers = writingHelpers(view);
  const calls = view.file.invocations.filter(
    (invocation) =>
      inLoop(view, invocation.scope) &&
      ((isSelfCall(view, invocation) && helperCalled(view, helpers, invocation)) ||
        extensionCall(view, helpers, invocation)),
  );
  const referenced = referencesInLoops(view).filter(
    (invocation) =>
      [undefined, 'this'].includes(invocation.receiver) && helperCalled(view, helpers, invocation),
  );
  return [...calls, ...referenced].map((invocation) =>
    report(
      'SpringDataSaveInLoopHelper',
      invocation,
      symbolOf(view, invocation.scope, invocation.name),
    ),
  );
}
