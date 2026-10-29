import { annotationIn, argumentOf, typeName } from '../spring-names.mjs';
import {
  acceptsArguments,
  entriesOf,
  isSelfCall,
  ownerOf,
  report,
  returnTypeOf,
  symbolOf,
} from '../spring-scopes.mjs';
import {
  ASYNC,
  COMPLETABLE_FUTURE,
  CONTROLLERS,
  JAKARTA_TRANSACTIONAL,
  PROXIED,
  SCHEDULED,
  SPRING_PRESET_OPEN,
  SPRING_TRANSACTIONAL,
} from '../spring-types.mjs';

const OPEN_MODIFIERS = new Set(['open', 'abstract', 'override']);
const STATIC_OWNERS = new Set(['object', 'companion']);

export function pluginOpener(view, allOpen) {
  if (allOpen === undefined) {
    return undefined;
  }
  const fqns = new Set([
    ...(allOpen.annotations ?? []),
    ...((allOpen.presets ?? []).includes('spring') ? SPRING_PRESET_OPEN : []),
  ]);
  return (declared) =>
    declared.annotations.some((annotation) => {
      const name = annotation.type ?? annotation.name;
      return view.is(name, fqns) || view.metaAnnotated(typeName(name), fqns);
    });
}

function closed(fn, owner, opened) {
  if (opened === undefined) {
    return false;
  }
  const byPlugin = opened(owner);
  return (
    !(owner.open || byPlugin) ||
    !(byPlugin || fn.modifiers.some((name) => OPEN_MODIFIERS.has(name)))
  );
}

function proxyVisibility(view, { allOpen }) {
  const opened = pluginOpener(view, allOpen);
  const functions = view.file.functions
    .filter((fn) => annotationIn(view.resolve, entriesOf(fn), PROXIED) !== undefined)
    .filter((fn) => {
      const owner = view.classes.get(fn.owner);
      if (owner?.kind === 'interface') {
        return false;
      }
      return (
        owner === undefined ||
        STATIC_OWNERS.has(owner.kind) ||
        fn.visibility === 'private' ||
        fn.modifiers.includes('protected') ||
        fn.modifiers.includes('final') ||
        closed(fn, owner, opened)
      );
    })
    .map((fn) => report('SpringProxyMethodVisibility', fn, `${fn.owner}.${fn.name}`));
  const classes = view.file.classes
    .filter((declared) => declared.kind !== 'interface')
    .filter((declared) => annotationIn(view.resolve, declared.annotations, PROXIED) !== undefined)
    .filter(
      (declared) =>
        STATIC_OWNERS.has(declared.kind) ||
        (opened !== undefined && !declared.open && !opened(declared)),
    )
    .map((declared) => report('SpringProxyMethodVisibility', declared, declared.qualified));
  return [...functions, ...classes];
}

function exempt(view, annotation, callerTransactional) {
  return (
    callerTransactional &&
    annotation.arguments.length === 0 &&
    view.is(annotation.type ?? annotation.name, SPRING_TRANSACTIONAL)
  );
}

function selfCalls(view) {
  return view.file.invocations.flatMap((invocation) => {
    const reference = invocation.reference === true;
    if (
      reference ? !['this', undefined].includes(invocation.receiver) : !isSelfCall(view, invocation)
    ) {
      return [];
    }
    const caller = view.functionAt(invocation.scope);
    const callerTransactional =
      caller !== undefined &&
      annotationIn(view.resolve, entriesOf(caller), SPRING_TRANSACTIONAL) !== undefined;
    const target = view
      .functionsOf(ownerOf(view, invocation))
      .filter(
        (fn) =>
          fn.name === invocation.name &&
          (reference || acceptsArguments(fn, invocation.arguments.length)),
      )
      .find((fn) =>
        entriesOf(fn).some(
          (annotation) =>
            view.is(annotation.type ?? annotation.name, PROXIED) &&
            !exempt(view, annotation, callerTransactional),
        ),
      );
    return target === undefined || target === caller
      ? []
      : [
          report(
            'SpringProxySelfCall',
            invocation,
            symbolOf(view, invocation.scope, invocation.name),
          ),
        ];
  });
}

function annotatedDeclarations(view) {
  return [
    ...view.file.classes.map((declared) => ({
      declared,
      entries: declared.annotations,
      symbol: declared.qualified,
      owner: declared,
    })),
    ...view.file.functions.map((fn) => ({
      declared: fn,
      entries: entriesOf(fn),
      symbol: `${fn.owner}.${fn.name}`,
      owner: view.classes.get(fn.owner),
      fn,
    })),
  ];
}

function transactionAnnotations(view) {
  return annotatedDeclarations(view).flatMap(({ declared, entries, symbol, owner }) => {
    const spring = annotationIn(view.resolve, entries, SPRING_TRANSACTIONAL);
    const controller =
      spring !== undefined &&
      owner !== undefined &&
      annotationIn(view.resolve, owner.annotations, CONTROLLERS) !== undefined;
    const requiresNew = /REQUIRES_NEW/u.test(
      spring === undefined ? '' : (argumentOf(spring, 'propagation') ?? ''),
    );
    return [
      ...(annotationIn(view.resolve, entries, JAKARTA_TRANSACTIONAL)
        ? [report('SpringTransactionalAnnotation', declared, symbol)]
        : []),
      ...(controller ? [report('SpringNoTransactionalController', declared, symbol)] : []),
      ...(requiresNew ? [report('SpringNoRequiresNew', declared, symbol)] : []),
    ];
  });
}

function scheduling(view) {
  return annotatedDeclarations(view).flatMap(({ declared, entries, symbol, fn }) => {
    const async = annotationIn(view.resolve, entries, ASYNC);
    const scheduled = annotationIn(view.resolve, entries, SCHEDULED);
    const future = fn !== undefined && view.is(returnTypeOf(view, fn), COMPLETABLE_FUTURE);
    return [
      ...(async !== undefined && async.arguments.length === 0
        ? [{ ...report('SpringAsyncExecutor', declared, symbol), key: `${symbol}:executor` }]
        : []),
      ...(async !== undefined && fn !== undefined && !future
        ? [{ ...report('SpringAsyncExecutor', declared, symbol), key: `${symbol}:future` }]
        : []),
      ...(scheduled?.arguments.some(({ name }) => ['fixedRate', 'fixedRateString'].includes(name))
        ? [report('SpringScheduledFixedDelay', declared, symbol)]
        : []),
    ];
  });
}

export const PROXY_RULES = [proxyVisibility, selfCalls, transactionAnnotations, scheduling];
