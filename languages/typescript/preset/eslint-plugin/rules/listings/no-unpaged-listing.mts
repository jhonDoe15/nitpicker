import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { ancestorsOf, depthFirst, nodeChildren, type SourceCode } from '../typed/node-views.mts';
import { unwrapped } from '../typed/syntax-views.mts';

type MessageId = 'listing' | 'search';
type Node = TSESTree.Node;

const COMMANDS = new Set([
  'ListObjectsV2Command',
  'ListObjectsCommand',
  'ListObjectVersionsCommand',
]);
const CLIENT_CALLS = new Set(['listObjectsV2', 'listObjects', 'listObjectVersions']);
const MARKERS = new Set([
  'NextContinuationToken',
  'ContinuationToken',
  'IsTruncated',
  'NextMarker',
  'Marker',
  'KeyMarker',
  'NextKeyMarker',
  'NextVersionIdMarker',
  'StartAfter',
  'paginateListObjectsV2',
  'paginateListObjects',
  'paginateListObjectVersions',
]);
const SEARCH_LIMITS = new Set(['LIMIT', 'limit']);
const RESULT_PARTS = new Set(['promise', 'KeyCount', 'Contents', 'length']);
const TEST_OPERATORS = new Set(['>', '>=', '<', '<=', '===', '!==', '==', '!=']);

function namesIn(root: Node): Set<string> {
  const names = new Set<string>();
  for (const node of depthFirst<Node>(root, nodeChildren)) {
    if (node.type === AST_NODE_TYPES.Identifier) {
      names.add(node.name);
    } else if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
      names.add(node.value);
    }
  }
  return names;
}

function scopeOf(node: Node): Node {
  const ancestors = ancestorsOf(node);
  return ancestors.find((each) => isFunctionNode(each)) ?? ancestors.at(-1) ?? node;
}

function objectKeys(node: Node | undefined): Set<string> | undefined {
  const inner = node === undefined ? undefined : unwrapped(node);
  if (inner?.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const keys = new Set<string>();
  for (const property of inner.properties) {
    if (property.type !== AST_NODE_TYPES.Property) {
      return undefined;
    }
    const { key } = property;
    keys.add(
      key.type === AST_NODE_TYPES.Identifier
        ? key.name
        : String('value' in key ? key.value : undefined),
    );
  }
  return keys;
}

function passesResult(parent: Node | undefined, current: Node): parent is Node {
  return (
    parent !== undefined &&
    (parent.type === AST_NODE_TYPES.AwaitExpression ||
      parent.type === AST_NODE_TYPES.ChainExpression ||
      parent.type === AST_NODE_TYPES.TSNonNullExpression ||
      (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === current) ||
      (parent.type === AST_NODE_TYPES.MemberExpression &&
        parent.object === current &&
        !parent.computed &&
        parent.property.type === AST_NODE_TYPES.Identifier &&
        RESULT_PARTS.has(parent.property.name)))
  );
}

function climbResult(node: Node): Node {
  const chain: Node[] = [node];
  for (const current of chain) {
    const parent = current.parent ?? undefined;
    if (passesResult(parent, current)) {
      chain.push(parent);
    }
  }
  return chain.at(-1) ?? node;
}

function isPresenceTest(node: Node): boolean {
  const parent = node.parent;
  return (
    (parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!') ||
    (parent?.type === AST_NODE_TYPES.BinaryExpression &&
      TEST_OPERATORS.has(parent.operator) &&
      [parent.left, parent.right].some(
        (side) =>
          side !== node && side.type === AST_NODE_TYPES.Literal && typeof side.value === 'number',
      ))
  );
}

function isOnlyPresenceTested(sourceCode: SourceCode, node: Node): boolean {
  const result = climbResult(node);
  if (isPresenceTest(result)) {
    return true;
  }
  const parent = result.parent;
  if (parent?.type !== AST_NODE_TYPES.VariableDeclarator || parent.init !== result) {
    return false;
  }
  const uses = sourceCode
    .getDeclaredVariables(parent)
    .flatMap((variable) => variable.references)
    .filter((reference) => reference.identifier !== parent.id);
  return uses.length > 0 && uses.every((use) => isPresenceTest(climbResult(use.identifier)));
}

function isUnpaged(sourceCode: SourceCode, node: Node, input: Node | undefined): boolean {
  if (isOnlyPresenceTested(sourceCode, node)) {
    return false;
  }
  const keys = objectKeys(input);
  if (keys?.has('MaxKeys') === true || keys?.has('maxKeys') === true) {
    return false;
  }
  const names = namesIn(scopeOf(node));
  return ![...MARKERS].some((marker) => names.has(marker));
}

function isSearchCall(callee: Node): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'search' &&
    callee.object.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.property.type === AST_NODE_TYPES.Identifier &&
    callee.object.property.name === 'ft'
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: { description: 'Follow the page marker of an object-store or search listing' },
    schema: [],
    messages: {
      listing:
        'An object-store listing returns one page (1000 keys) and the rest is ignored. ' +
        'Use the paginator (`paginateListObjectsV2`), or loop on `NextContinuationToken` and `IsTruncated`. ' +
        'An existence check passes `MaxKeys: 1`.',
      search:
        'RediSearch `FT.SEARCH` returns 10 documents by default, so the rest is ignored. ' +
        'Pass `LIMIT: { from: 0, size: n }` and loop on the offset until a page comes back short.',
    },
  },
  create(context) {
    return {
      NewExpression(node) {
        const { callee } = node;
        if (
          callee.type === AST_NODE_TYPES.Identifier &&
          COMMANDS.has(callee.name) &&
          isUnpaged(context.sourceCode, node, node.arguments[0])
        ) {
          context.report({ node, messageId: 'listing' });
        }
      },
      CallExpression(node) {
        const callee = unwrapped(node.callee);
        const [first, second, third] = node.arguments;
        const client =
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          CLIENT_CALLS.has(callee.property.name) &&
          first?.type === AST_NODE_TYPES.ObjectExpression;
        if (client && isUnpaged(context.sourceCode, node, first)) {
          context.report({ node, messageId: 'listing' });
          return;
        }
        if (!isSearchCall(callee) || second === undefined) {
          return;
        }
        const options = objectKeys(third);
        const limited = [...SEARCH_LIMITS].some((limit) => options?.has(limit) === true);
        if (!limited && (third === undefined || options !== undefined)) {
          context.report({ node, messageId: 'search' });
        }
      },
    };
  },
};
