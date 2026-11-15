import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { jsdocOptionSchema, type JsdocOptions } from '../typed/jsdoc-views.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
type ExportNode = TSESTree.ExportNamedDeclaration | TSESTree.ExportDefaultDeclaration;
type MemberNode = TSESTree.MethodDefinition | TSESTree.PropertyDefinition;
type BooleanLiteral = TSESTree.BooleanLiteral;
type ConditionParent = TSESTree.Node | undefined;

const FUNCTIONS = [
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
];
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);
const TRANSPARENT = new Set<string>([
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.ChainExpression,
]);
const TEST_OWNERS = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForStatement,
]);
const FACTORY_NAME = /^(?:(?:set|with|from)[A-Z_]|of$|builder$)/;
const STATIC_FACTORY = /^(?:create|valueOf)/;
const BOOLEAN_TAG = /@param\s+\{\s*boolean\s*\}\s+(?:\[\s*)?([\w$]+)/g;

function isFunction(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

function isExport(node: TSESTree.Node): node is ExportNode {
  return (
    node.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    node.type === AST_NODE_TYPES.ExportDefaultDeclaration
  );
}

function isMember(node: TSESTree.Node): node is MemberNode {
  return (
    node.type === AST_NODE_TYPES.MethodDefinition || node.type === AST_NODE_TYPES.PropertyDefinition
  );
}

function isDirectParent(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.Program ||
    node.type === AST_NODE_TYPES.VariableDeclarator ||
    isExport(node)
  );
}

function declaredName(statement: TSESTree.Node): string | undefined {
  const declaration = isExport(statement) ? statement.declaration : statement;
  if (declaration?.type === AST_NODE_TYPES.VariableDeclaration) {
    return nameOf(declaration.declarations[0].id);
  }
  return declaration !== null && 'id' in declaration ? nameOf(declaration.id) : undefined;
}

function isExportedStatement(
  program: TSESTree.Node | undefined,
  statement: TSESTree.Node,
): boolean {
  if (isExport(statement)) {
    return true;
  }
  const name = declaredName(statement);
  return (
    name !== undefined &&
    program?.type === AST_NODE_TYPES.Program &&
    program.body.some(
      (other) =>
        other.type === AST_NODE_TYPES.ExportNamedDeclaration &&
        other.source === null &&
        other.specifiers.some((specifier) => nameOf(specifier.local) === name),
    )
  );
}

function isPublicMember(member: MemberNode): boolean {
  return (
    !(member.type === AST_NODE_TYPES.MethodDefinition && member.kind !== 'method') &&
    !member.override &&
    member.accessibility !== 'private' &&
    member.accessibility !== 'protected' &&
    member.key.type !== AST_NODE_TYPES.PrivateIdentifier
  );
}

function ownerName(node: FunctionNode): string | undefined {
  const { parent } = node;
  if (isMember(parent) || parent.type === AST_NODE_TYPES.Property) {
    return nameOf(parent.key);
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return nameOf(parent.id);
  }
  return nameOf(node.id);
}

function suppliedBySupertype(member: MemberNode): boolean {
  const owner = member.parent.parent;
  const heritage = owner.superClass !== null || owner.implements.length > 0;
  return heritage || (member.static && STATIC_FACTORY.test(nameOf(member.key) ?? ''));
}

function isExportedMethod(property: TSESTree.Property): boolean {
  const object = property.parent;
  return (
    property.kind === 'init' &&
    object.type === AST_NODE_TYPES.ObjectExpression &&
    (object.parent.type === AST_NODE_TYPES.VariableDeclarator ||
      object.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration)
  );
}

function isProgramChild(node: TSESTree.Node): boolean {
  return node.parent?.type === AST_NODE_TYPES.Program;
}

function exportedFunctionName(node: FunctionNode): string | undefined {
  const chain = ancestorsOf(node);
  if (chain.some(isFunction)) {
    return undefined;
  }
  const member = isMember(node.parent) ? node.parent : undefined;
  const statement = [node, ...chain].find(isProgramChild);
  if (statement === undefined || !isExportedStatement(statement.parent, statement)) {
    return undefined;
  }
  if (member !== undefined) {
    return isPublicMember(member) && !suppliedBySupertype(member) ? ownerName(node) : undefined;
  }
  if (node.parent.type === AST_NODE_TYPES.Property) {
    return isExportedMethod(node.parent) ? ownerName(node) : undefined;
  }
  return isDirectParent(node.parent) ? (ownerName(node) ?? 'default') : undefined;
}

function isBooleanLiteral(node: TSESTree.Node): node is BooleanLiteral {
  return node.type === AST_NODE_TYPES.Literal && typeof node.value === 'boolean';
}

function asParameter(
  parameter: TSESTree.Parameter,
): { target: TSESTree.Identifier; optional: boolean } | undefined {
  const target = parameter.type === AST_NODE_TYPES.AssignmentPattern ? parameter.left : parameter;
  if (target.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const annotated = target.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSBooleanKeyword;
  const defaulted =
    parameter.type === AST_NODE_TYPES.AssignmentPattern && isBooleanLiteral(parameter.right);
  const untyped = target.typeAnnotation === undefined;
  return annotated || (defaulted && untyped) ? { target, optional: target.optional } : undefined;
}

function isTestOf(parent: ConditionParent, node: TSESTree.Node): boolean {
  if (parent?.type === AST_NODE_TYPES.SwitchStatement) {
    return parent.discriminant === node;
  }
  return (
    parent !== undefined && TEST_OWNERS.has(parent.type) && 'test' in parent && parent.test === node
  );
}

function isGuardedStatement(
  parent: ConditionParent,
  node: TSESTree.Node,
  identifier: TSESTree.Node,
): boolean {
  return (
    parent?.type === AST_NODE_TYPES.ExpressionStatement &&
    node.type === AST_NODE_TYPES.LogicalExpression &&
    node.operator !== '??' &&
    identifier.range[0] < node.right.range[0]
  );
}

function isCarried(parent: ConditionParent): boolean {
  if (parent === undefined) {
    return false;
  }
  return (
    TRANSPARENT.has(parent.type) ||
    (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!') ||
    parent.type === AST_NODE_TYPES.LogicalExpression ||
    (parent.type === AST_NODE_TYPES.BinaryExpression &&
      EQUALITY_OPERATORS.has(parent.operator) &&
      [parent.left, parent.right].some(isBooleanLiteral))
  );
}

function conditionRoot(identifier: TSESTree.Node): boolean {
  const node = [identifier, ...ancestorsOf(identifier)].find((each) => !isCarried(each.parent));
  return (
    node !== undefined &&
    (isTestOf(node.parent, node) || isGuardedStatement(node.parent, node, identifier))
  );
}

function isFlag(variable: TSESLint.Scope.Variable): boolean {
  const uses = variable.references.filter((reference) => !reference.init);
  return (
    uses.every((reference) => !reference.isWrite()) &&
    uses.some((reference) => conditionRoot(reference.identifier))
  );
}

function jsdocFlags(sourceCode: Readonly<TSESLint.SourceCode>, node: FunctionNode): Set<string> {
  const statement = [node, ...ancestorsOf(node)].find(isProgramChild);
  const member = node.parent.type === AST_NODE_TYPES.MethodDefinition ? node.parent : undefined;
  const anchor = member ?? statement ?? node;
  const text = sourceCode
    .getCommentsBefore(anchor)
    .filter((comment) => comment.type === AST_TOKEN_TYPES.Block && comment.value.startsWith('*'))
    .map((comment) => comment.value)
    .join('\n');
  return new Set([...text.matchAll(BOOLEAN_TAG)].flatMap((match) => match[1] ?? []));
}

export const rule: TSESLint.RuleModule<'booleanFlag', JsdocOptions> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow a boolean flag parameter on an exported function' },
    schema: jsdocOptionSchema,
    messages: {
      booleanFlag:
        '{{ name }} is a boolean flag: `{{ owner }}(x, true)` does not say what it switches. Split the function in two, one for each value of the flag, or take an options object (`{ urgent: true }`) or a union of string literals.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    function check(node: FunctionNode): void {
      const owner = exportedFunctionName(node);
      if (owner === undefined || FACTORY_NAME.test(owner)) {
        return;
      }
      const tagged =
        context.options[0]?.['jsdoc'] === true ? jsdocFlags(sourceCode, node) : new Set<string>();
      const variables = new Map(
        sourceCode.getDeclaredVariables(node).map((each) => [each.name, each]),
      );
      for (const parameter of node.params) {
        const flag = asParameter(parameter);
        const named =
          flag === undefined &&
          parameter.type === AST_NODE_TYPES.Identifier &&
          tagged.has(parameter.name);
        const target = flag?.target ?? (named ? parameter : undefined);
        const variable = target === undefined ? undefined : variables.get(target.name);
        if (
          target !== undefined &&
          variable !== undefined &&
          flag?.optional !== true &&
          isFlag(variable)
        ) {
          context.report({
            node: target,
            messageId: 'booleanFlag',
            data: { name: `\`${target.name}\``, owner },
          });
        }
      }
    }

    return Object.fromEntries(FUNCTIONS.map((type) => [type, check]));
  },
};
