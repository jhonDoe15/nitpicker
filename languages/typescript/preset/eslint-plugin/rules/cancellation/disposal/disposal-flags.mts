import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

const TEARDOWN_METHODS = new Set<string>(['dispose', 'close', 'destroy', 'ngOnDestroy']);
const FLAG_NAME = /^_?(?:is)?(?:dispos|clos|destroy)(?:ed)?$/iu;
export const GUARD_NAME = /dispos|destroy|closed|isclos|cancel|abort|unmount/iu;

function keyName(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return node.type === AST_NODE_TYPES.PrivateIdentifier ? node.name : undefined;
}

export function methodName(member: TSESTree.ClassElement): string | undefined {
  return (member.type === AST_NODE_TYPES.MethodDefinition ||
    member.type === AST_NODE_TYPES.PropertyDefinition) &&
    !member.computed
    ? keyName(member.key)
    : undefined;
}

function thisFlagAssignedTrue(node: TSESTree.Node): string | undefined {
  if (
    node.type !== AST_NODE_TYPES.AssignmentExpression ||
    node.operator !== '=' ||
    node.right.type !== AST_NODE_TYPES.Literal ||
    node.right.value !== true ||
    node.left.type !== AST_NODE_TYPES.MemberExpression ||
    node.left.object.type !== AST_NODE_TYPES.ThisExpression ||
    node.left.computed
  ) {
    return undefined;
  }
  const name = keyName(node.left.property);
  return name !== undefined && FLAG_NAME.test(name) ? name : undefined;
}

function teardownValue(member: TSESTree.ClassElement): TSESTree.Node | undefined {
  const callable =
    member.type === AST_NODE_TYPES.MethodDefinition ||
    member.type === AST_NODE_TYPES.PropertyDefinition;
  const name = methodName(member);
  return callable && name !== undefined && TEARDOWN_METHODS.has(name)
    ? (member.value ?? undefined)
    : undefined;
}

export function flagsSetByTeardown(
  body: readonly TSESTree.ClassElement[],
  statements: (method: TSESTree.Node) => readonly TSESTree.Node[],
): ReadonlySet<string> {
  const nodes = body.flatMap((member) => {
    const value = teardownValue(member);
    return value === undefined ? [] : statements(value);
  });
  return new Set(nodes.flatMap((node) => thisFlagAssignedTrue(node) ?? []));
}
