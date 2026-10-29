import { importedBindings, isBindCall } from '../security/imported-names.mjs';
import { typeServices } from '../security/security-values.mjs';
import { isEstreeConsumed, isTerminalMethod } from './flow/consumed.mjs';
import { estreeCallView } from './io/call-views.mjs';
import { directEffects, namedKind } from './io/call-tags.mjs';
import { libraryKind, messagePackages } from './io/packages.mjs';
import {
  programMayPublish,
  programState,
  typedCallEffects,
  typedReferenceEffects,
} from './io/summaries.mjs';
import { calleeOrigin as typedCalleeOrigin } from './io/typed-calls.mjs';
import { memoized } from './memo.mjs';

const KINDS = ['database', 'remote', 'message'];
const untypedCache = new WeakMap();

function untypedEffects(call, sourceCode) {
  const view = estreeCallView(call);
  const binding = view.root && importedBindings(sourceCode.ast).get(view.root.name);
  const pkg = binding?.module;
  function isAsync(builder) {
    return !builder || isTerminalMethod(view.method) || isEstreeConsumed(call);
  }
  const kind = pkg === undefined ? undefined : libraryKind(pkg, view, isAsync);
  return directEffects(kind ?? namedKind(view), pkg, view);
}

export function callEffects(call, context) {
  const services = typeServices(context);
  return services === undefined
    ? memoized(untypedCache, call, () => untypedEffects(call, context.sourceCode))
    : typedCallEffects(services.esTreeNodeToTSNodeMap.get(call), services.program);
}

export function ioEffect(call, context) {
  const effects = callEffects(call, context);
  const kind = KINDS.find((each) => effects.has(each));
  if (kind === undefined) {
    return undefined;
  }
  const path = effects.get(kind);
  return { kind, path, cache: effects.get('cache')?.join() === path.join() };
}

export function ioKind(call, context) {
  return ioEffect(call, context)?.kind;
}

export function calleeOrigin(call, context) {
  const services = typeServices(context);
  return services === undefined
    ? undefined
    : typedCalleeOrigin(programState(services.program), services.esTreeNodeToTSNodeMap.get(call));
}

export function mayPublish(context) {
  const services = typeServices(context);
  if (services !== undefined) {
    return programMayPublish(services.program);
  }
  const modules = new Set(
    [...importedBindings(context.sourceCode.ast).values()].map(({ module }) => module),
  );
  return messagePackages().some((name) => modules.has(name));
}

export function referenceEffects(node, context) {
  const services = typeServices(context);
  const target = isBindCall(node) ? node.callee.object : node;
  return services === undefined
    ? new Map()
    : typedReferenceEffects(services.esTreeNodeToTSNodeMap.get(target), services.program);
}

export function describePath(path) {
  return path.map((label) => `\`${label}\``).join(', which calls ');
}

export function chainOuterCall(call) {
  const member = call.parent;
  const outer = member?.parent;
  const isLink =
    member?.type === 'MemberExpression' &&
    member.object === call &&
    outer?.type === 'CallExpression' &&
    outer.callee === member;
  return isLink ? outer : undefined;
}
