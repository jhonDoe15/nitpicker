import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, depthFirst, nameOf } from '../../typed/node-views.mts';
import { childrenOf } from '../scope/close-owners.mts';
import { isCloseName, isFunctionNode, type FunctionNode } from '../scope/close-scopes.mts';
import {
  calleeProperty,
  callsIn,
  hookCallbackOf,
  nearestClass,
  reactComponent,
} from '../shared/scopes.mts';

const EFFECT_HOOKS = new Set<string>(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const STATE_HOOKS = new Set<string>(['useState', 'useReducer']);
const UNMOUNT_NAMES = new Set<string>([
  'disconnectedCallback',
  'ngOnDestroy',
  'componentWillUnmount',
]);
const GLOBAL_OWNERS = new Set<string>(['window', 'globalThis', 'global', 'self']);
const LIVENESS = /^_?(is)?(mounted|unmounted|disposed|destroyed|closed|alive)$/iu;
const ABORTERS = new Set<string>(['abort', 'destroy', 'close', 'kill']);

export function discardedTimeout(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee, parent } = call;
  const global =
    callee.type === AST_NODE_TYPES.Identifier
      ? callee.name === 'setTimeout'
      : callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        GLOBAL_OWNERS.has(nameOf(callee.object) ?? '') &&
        nameOf(callee.property) === 'setTimeout';
  const callback = call.arguments[0];
  return global && parent.type === AST_NODE_TYPES.ExpressionStatement ? callback : undefined;
}

export function promiseExecutor(call: TSESTree.Node): FunctionNode | undefined {
  const fn = ancestorsOf(call).find(isFunctionNode);
  return fn?.parent.type === AST_NODE_TYPES.NewExpression &&
    nameOf(fn.parent.callee) === 'Promise' &&
    fn.parent.arguments[0] === fn
    ? fn
    : undefined;
}

function settlers(executor: FunctionNode): Set<string> {
  return new Set(
    executor.params.flatMap((param) =>
      param.type === AST_NODE_TYPES.Identifier ? [param.name] : [],
    ),
  );
}

function callsAny(root: TSESTree.Node, names: ReadonlySet<string>): TSESTree.CallExpression[] {
  return callsIn(root).filter(
    (call) => call.callee.type === AST_NODE_TYPES.Identifier && names.has(call.callee.name),
  );
}

function timerAborts(callback: TSESTree.Node, rejectName: string): boolean {
  if (callback.type === AST_NODE_TYPES.Identifier) {
    return callback.name === rejectName;
  }
  return (
    isFunctionNode(callback) &&
    callsIn(callback).some((call) => {
      const name = calleeProperty(call);
      return call.callee.type === AST_NODE_TYPES.Identifier
        ? name === rejectName || ABORTERS.has(name ?? '')
        : ABORTERS.has(name ?? '');
    })
  );
}

export function abandonsPromiseTimer(executor: FunctionNode, callback: TSESTree.Node): boolean {
  const names = settlers(executor);
  const rejectName = executor.params[1] && nameOf(executor.params[1]);
  if (rejectName === undefined || !timerAborts(callback, rejectName)) {
    return false;
  }
  const inTimer = new Set(isFunctionNode(callback) ? callsAny(callback, names) : []);
  return callsAny(executor, names).some((call) => !inTimer.has(call));
}

export function inEffectCallback(call: TSESTree.Node, boundary: FunctionNode): boolean {
  for (const ancestor of ancestorsOf(call)) {
    if (ancestor === boundary) {
      return false;
    }
    if (isFunctionNode(ancestor) && EFFECT_HOOKS.has(hookCallbackOf(ancestor) ?? '')) {
      return true;
    }
  }
  return false;
}

function setterOf(node: TSESTree.Node): string | undefined {
  if (
    node.type !== AST_NODE_TYPES.VariableDeclarator ||
    node.id.type !== AST_NODE_TYPES.ArrayPattern ||
    node.init?.type !== AST_NODE_TYPES.CallExpression ||
    !STATE_HOOKS.has(calleeProperty(node.init) ?? '')
  ) {
    return undefined;
  }
  const setter = node.id.elements[1];
  return setter?.type === AST_NODE_TYPES.Identifier ? setter.name : undefined;
}

export function stateSetters(component: FunctionNode): Set<string> {
  const nodes = [...depthFirst(component.body, childrenOf)];
  return new Set(nodes.flatMap((node) => setterOf(node) ?? []));
}

export function guardsLiveness(callback: TSESTree.Node): boolean {
  if (!isFunctionNode(callback)) {
    return false;
  }
  const nodes = [...depthFirst(callback.body, childrenOf)];
  const tests = nodes.flatMap((node) =>
    node.type === AST_NODE_TYPES.IfStatement ? [node.test] : [],
  );
  return tests.some((test) =>
    [...depthFirst(test, childrenOf)].some((node) => LIVENESS.test(nameOf(node) ?? '')),
  );
}

export function updatesComponent(callback: TSESTree.Node, setters: ReadonlySet<string>): boolean {
  return callsAny(callback, setters).length > 0;
}

export function clearsTimeouts(root: TSESTree.Node): boolean {
  return callsIn(root).some((call) => calleeProperty(call) === 'clearTimeout');
}

export function disposableClass(classBody: TSESTree.ClassBody): boolean {
  return classBody.body.some((member) => {
    const name = member.type === AST_NODE_TYPES.MethodDefinition ? nameOf(member.key) : undefined;
    return name !== undefined && (isCloseName(name) || UNMOUNT_NAMES.has(name));
  });
}

export function usesThis(callback: TSESTree.Node): boolean {
  return [...depthFirst(callback, childrenOf)].some(
    (node) => node.type === AST_NODE_TYPES.ThisExpression,
  );
}

export { nearestClass, reactComponent };
