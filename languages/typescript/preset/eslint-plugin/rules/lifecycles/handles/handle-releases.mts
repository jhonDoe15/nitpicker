import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, depthFirst, nameOf, type SourceCode } from '../../typed/node-views.mts';
import { childrenOf, closersOf } from '../scope/close-owners.mts';
import { isFunctionNode, type FunctionNode } from '../scope/close-scopes.mts';

export type ContainerWithClosers = {
  readonly container: TSESTree.ClassBody | FunctionNode;
  readonly closers: readonly FunctionNode[];
};

const REMOVE_METHODS = new Set<string>([
  'off',
  'removeListener',
  'removeEventListener',
  'removeAllListeners',
]);
const OWNER_RELEASES = new Set<string>([
  'close',
  'destroy',
  'end',
  'terminate',
  'dispose',
  'disconnect',
  'stop',
]);
const CLEARERS = new Set<string>(['clearTimeout', 'clearInterval']);

export function isOneShot(call: TSESTree.CallExpression): boolean {
  const options = call.arguments[2];
  return (
    options?.type === AST_NODE_TYPES.ObjectExpression &&
    options.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        !property.computed &&
        (nameOf(property.key) === 'signal' ||
          (nameOf(property.key) === 'once' &&
            property.value.type === AST_NODE_TYPES.Literal &&
            property.value.value === true)),
    )
  );
}

export function containerWithClosers(node: TSESTree.Node): ContainerWithClosers | undefined {
  const container = ancestorsOf(node).find(
    (ancestor): ancestor is TSESTree.ClassBody | FunctionNode =>
      (ancestor.type === AST_NODE_TYPES.ClassBody || isFunctionNode(ancestor)) &&
      closersOf(ancestor).length > 0,
  );
  return container === undefined ? undefined : { container, closers: closersOf(container) };
}

export function runsOnce(
  call: TSESTree.Node,
  owner: { readonly container: TSESTree.Node },
): boolean {
  const fn = ancestorsOf(call).find(isFunctionNode);
  const isConstructor =
    fn?.parent.type === AST_NODE_TYPES.MethodDefinition && fn.parent.kind === 'constructor';
  return fn === owner.container || isConstructor;
}

function callsIn(container: TSESTree.Node): TSESTree.CallExpression[] {
  return [...depthFirst(container, childrenOf)].filter(
    (node): node is TSESTree.CallExpression => node.type === AST_NODE_TYPES.CallExpression,
  );
}

export function normalized(sourceCode: SourceCode, node: TSESTree.Node): string {
  return sourceCode
    .getText(node)
    .replace(/!(?!=)/gu, '')
    .replace(/\s+as\s+\w+/gu, '')
    .replace(/^(?:window|globalThis)\./u, '');
}

function aliasesOf(sourceCode: SourceCode, container: TSESTree.Node, text: string): Set<string> {
  const declared = [...depthFirst(container, childrenOf)];
  return new Set([
    text,
    ...declared.flatMap((node) =>
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.id.type === AST_NODE_TYPES.Identifier &&
      node.init !== null &&
      normalized(sourceCode, node.init) === text
        ? [node.id.name]
        : [],
    ),
  ]);
}

export function releasesListener(
  sourceCode: SourceCode,
  container: TSESTree.Node,
  receiverText: string,
): boolean {
  const names = aliasesOf(sourceCode, container, receiverText);
  return callsIn(container).some((call) => {
    const { callee } = call;
    return (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      names.has(normalized(sourceCode, callee.object)) &&
      (REMOVE_METHODS.has(nameOf(callee.property) ?? '') ||
        OWNER_RELEASES.has(nameOf(callee.property) ?? ''))
    );
  });
}

export function clearsHandle(
  sourceCode: SourceCode,
  container: TSESTree.Node,
  handleText: string,
): boolean {
  const names = aliasesOf(sourceCode, container, handleText);
  return callsIn(container).some((call) => {
    const callee =
      call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.property : call.callee;
    const [argument] = call.arguments;
    return (
      callee.type === AST_NODE_TYPES.Identifier &&
      CLEARERS.has(callee.name) &&
      argument !== undefined &&
      names.has(normalized(sourceCode, argument))
    );
  });
}

export function timerHandle(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { parent } = call;
  if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === call) {
    return parent.left;
  }
  return parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === call
    ? parent.id
    : undefined;
}

export function insidePromiseExecutor(call: TSESTree.Node): boolean {
  return ancestorsOf(call).some(
    (ancestor) =>
      isFunctionNode(ancestor) &&
      ancestor.parent.type === AST_NODE_TYPES.NewExpression &&
      nameOf(ancestor.parent.callee) === 'Promise',
  );
}
