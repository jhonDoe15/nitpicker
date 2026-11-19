import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  contains,
  depthFirst,
  scopeChain,
  type SourceCode,
} from '../../typed/node-views.mts';
import { childrenOf } from '../scope/close-owners.mts';
import { isFunctionNode, type FunctionNode } from '../scope/close-scopes.mts';
import { calleeProperty, callsIn } from '../shared/scopes.mts';

const COMPARISONS = new Set<string>(['===', '!==', '==', '!=']);

export type Registration = {
  readonly owner: FunctionNode;
  readonly map: string;
  readonly key: string;
  readonly value: string;
};

function receiverOf(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  return call.callee.type === AST_NODE_TYPES.MemberExpression && !call.callee.computed
    ? call.callee.object
    : undefined;
}

function rootName(node: TSESTree.Node): string | undefined {
  const pending = [node];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      pending.push(current.object);
    } else {
      return current.type === AST_NODE_TYPES.Identifier ? current.name : undefined;
    }
  }
  return undefined;
}

function isParameterOf(fn: FunctionNode, name: string | undefined): boolean {
  return fn.params.some((param) => {
    const target = param.type === AST_NODE_TYPES.AssignmentPattern ? param.left : param;
    return target.type === AST_NODE_TYPES.Identifier && target.name === name;
  });
}

function sharedMap(sourceCode: SourceCode, map: TSESTree.Node, owner: FunctionNode): boolean {
  const root = rootName(map);
  if (map.type === AST_NODE_TYPES.MemberExpression && root === undefined) {
    return map.object.type === AST_NODE_TYPES.ThisExpression;
  }
  if (map.type === AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const variable = scopeChain(sourceCode.getScope(owner))
    .map((scope) => scope.set.get(root ?? ''))
    .find((found) => found !== undefined);
  return (
    variable !== undefined && variable.defs.every((definition) => !contains(owner, definition.node))
  );
}

function isOwnKey(owner: FunctionNode, key: TSESTree.Node): boolean {
  return key.type === AST_NODE_TYPES.Literal || isParameterOf(owner, rootName(key));
}

function argumentIs(call: TSESTree.CallExpression, text: string, sourceCode: SourceCode): boolean {
  const [first] = call.arguments;
  return first !== undefined && sourceCode.getText(first) === text;
}

function ownerSet(
  sourceCode: SourceCode,
  found: { readonly calls: TSESTree.CallExpression[]; readonly owner: FunctionNode },
  del: TSESTree.CallExpression,
): TSESTree.CallExpression | undefined {
  const [key] = del.arguments;
  const keyText = key === undefined ? '' : sourceCode.getText(key);
  return found.calls.find(
    (call) =>
      calleeProperty(call) === 'set' &&
      call.arguments.length === 2 &&
      call.range[1] <= del.range[0] &&
      argumentIs(call, keyText, sourceCode) &&
      !ancestorsOf(call).some(
        (ancestor) =>
          isFunctionNode(ancestor) &&
          ancestor !== found.owner &&
          contains(found.owner, ancestor) &&
          contains(ancestor, del),
      ),
  );
}

function rejectsDuplicates(
  found: {
    readonly calls: TSESTree.CallExpression[];
    readonly owner: FunctionNode;
    readonly sourceCode: SourceCode;
  },
  set: TSESTree.CallExpression | undefined,
  keyText: string,
): boolean {
  const { sourceCode } = found;
  return (
    callsIn(found.owner).some((call) => calleeProperty(call) === 'clearTimeout') ||
    found.calls.some((call) => {
      const name = calleeProperty(call);
      const reads =
        name === 'has' || (name === 'get' && set !== undefined && call.range[1] <= set.range[0]);
      return reads && argumentIs(call, keyText, sourceCode);
    })
  );
}

function registrationIn(
  sourceCode: SourceCode,
  owner: FunctionNode,
  del: TSESTree.CallExpression,
): Registration | undefined {
  const map = receiverOf(del);
  const [key] = del.arguments;
  if (map === undefined || key === undefined || !sharedMap(sourceCode, map, owner)) {
    return undefined;
  }
  const mapText = sourceCode.getText(map);
  const keyText = sourceCode.getText(key);
  const calls = callsIn(owner).filter((call) => {
    const receiver = receiverOf(call);
    return receiver !== undefined && sourceCode.getText(receiver) === mapText;
  });
  const set = ownerSet(sourceCode, { calls, owner }, del);
  const value = set?.arguments[1];
  return value?.type === AST_NODE_TYPES.Identifier &&
    isOwnKey(owner, key) &&
    !rejectsDuplicates({ calls, owner, sourceCode }, set, keyText) &&
    sourceCode.getText(value) !== keyText
    ? { owner, map: mapText, key: keyText, value: value.name }
    : undefined;
}

export function laterRegistration(
  sourceCode: SourceCode,
  del: TSESTree.CallExpression,
  teardown: FunctionNode,
): Registration | undefined {
  const owners = ancestorsOf(teardown).filter(isFunctionNode);
  return owners
    .map((owner) => registrationIn(sourceCode, owner, del))
    .find((found) => found !== undefined);
}

function readsEntry(text: string, entry: string, value: string): boolean {
  return (
    text === entry ||
    text.startsWith(`${entry}?.`) ||
    (/^[A-Za-z_$][\w$]*$/u.test(text) && text !== value && text !== 'undefined')
  );
}

function aliasOf(node: TSESTree.Node, value: string): string | undefined {
  return node.type === AST_NODE_TYPES.VariableDeclarator &&
    node.id.type === AST_NODE_TYPES.Identifier &&
    node.init?.type === AST_NODE_TYPES.Identifier &&
    node.init.name === value
    ? node.id.name
    : undefined;
}

function aliasesOf(owner: FunctionNode, value: string): Set<string> {
  const nodes = [...depthFirst(owner, childrenOf)];
  return new Set([value, ...nodes.flatMap((node) => aliasOf(node, value) ?? [])]);
}

export function comparesEntry(
  sourceCode: SourceCode,
  teardown: FunctionNode,
  registration: Registration,
): boolean {
  const entry = `${registration.map}.get(${registration.key})`;
  const names = aliasesOf(registration.owner, registration.value);
  return [...depthFirst(teardown, childrenOf)].some((node) => {
    if (node.type !== AST_NODE_TYPES.BinaryExpression || !COMPARISONS.has(node.operator)) {
      return false;
    }
    const [left, right] = [node.left, node.right].map((side) => sourceCode.getText(side));
    return (
      left !== undefined &&
      right !== undefined &&
      ((names.has(left) && readsEntry(right, entry, left)) ||
        (names.has(right) && readsEntry(left, entry, right)))
    );
  });
}
