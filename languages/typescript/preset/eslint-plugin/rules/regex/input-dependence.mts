import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue, type SourceContext } from '../analysis/constant-resolution.mts';
import { isNode, nameOf, type SourceCode } from '../typed/node-views.mts';

type Node = TSESTree.Node;
type Next = { readonly input?: true; readonly value?: Node | undefined };

const { DefinitionType } = TSESLint.Scope;

const ESCAPE_NAME = /escape/iu;
const PATTERN_NAME = /reg|pattern/iu;
const REPLACE_METHODS = new Set<string>(['replace', 'replaceAll']);
const MATCHED_TEXT = String.raw`\$&`;
const MAX_DEPTH = 8;
const MODULE_SCOPES = new Set<string>(['module', 'global']);

function isNamedEscape(node: Node): boolean {
  const named =
    node.type === AST_NODE_TYPES.Identifier || node.type === AST_NODE_TYPES.PrivateIdentifier;
  return named && ESCAPE_NAME.test(node.name) && PATTERN_NAME.test(node.name);
}

function isRegExpEscape(node: Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === 'RegExp' &&
    nameOf(node.property) === 'escape'
  );
}

function isInlineEscape(node: Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    REPLACE_METHODS.has(nameOf(node.callee.property) ?? '') &&
    stringValue(node.arguments[1]) === MATCHED_TEXT
  );
}

function isEscape(node: Node): boolean {
  return isNamedEscape(node) || isRegExpEscape(node) || isInlineEscape(node);
}

function valueChildren(visitorKeys: SourceCode['visitorKeys'], node: Node): Node[] {
  return node.type === AST_NODE_TYPES.ConditionalExpression
    ? [node.consequent, node.alternate]
    : childNodes(visitorKeys, node);
}

function childNodes(visitorKeys: SourceCode['visitorKeys'], node: Node): Node[] {
  const keys = visitorKeys[node.type] ?? [];
  return keys
    .flatMap((key): unknown[] => {
      const child: unknown = Reflect.get(node, key) ?? [];
      return Array.isArray(child) ? child : [child];
    })
    .filter(isNode);
}

function isNameOnly(parent: Node | undefined, node: Node): boolean {
  return (
    (parent?.type === AST_NODE_TYPES.MemberExpression &&
      parent.property === node &&
      !parent.computed) ||
    (parent?.type === AST_NODE_TYPES.Property && parent.key === node && !parent.computed)
  );
}

function referencedIdentifiers(
  visitorKeys: SourceCode['visitorKeys'],
  root: Node,
): TSESTree.Identifier[] | undefined {
  const pending: { node: Node; parent: Node | undefined }[] = [{ node: root, parent: undefined }];
  const identifiers: TSESTree.Identifier[] = [];
  for (const { node, parent } of pending) {
    if (isEscape(node)) {
      return undefined;
    }
    if (node.type === AST_NODE_TYPES.Identifier && !isNameOnly(parent, node)) {
      identifiers.push(node);
    }
    pending.push(
      ...valueChildren(visitorKeys, node).map((child) => ({ node: child, parent: node })),
    );
  }
  return identifiers;
}

function callbackReceiver(fn: Node): Node | undefined {
  const call = fn.parent;
  return call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.some((argument) => argument === fn) &&
    call.callee.type === AST_NODE_TYPES.MemberExpression
    ? call.callee.object
    : undefined;
}

function boundValue(definition: TSESLint.Scope.Definitions.VariableDefinition): Node | undefined {
  const { init } = definition.node;
  if (init !== null) {
    return init;
  }
  const holder = definition.parent.parent;
  return holder.type === AST_NODE_TYPES.ForOfStatement ||
    holder.type === AST_NODE_TYPES.ForInStatement
    ? holder.right
    : undefined;
}

function nextValue(context: SourceContext, identifier: TSESTree.Identifier): Next {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (variable === undefined || definition === undefined) {
    return {};
  }
  if (definition.type === DefinitionType.Parameter) {
    const receiver = callbackReceiver(definition.node);
    return receiver === undefined ? { input: true } : { value: receiver };
  }
  if (definition.type !== DefinitionType.Variable || MODULE_SCOPES.has(variable.scope.type)) {
    return {};
  }
  return { value: boundValue(definition) };
}

function nextNodes(context: SourceContext, current: Node, depth: number): Next[] {
  const identifiers =
    depth > MAX_DEPTH ? [] : referencedIdentifiers(context.sourceCode.visitorKeys, current);
  return (identifiers ?? []).map((identifier) => nextValue(context, identifier));
}

export function dependsOnInput(context: SourceContext, node: Node): boolean {
  const pending: { node: Node; depth: number }[] = [{ node, depth: 0 }];
  for (const { node: current, depth } of pending) {
    const next = nextNodes(context, current, depth);
    if (next.some(({ input }) => input)) {
      return true;
    }
    pending.push(
      ...next.flatMap(({ value }) =>
        value === undefined ? [] : [{ node: value, depth: depth + 1 }],
      ),
    );
  }
  return false;
}
