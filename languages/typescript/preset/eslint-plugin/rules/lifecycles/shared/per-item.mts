import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, depthFirst, nameOf } from '../../typed/node-views.mts';
import { childrenOf } from '../scope/close-owners.mts';
import { functionName, isFunctionNode, type FunctionNode } from '../scope/close-scopes.mts';
import {
  calleeProperty,
  enclosingMethod,
  insideLoop,
  isConstructorFunction,
  nearestClass,
  nearestFunction,
} from './scopes.mts';

const HANDLER_NAME = /^(on|handle)[A-Z]/u;
const SUBSCRIBER = /^(on|once|addListener|prependListener|addEventListener|subscribe|on[A-Z]\w*)$/u;
const ONE_TIME_NAME = new RegExp(
  '^(init|setup|activate|register|create|mount|connect|bootstrap|start|configure|install|build|' +
    'ngOnInit|componentDidMount|firstUpdated|onInit)',
  'iu',
);

export function isOneTimeName(name: string): boolean {
  return ONE_TIME_NAME.test(name);
}

function thisReferences(classBody: TSESTree.ClassBody, name: string): TSESTree.MemberExpression[] {
  return [...depthFirst(classBody, childrenOf)].filter(
    (node): node is TSESTree.MemberExpression =>
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.ThisExpression &&
      nameOf(node.property) === name,
  );
}

function isCalled(ref: TSESTree.MemberExpression): boolean {
  return ref.parent.type === AST_NODE_TYPES.CallExpression && ref.parent.callee === ref;
}

function givenToSubscriber(node: TSESTree.Node): boolean {
  const { parent } = node;
  return (
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some((argument) => argument === node) &&
    SUBSCRIBER.test(calleeProperty(parent) ?? '')
  );
}

function boundForm(ref: TSESTree.MemberExpression): TSESTree.Node {
  const { parent } = ref;
  const bound =
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === ref &&
    nameOf(parent.property) === 'bind' &&
    parent.parent.type === AST_NODE_TYPES.CallExpression;
  return bound ? parent.parent : ref;
}

function calledPerItem(ref: TSESTree.MemberExpression): boolean {
  if (
    ancestorsOf(ref).some((ancestor) => isFunctionNode(ancestor) && givenToSubscriber(ancestor))
  ) {
    return true;
  }
  const caller = enclosingMethod(ref);
  return caller !== undefined && !isConstructorFunction(caller) && insideLoop(ref, caller);
}

function usedPerItem(classBody: TSESTree.ClassBody, name: string): boolean {
  return thisReferences(classBody, name).some((ref) =>
    isCalled(ref) ? calledPerItem(ref) : givenToSubscriber(boundForm(ref)),
  );
}

function runsOnlyOnInit(classBody: TSESTree.ClassBody, name: string): boolean {
  const refs = thisReferences(classBody, name);
  return (
    refs.length > 0 &&
    refs.every((ref) => {
      const host = nearestFunction(ref);
      return isCalled(ref) && (host === undefined || isConstructorFunction(host));
    })
  );
}

export type PerItemMethod = { readonly method: FunctionNode; readonly name: string };

function isAccessor(method: FunctionNode): boolean {
  return (
    method.parent.type === AST_NODE_TYPES.MethodDefinition &&
    (method.parent.kind === 'get' || method.parent.kind === 'set')
  );
}

export function perItemMethod(node: TSESTree.Node): PerItemMethod | undefined {
  const method = enclosingMethod(node);
  const name = method === undefined ? undefined : functionName(method);
  const classBody = nearestClass(node);
  if (
    method === undefined ||
    name === undefined ||
    classBody === undefined ||
    isConstructorFunction(method) ||
    isAccessor(method) ||
    isOneTimeName(name) ||
    runsOnlyOnInit(classBody, name)
  ) {
    return undefined;
  }
  const perItem =
    HANDLER_NAME.test(name) || insideLoop(node, method) || usedPerItem(classBody, name);
  return perItem ? { method, name } : undefined;
}
