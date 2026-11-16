import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;
type MemberValue = { readonly fixed: boolean; readonly value: TSESTree.Node };

function keyName(key: TSESTree.Node | undefined, computed: boolean): string | undefined {
  if (!computed && key?.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  return key?.type === AST_NODE_TYPES.Literal ? String(key.value) : undefined;
}

function enumValue(declaration: TSESTree.TSEnumDeclaration, name: string): MemberValue | undefined {
  const { members } = declaration.body;
  const member = members.find((entry) => keyName(entry.id, false) === name);
  return member?.initializer === undefined ? undefined : { fixed: true, value: member.initializer };
}

function fieldValue(
  classNode: ClassNode,
  name: string,
  isStatic: boolean,
): MemberValue | undefined {
  const field = classNode.body.body
    .filter((element) => element.type === AST_NODE_TYPES.PropertyDefinition)
    .find(
      (element) =>
        element.static === isStatic &&
        element.value !== null &&
        keyName(element.key, element.computed) === name,
    );
  return field === undefined || field.value === null
    ? undefined
    : { fixed: field.readonly, value: field.value };
}

function parameterDefault(classNode: ClassNode, name: string): MemberValue | undefined {
  const constructor = classNode.body.body
    .filter((element) => element.type === AST_NODE_TYPES.MethodDefinition)
    .find((element) => element.kind === 'constructor');
  const property = constructor?.value.params
    .filter((parameter) => parameter.type === AST_NODE_TYPES.TSParameterProperty)
    .map(({ parameter }) => parameter)
    .filter((parameter) => parameter.type === AST_NODE_TYPES.AssignmentPattern)
    .find((parameter) => nameOf(parameter.left) === name);
  return property === undefined ? undefined : { fixed: false, value: property.right };
}

function isClass(node: TSESTree.Node | undefined): node is ClassNode {
  return (
    node?.type === AST_NODE_TYPES.ClassDeclaration || node?.type === AST_NODE_TYPES.ClassExpression
  );
}

function enclosingClass(node: TSESTree.Node): TSESTree.Node | undefined {
  for (const owner of ancestorsOf(node)) {
    if (
      (owner.type === AST_NODE_TYPES.FunctionExpression ||
        owner.type === AST_NODE_TYPES.FunctionDeclaration) &&
      owner.parent.type !== AST_NODE_TYPES.MethodDefinition
    ) {
      return undefined;
    }
    if (owner.type === AST_NODE_TYPES.ClassBody) {
      return owner.parent;
    }
  }
  return undefined;
}

function declaredOwner(context: Context, object: TSESTree.Identifier): TSESTree.Node | undefined {
  const variable = findVariable(context, object, object.name);
  const definition = variable?.defs.find(
    (entry) =>
      entry.type === TSESLint.Scope.DefinitionType.TSEnumName ||
      entry.type === TSESLint.Scope.DefinitionType.ClassName,
  );
  return definition?.node;
}

export function declaredMemberValue(
  context: Context,
  member: TSESTree.MemberExpression,
  name: string,
): MemberValue | undefined {
  const { object } = member;
  if (object.type === AST_NODE_TYPES.ThisExpression) {
    const owner = enclosingClass(member);
    return isClass(owner)
      ? (fieldValue(owner, name, false) ?? parameterDefault(owner, name))
      : undefined;
  }
  const owner =
    object.type === AST_NODE_TYPES.Identifier ? declaredOwner(context, object) : undefined;
  if (owner?.type === AST_NODE_TYPES.TSEnumDeclaration) {
    return enumValue(owner, name);
  }
  return isClass(owner) ? fieldValue(owner, name, true) : undefined;
}
