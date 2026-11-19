import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { scopeChain } from '../typed/node-views.mts';
import type { Chunk } from './chunk-sources.mts';

export type Use =
  | { readonly kind: 'collected'; readonly node: TSESTree.Node; readonly target: string }
  | { readonly kind: 'decoded'; readonly node: TSESTree.Node }
  | { readonly kind: 'matched'; readonly node: TSESTree.Node; readonly method: string };

const MATCHERS = new Set(['includes', 'indexOf', 'startsWith', 'endsWith', 'match', 'search']);
const TEXT_ENCODINGS = new Set(['utf8', 'utf-8']);

function isTextCall(call: TSESTree.CallExpression, chunk: TSESTree.Node): boolean {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'String' && call.arguments[0] === chunk;
  }
  const decodes =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object === chunk &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'toString';
  const [encoding] = call.arguments;
  const text =
    encoding === undefined ||
    (encoding.type === AST_NODE_TYPES.Literal && TEXT_ENCODINGS.has(String(encoding.value)));
  return decodes && text;
}

function asText(identifier: TSESTree.Identifier): TSESTree.Node {
  const parent = identifier.parent;
  const call = parent.type === AST_NODE_TYPES.MemberExpression ? parent.parent : parent;
  const wrapped = call.type === AST_NODE_TYPES.CallExpression && isTextCall(call, identifier);
  return wrapped ? call : identifier;
}

function textNodes(
  sourceCode: Readonly<TSESLint.SourceCode>,
  identifier: TSESTree.Identifier,
): TSESTree.Node[] {
  const text = asText(identifier);
  const declarator = text.parent;
  const alias =
    text !== identifier &&
    declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.init === text &&
    declarator.id.type === AST_NODE_TYPES.Identifier
      ? sourceCode.getDeclaredVariables(declarator)[0]
      : undefined;
  const aliased = (alias?.references ?? [])
    .filter((reference) => reference.init !== true)
    .map((reference) => reference.identifier);
  return [text, ...aliased];
}

function targetName(
  sourceCode: Readonly<TSESLint.SourceCode>,
  target: TSESTree.Node,
  inside: TSESTree.Node,
): string | undefined {
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return sourceCode.getText(target);
  }
  if (target.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = scopeChain(sourceCode.getScope(inside))
    .map((scope) => scope.set.get(target.name))
    .find((found) => found !== undefined);
  if (variable === undefined) {
    return undefined;
  }
  const declaredInside = variable.identifiers.some(
    (id) => id.range[0] >= inside.range[0] && id.range[1] <= inside.range[1],
  );
  return declaredInside ? undefined : target.name;
}

function isCollected(
  sourceCode: Readonly<TSESLint.SourceCode>,
  text: TSESTree.Node,
  inside: TSESTree.Node,
): string | undefined {
  const parent = text.parent;
  if (parent?.type !== AST_NODE_TYPES.AssignmentExpression || parent.right !== text) {
    return undefined;
  }
  return parent.operator === '+=' ? targetName(sourceCode, parent.left, inside) : undefined;
}

function hasStreamOption(argument: TSESTree.CallExpressionArgument | undefined): boolean {
  if (argument === undefined) {
    return false;
  }
  return (
    argument.type !== AST_NODE_TYPES.ObjectExpression ||
    argument.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.SpreadElement ||
        (property.key.type === AST_NODE_TYPES.Identifier && property.key.name === 'stream'),
    )
  );
}

function matchedBy(text: TSESTree.Node): string | undefined {
  const parent = text.parent;
  if (
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === text &&
    parent.property.type === AST_NODE_TYPES.Identifier &&
    MATCHERS.has(parent.property.name) &&
    parent.parent.type === AST_NODE_TYPES.CallExpression &&
    parent.parent.callee === parent
  ) {
    return parent.property.name;
  }
  const isTest =
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === text &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    parent.callee.property.type === AST_NODE_TYPES.Identifier &&
    parent.callee.property.name === 'test';
  return isTest ? 'test' : undefined;
}

function decodeCall(
  identifier: TSESTree.Identifier,
  isDecoder: (receiver: TSESTree.Node) => boolean,
): TSESTree.CallExpression | undefined {
  const parent = identifier.parent;
  const decode =
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === identifier &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    parent.callee.property.type === AST_NODE_TYPES.Identifier &&
    parent.callee.property.name === 'decode' &&
    isDecoder(parent.callee.object);
  return decode && !hasStreamOption(parent.arguments[1]) ? parent : undefined;
}

function textUses(
  sourceCode: Readonly<TSESLint.SourceCode>,
  identifier: TSESTree.Identifier,
  scopeNode: TSESTree.Node,
): Use[] {
  return textNodes(sourceCode, identifier).flatMap((text): Use[] => {
    const target = isCollected(sourceCode, text, scopeNode);
    const method = matchedBy(text);
    if (target !== undefined) {
      return [{ kind: 'collected', node: text.parent ?? text, target }];
    }
    return method === undefined ? [] : [{ kind: 'matched', node: text.parent ?? text, method }];
  });
}

export function usesOf(
  sourceCode: Readonly<TSESLint.SourceCode>,
  chunk: Chunk,
  isDecoder: (receiver: TSESTree.Node) => boolean,
): Use[] {
  return chunk.variable.references.flatMap((reference): Use[] => {
    const identifier = reference.identifier;
    if (identifier.type !== AST_NODE_TYPES.Identifier || reference.init === true) {
      return [];
    }
    const decoded = decodeCall(identifier, isDecoder);
    return decoded === undefined
      ? textUses(sourceCode, identifier, chunk.scopeNode)
      : [{ kind: 'decoded', node: decoded }];
  });
}
