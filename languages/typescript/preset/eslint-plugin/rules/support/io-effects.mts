import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { importedBindings, isBindCall } from '../security/imported-names.mts';
import { typeServices, type Context } from '../security/security-values.mts';
import { isEstreeConsumed, isTerminalMethod } from './flow/consumed.mts';
import { estreeCallView } from './io/call-views.mts';
import { directEffects, namedKind, type Effects } from './io/call-tags.mts';
import { isKnownPackage, libraryKind, messagePackages, type IoKind } from './io/packages.mts';
import {
  programMayPublish,
  programState,
  typedCallEffects,
  typedReferenceEffects,
} from './io/summaries.mts';
import { calleeOrigin as typedCalleeOrigin, type CalleeOrigin } from './io/typed-calls.mts';
import { cachedValue } from '../../../../../../shared/values/caching/cached-value.mts';

type IoCall = TSESTree.CallExpression | TSESTree.TaggedTemplateExpression;
type IoEffect = {
  readonly kind: IoKind;
  readonly path: readonly string[];
  readonly cache: boolean;
};

const KINDS: readonly IoKind[] = ['database', 'remote', 'message'];
const untypedCache = new WeakMap<IoCall, Effects>();

function untypedEffects(call: IoCall, context: Context): Effects {
  const { sourceCode } = context;
  const view = estreeCallView(call, context);
  const binding =
    view.root === undefined ? undefined : importedBindings(sourceCode.ast).get(view.root.name);
  const pkg = binding?.module;
  function isAsync() {
    return isTerminalMethod(view.method) || isEstreeConsumed(call);
  }
  const known = pkg !== undefined && isKnownPackage(pkg);
  const kind = known ? libraryKind(pkg, view, isAsync) : namedKind(view);
  return directEffects(kind, pkg, view);
}

export function callEffects(call: IoCall, context: Context): Effects {
  const services = typeServices(context);
  return services === undefined
    ? cachedValue(untypedCache, call, () => untypedEffects(call, context))
    : typedCallEffects(services.esTreeNodeToTSNodeMap.get(call), services.program);
}

export function ioEffect(call: IoCall, context: Context): IoEffect | undefined {
  const effects = callEffects(call, context);
  const kind = KINDS.find((each) => effects.has(each));
  const path = kind === undefined ? undefined : effects.get(kind);
  if (kind === undefined || path === undefined) {
    return undefined;
  }
  return { kind, path, cache: effects.get('cache')?.join() === path.join() };
}

export function ioKind(call: IoCall, context: Context): IoKind | undefined {
  return ioEffect(call, context)?.kind;
}

export function calleeOrigin(call: IoCall, context: Context): CalleeOrigin | undefined {
  const services = typeServices(context);
  return services === undefined
    ? undefined
    : typedCalleeOrigin(programState(services.program), services.esTreeNodeToTSNodeMap.get(call));
}

export function mayPublish(context: Context): boolean {
  const services = typeServices(context);
  if (services !== undefined) {
    return programMayPublish(services.program);
  }
  const modules = new Set(
    [...importedBindings(context.sourceCode.ast).values()].map(({ module }) => module),
  );
  return messagePackages().some((name) => modules.has(name));
}

export function referenceEffects(node: TSESTree.Node, context: Context): Effects {
  const services = typeServices(context);
  const target = isBindCall(node) ? node.callee.object : node;
  return services === undefined
    ? new Map<string, string[]>()
    : typedReferenceEffects(services.esTreeNodeToTSNodeMap.get(target), services.program);
}

export function describePath(path: readonly string[]): string {
  return path.map((label) => `\`${label}\``).join(', which calls ');
}

export function chainOuterCall(call: IoCall): TSESTree.CallExpression | undefined {
  const member = call.parent;
  const outer = member.parent;
  const isLink =
    member.type === AST_NODE_TYPES.MemberExpression &&
    member.object === call &&
    outer?.type === AST_NODE_TYPES.CallExpression &&
    outer.callee === member;
  return isLink ? outer : undefined;
}
