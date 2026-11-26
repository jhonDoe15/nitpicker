import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
import { enclosingFunction, unwrapped } from '../typed/syntax-views.mts';
import {
  SINGLE_SHAPE_MEMBERS,
  fieldNameOf,
  isEmptyList,
  isManifestName,
  isManifestType,
  leavesOf,
} from './manifest-fields.mts';

type Context = Readonly<TSESLint.RuleContext<'singleShape', []>>;

function parsedPackageJson(init: TSESTree.Node | undefined): boolean {
  const call = init === undefined ? undefined : leavesOf(init)[0];
  if (
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    nameOf(call.callee.object) !== 'JSON' ||
    nameOf(call.callee.property) !== 'parse'
  ) {
    return false;
  }
  return [...depthFirst<TSESTree.Node>(call, nodeChildren)].some(
    (node) =>
      node.type === AST_NODE_TYPES.Literal &&
      typeof node.value === 'string' &&
      /(?:^|[\\/])package\.json$/u.test(node.value),
  );
}

function isManifestVariable(context: Context, node: TSESTree.Identifier): boolean {
  const definition = findVariable(context, node, node.name)?.defs[0];
  if (definition === undefined) {
    return false;
  }
  const defNode = definition.node;
  if (defNode.type === AST_NODE_TYPES.VariableDeclarator) {
    return (
      isManifestType(defNode.id.typeAnnotation?.typeAnnotation) ||
      parsedPackageJson(defNode.init ?? undefined)
    );
  }
  return (
    'params' in defNode &&
    defNode.params.some(
      (param) =>
        param.type === AST_NODE_TYPES.Identifier &&
        param.name === node.name &&
        isManifestType(param.typeAnnotation?.typeAnnotation),
    )
  );
}

function isManifest(context: Context, node: TSESTree.Node): boolean {
  const plain = leavesOf(node)[0];
  if (plain === undefined) {
    return false;
  }
  return (
    isManifestName(plain) ||
    (plain.type === AST_NODE_TYPES.Identifier && isManifestVariable(context, plain))
  );
}

function declaresList(context: Context, leaf: TSESTree.MemberExpression): boolean {
  const object = unwrapped(leaf.object);
  const declared =
    object.type === AST_NODE_TYPES.Identifier
      ? findVariable(context, object, object.name)?.defs[0]?.name
      : undefined;
  const type = declared?.type === AST_NODE_TYPES.Identifier ? declared.typeAnnotation : undefined;
  return (
    type?.typeAnnotation.type === AST_NODE_TYPES.TSTypeLiteral &&
    type.typeAnnotation.members.some(
      (member) =>
        member.type === AST_NODE_TYPES.TSPropertySignature &&
        nameOf(member.key) === fieldNameOf(leaf) &&
        (member.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSArrayType ||
          member.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSTupleType),
    )
  );
}

function manifestField(context: Context, node: TSESTree.Node): string | undefined {
  const leaves = leavesOf(node);
  const fields = leaves
    .filter((leaf) => !isEmptyList(leaf))
    .map((leaf) =>
      leaf.type === AST_NODE_TYPES.MemberExpression &&
      isManifest(context, leaf.object) &&
      !declaresList(context, leaf)
        ? fieldNameOf(leaf)
        : undefined,
    );
  const first = fields[0];
  return first !== undefined &&
    SINGLE_SHAPE_MEMBERS.has(first) &&
    fields.every((field) => field !== undefined)
    ? first
    : undefined;
}

function destructuredField(context: Context, node: TSESTree.Identifier): string | undefined {
  const definition = findVariable(context, node, node.name)?.defs[0]?.node;
  if (
    definition?.type !== AST_NODE_TYPES.VariableDeclarator ||
    definition.id.type !== AST_NODE_TYPES.ObjectPattern ||
    definition.init === null ||
    !isManifest(context, definition.init)
  ) {
    return undefined;
  }
  const property = definition.id.properties.find(
    (entry) =>
      entry.type === AST_NODE_TYPES.Property &&
      !entry.computed &&
      (entry.value.type === AST_NODE_TYPES.AssignmentPattern ? entry.value.left : entry.value)
        .type === AST_NODE_TYPES.Identifier &&
      nameOf(
        entry.value.type === AST_NODE_TYPES.AssignmentPattern ? entry.value.left : entry.value,
      ) === node.name,
  );
  const key = property?.type === AST_NODE_TYPES.Property ? nameOf(property.key) : undefined;
  return key !== undefined && SINGLE_SHAPE_MEMBERS.has(key) ? key : undefined;
}

function aliasField(context: Context, node: TSESTree.Identifier): string | undefined {
  const definition = findVariable(context, node, node.name)?.defs[0]?.node;
  return definition?.type === AST_NODE_TYPES.VariableDeclarator &&
    definition.id.type === AST_NODE_TYPES.Identifier &&
    definition.init !== null
    ? manifestField(context, definition.init)
    : destructuredField(context, node);
}

const GUARD_CALL = /^(?:is|has|assert|ensure)[A-Z]/u;
const SHAPE_LITERALS = new Set([true, false]);

function shapeProbe(node: TSESTree.Node): TSESTree.Node | undefined {
  switch (node.type) {
    case AST_NODE_TYPES.UnaryExpression:
      return node.operator === 'typeof' ? node.argument : undefined;
    case AST_NODE_TYPES.AssignmentExpression:
      return node.left.type === AST_NODE_TYPES.MemberExpression &&
        !SINGLE_SHAPE_MEMBERS.has(fieldNameOf(node.left) ?? '')
        ? undefined
        : node.left;
    case AST_NODE_TYPES.BinaryExpression:
      if (node.operator === 'instanceof') {
        return node.left;
      }
      if (node.operator === 'in') {
        return node.right;
      }
      return ['===', '!==', '==', '!='].includes(node.operator) &&
        node.right.type === AST_NODE_TYPES.Literal &&
        SHAPE_LITERALS.has(node.right.value as boolean)
        ? node.left
        : undefined;
    case AST_NODE_TYPES.CallExpression: {
      const name =
        node.callee.type === AST_NODE_TYPES.MemberExpression
          ? nameOf(node.callee.object)
          : nameOf(node.callee);
      const method =
        node.callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(node.callee.property) : '';
      return (name === 'Array' && method === 'isArray') ||
        GUARD_CALL.test(method === '' ? (name ?? '') : (method ?? ''))
        ? node.arguments[0]
        : undefined;
    }
    default:
      return undefined;
  }
}

function narrowed(context: Context, scope: TSESTree.Node, subject: string): boolean {
  return [...depthFirst<TSESTree.Node>(scope, nodeChildren)].some((node) => {
    const probe = shapeProbe(node);
    return probe !== undefined && context.sourceCode.getText(probe).includes(subject);
  });
}

function fallsBackToObject(context: Context, node: TSESTree.MemberExpression): boolean {
  let current: TSESTree.Node = node;
  while (current.parent?.type === AST_NODE_TYPES.ChainExpression) {
    current = current.parent;
  }
  const parent = current.parent;
  return (
    parent?.type === AST_NODE_TYPES.LogicalExpression &&
    parent.left === current &&
    context.sourceCode.getText(parent.right).includes(context.sourceCode.getText(node.object))
  );
}

function unwrappedObject(node: TSESTree.Node): TSESTree.Node {
  const leaves = leavesOf(node);
  return leaves.length === 1 && leaves[0] !== undefined ? leaves[0] : node;
}

export const rule: TSESLint.RuleModule<'singleShape', []> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reading a package.json field that has several shapes as only one of them',
    },
    schema: [],
    messages: {
      singleShape:
        'npm accepts "{{field}}" of a package.json in more than one shape (a list or a boolean for bundleDependencies, a list or an object for workspaces, a string or a list for man), and "{{member}}" exists on only one of them, so a manifest in the other shape throws or reads undefined. Check Array.isArray(...) or typeof first and handle each shape.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const member = fieldNameOf(node);
        const object = unwrappedObject(node.object);
        const field =
          object.type === AST_NODE_TYPES.Identifier
            ? (aliasField(context, object) ?? manifestField(context, object))
            : manifestField(context, object);
        if (
          member === undefined ||
          field === undefined ||
          !SINGLE_SHAPE_MEMBERS.get(field)?.has(member)
        ) {
          return;
        }
        const scope = enclosingFunction(node) ?? context.sourceCode.ast;
        const subject = object.type === AST_NODE_TYPES.Identifier ? object.name : field;
        if (
          !narrowed(context, scope, subject) &&
          !narrowed(context, scope, field) &&
          !fallsBackToObject(context, node)
        ) {
          context.report({ node, messageId: 'singleShape', data: { field, member } });
        }
      },
    };
  },
};
