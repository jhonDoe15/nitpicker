import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, resolveConstant, stringValue } from '../../analysis/constant-resolution.mts';
import { propertyName, staticName, wrapperTop } from '../../analysis/globals/process-values.mts';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';

type MessageIds = 'wholeToolPackageLoad';
type Context = Readonly<TSESLint.RuleContext<MessageIds, []>>;
type LoadNode = TSESTree.CallExpression | TSESTree.ImportExpression;

const { DefinitionType } = TSESLint.Scope;

const AGGREGATE_MEMBERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'typescript-eslint': {
    parser: '@typescript-eslint/parser',
    plugin: '@typescript-eslint/eslint-plugin',
  },
};

function isCreateRequireCall(node: TSESTree.Node | undefined): boolean {
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  return node.callee.type === AST_NODE_TYPES.Identifier
    ? node.callee.name === 'createRequire'
    : node.callee.type === AST_NODE_TYPES.MemberExpression &&
        staticName(node.callee) === 'createRequire';
}

function singleVariableInit(
  context: Context,
  node: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const defs = findVariable(context, node, node.name)?.defs;
  if (defs === undefined || defs.length !== 1) {
    return undefined;
  }
  const [def] = defs;
  if (def?.type !== DefinitionType.Variable || def.node.id.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  return def.node.init ?? undefined;
}

function isRequireCallee(context: Context, callee: TSESTree.Node): boolean {
  if (isCreateRequireCall(callee)) {
    return true;
  }
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  if (callee.name === 'require') {
    return true;
  }
  const resolved = resolveConstant(context, callee);
  return isCreateRequireCall(resolved) || isCreateRequireCall(singleVariableInit(context, callee));
}

function aggregatePackageOf(context: Context, node: LoadNode): string | undefined {
  const specifier =
    node.type === AST_NODE_TYPES.ImportExpression
      ? stringValue(node.source)
      : isRequireCallee(context, node.callee)
        ? stringValue(node.arguments[0])
        : undefined;
  return specifier !== undefined && Object.hasOwn(AGGREGATE_MEMBERS, specifier)
    ? specifier
    : undefined;
}

function outerLoadExpression(node: TSESTree.Node): TSESTree.Node {
  let current = wrapperTop(node);
  while (
    current.parent?.type === AST_NODE_TYPES.AwaitExpression &&
    current.parent.argument === current
  ) {
    current = wrapperTop(current.parent);
  }
  return current;
}

function isWriteTarget(member: TSESTree.MemberExpression): boolean {
  const { parent } = member;
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return parent.left === member;
  }
  return (
    (parent.type === AST_NODE_TYPES.UpdateExpression && parent.argument === member) ||
    (parent.type === AST_NODE_TYPES.UnaryExpression &&
      parent.operator === 'delete' &&
      parent.argument === member)
  );
}

function singleDestructuredMember(pattern: TSESTree.ObjectPattern): string | undefined {
  if (pattern.properties.length !== 1) {
    return undefined;
  }
  const property = pattern.properties[0];
  return property?.type === AST_NODE_TYPES.Property ? propertyName(property) : undefined;
}

function memberReadOf(
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): string | undefined {
  const top = wrapperTop(identifier);
  const { parent } = top;
  if (parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === top) {
    return isWriteTarget(parent) ? undefined : staticName(parent);
  }
  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === top &&
    parent.id.type === AST_NODE_TYPES.ObjectPattern
  ) {
    return singleDestructuredMember(parent.id);
  }
  return undefined;
}

function singleVariableMember(context: Context, id: TSESTree.Identifier): string | undefined {
  const variable = findVariable(context, id, id.name);
  if (variable === undefined || variable.defs.length !== 1) {
    return undefined;
  }
  const uses = variable.references.filter((reference) => reference.identifier !== id);
  if (uses.length === 0 || uses.some((reference) => reference.isWrite())) {
    return undefined;
  }
  const members = uses.map((reference) => memberReadOf(reference.identifier));
  if (members.some((name) => name === undefined)) {
    return undefined;
  }
  return new Set(members).size === 1 ? members[0] : undefined;
}

function declaratorMember(context: Context, id: TSESTree.BindingName): string | undefined {
  if (id.type === AST_NODE_TYPES.ObjectPattern) {
    return singleDestructuredMember(id);
  }
  return id.type === AST_NODE_TYPES.Identifier ? singleVariableMember(context, id) : undefined;
}

function consumedMember(context: Context, expression: TSESTree.Node): string | undefined {
  const { parent } = expression;
  if (parent === undefined) {
    return undefined;
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === expression) {
    return isWriteTarget(parent) ? undefined : staticName(parent);
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === expression) {
    return declaratorMember(context, parent.id);
  }
  if (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.right === expression &&
    parent.operator === '=' &&
    parent.left.type === AST_NODE_TYPES.ObjectPattern
  ) {
    return singleDestructuredMember(parent.left);
  }
  return undefined;
}

function checkLoad(context: Context, node: LoadNode): void {
  const aggregate = aggregatePackageOf(context, node);
  if (aggregate === undefined) {
    return;
  }
  const member = consumedMember(context, outerLoadExpression(node));
  const subpackage = member === undefined ? undefined : AGGREGATE_MEMBERS[aggregate]?.[member];
  if (member === undefined || subpackage === undefined) {
    return;
  }
  context.report({
    node,
    messageId: 'wholeToolPackageLoad',
    data: { aggregate, member, subpackage },
  });
}

export const rule: TSESLint.RuleModule<MessageIds, []> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid loading an aggregate tool package when only one standalone subpackage is used',
    },
    schema: [],
    messages: {
      wholeToolPackageLoad:
        "Loading whole aggregate package '{{aggregate}}' only to read '.{{member}}' pulls in the rest of the package. Load '{{subpackage}}' directly instead (resolve it from '{{aggregate}}' if it is not a direct dependency).",
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    return {
      CallExpression(node: TSESTree.CallExpression) {
        checkLoad(context, node);
      },
      ImportExpression(node: TSESTree.ImportExpression) {
        checkLoad(context, node);
      },
    };
  },
};
