import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
import { enclosingFunction } from '../typed/syntax-views.mts';
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
      isManifestType(defNode.id.typeAnnotation?.typeAnnotation) || parsedPackageJson(defNode.init ?? undefined)
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

function manifestField(context: Context, node: TSESTree.Node): string | undefined {
  const leaves = leavesOf(node);
  const fields = leaves
    .filter((leaf) => !isEmptyList(leaf))
    .map((leaf) =>
      leaf.type === AST_NODE_TYPES.MemberExpression && isManifest(context, leaf.object)
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

function aliasField(context: Context, node: TSESTree.Identifier): string | undefined {
  const definition = findVariable(context, node, node.name)?.defs[0]?.node;
  return definition?.type === AST_NODE_TYPES.VariableDeclarator &&
    definition.id.type === AST_NODE_TYPES.Identifier &&
    definition.init !== null
    ? manifestField(context, definition.init)
    : undefined;
}

function narrowed(context: Context, scope: TSESTree.Node, subject: string): boolean {
  return [...depthFirst<TSESTree.Node>(scope, nodeChildren)].some((node) => {
    const probe =
      node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'typeof'
        ? node.argument
        : node.type === AST_NODE_TYPES.CallExpression &&
            node.callee.type === AST_NODE_TYPES.MemberExpression &&
            nameOf(node.callee.object) === 'Array' &&
            nameOf(node.callee.property) === 'isArray'
          ? node.arguments[0]
          : undefined;
    return probe !== undefined && context.sourceCode.getText(probe).includes(subject);
  });
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
        if (!narrowed(context, scope, subject) && !narrowed(context, scope, field)) {
          context.report({ node, messageId: 'singleShape', data: { field, member } });
        }
      },
    };
  },
};
