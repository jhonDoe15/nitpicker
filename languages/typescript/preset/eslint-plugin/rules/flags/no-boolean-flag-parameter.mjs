import { jsdocOptionSchema } from '../../../../../javascript/preset/documentation/jsdoc.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const EXPORTS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const MEMBER_NODES = new Set(['MethodDefinition', 'PropertyDefinition']);
const NAMED_OWNERS = new Set([...MEMBER_NODES, 'Property']);
const OBJECT_HOLDERS = new Set(['VariableDeclarator', 'ExportDefaultDeclaration']);
const DIRECT_PARENTS = new Set(['Program', 'VariableDeclarator', ...EXPORTS]);
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);
const TRANSPARENT = new Set([
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
]);
const FACTORY_NAME = /^(?:(?:set|with|from)[A-Z_]|of$|builder$)/;
const STATIC_FACTORY = /^(?:create|valueOf)/;
const BOOLEAN_TAG = /@param\s+\{\s*boolean\s*\}\s+(?:\[\s*)?([\w$]+)/g;

function declaredName(statement) {
  const declaration = EXPORTS.has(statement.type) ? statement.declaration : statement;
  if (declaration?.type === 'VariableDeclaration') {
    return declaration.declarations[0]?.id.name;
  }
  return declaration?.id?.name;
}

function isExportedStatement(program, statement) {
  if (EXPORTS.has(statement.type)) {
    return true;
  }
  const name = declaredName(statement);
  return (
    name !== undefined &&
    program.body.some(
      (other) =>
        other.type === 'ExportNamedDeclaration' &&
        other.source === null &&
        other.specifiers.some((specifier) => specifier.local.name === name),
    )
  );
}

function isPublicMember(member) {
  return (
    member.kind !== 'constructor' &&
    member.kind !== 'set' &&
    member.kind !== 'get' &&
    member.override !== true &&
    member.accessibility !== 'private' &&
    member.accessibility !== 'protected' &&
    member.key?.type !== 'PrivateIdentifier'
  );
}

function ownerName(node) {
  const { parent } = node;
  if (NAMED_OWNERS.has(parent.type)) {
    return parent.key?.name;
  }
  if (parent.type === 'VariableDeclarator') {
    return parent.id.name;
  }
  return node.id?.name;
}

function suppliedBySupertype(member) {
  const owner = member.parent.parent;
  const heritage = owner.superClass !== null || (owner.implements ?? []).length > 0;
  return heritage || (member.static === true && STATIC_FACTORY.test(member.key?.name ?? ''));
}

function isExportedMethod(property) {
  const object = property.parent;
  return (
    property.kind === 'init' &&
    object.type === 'ObjectExpression' &&
    OBJECT_HOLDERS.has(object.parent.type)
  );
}

function exportedFunctionName(node) {
  const chain = ancestorsOf(node);
  if (chain.some((ancestor) => FUNCTIONS.has(ancestor.type))) {
    return undefined;
  }
  const member = MEMBER_NODES.has(node.parent.type) ? node.parent : undefined;
  const statement = [node, ...chain].find((each) => each.parent?.type === 'Program');
  if (statement === undefined || !isExportedStatement(statement.parent, statement)) {
    return undefined;
  }
  if (member !== undefined) {
    return isPublicMember(member) && !suppliedBySupertype(member) ? ownerName(node) : undefined;
  }
  if (node.parent.type === 'Property') {
    return isExportedMethod(node.parent) ? ownerName(node) : undefined;
  }
  return DIRECT_PARENTS.has(node.parent.type) ? (ownerName(node) ?? 'default') : undefined;
}

function isBooleanLiteral(node) {
  return node.type === 'Literal' && typeof node.value === 'boolean';
}

function asParameter(parameter) {
  const target = parameter.type === 'AssignmentPattern' ? parameter.left : parameter;
  if (target.type !== 'Identifier') {
    return undefined;
  }
  const annotated = target.typeAnnotation?.typeAnnotation.type === 'TSBooleanKeyword';
  const defaulted = parameter.type === 'AssignmentPattern' && isBooleanLiteral(parameter.right);
  const untyped = target.typeAnnotation === undefined;
  return annotated || (defaulted && untyped)
    ? { target, optional: target.optional === true }
    : undefined;
}

function isTestOf(parent, node) {
  switch (parent.type) {
    case 'IfStatement':
    case 'ConditionalExpression':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
      return parent.test === node;
    case 'SwitchStatement':
      return parent.discriminant === node;
    default:
      return false;
  }
}

function isGuardedStatement(parent, node, identifier) {
  return (
    parent.type === 'ExpressionStatement' &&
    node.type === 'LogicalExpression' &&
    node.operator !== '??' &&
    identifier.range[0] < node.right.range[0]
  );
}

function isCarried(parent) {
  return (
    TRANSPARENT.has(parent.type) ||
    (parent.type === 'UnaryExpression' && parent.operator === '!') ||
    parent.type === 'LogicalExpression' ||
    (parent.type === 'BinaryExpression' &&
      EQUALITY_OPERATORS.has(parent.operator) &&
      [parent.left, parent.right].some(isBooleanLiteral))
  );
}

function conditionRoot(identifier) {
  const node = [identifier, ...ancestorsOf(identifier)].find((each) => !isCarried(each.parent));
  return isTestOf(node.parent, node) || isGuardedStatement(node.parent, node, identifier);
}

function isFlag(variable) {
  const uses = variable.references.filter((reference) => !reference.init);
  return (
    uses.every((reference) => !reference.isWrite()) &&
    uses.some((reference) => conditionRoot(reference.identifier))
  );
}

function jsdocFlags(sourceCode, node) {
  const statement = [node, ...ancestorsOf(node)].find((each) => each.parent?.type === 'Program');
  const member = node.parent.type === 'MethodDefinition' ? node.parent : undefined;
  const anchor = member ?? statement ?? node;
  const text = sourceCode
    .getCommentsBefore(anchor)
    .filter((comment) => comment.type === 'Block' && comment.value.startsWith('*'))
    .map((comment) => comment.value)
    .join('\n');
  return new Set([...text.matchAll(BOOLEAN_TAG)].map((match) => match[1]));
}

export const rule = {
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

    function check(node) {
      const owner = exportedFunctionName(node);
      if (owner === undefined || FACTORY_NAME.test(owner) || node.body === null) {
        return;
      }
      const tagged = context.options[0]?.jsdoc === true ? jsdocFlags(sourceCode, node) : new Set();
      const variables = new Map(
        sourceCode.getDeclaredVariables(node).map((each) => [each.name, each]),
      );
      for (const parameter of node.params) {
        const flag = asParameter(parameter);
        const named =
          flag === undefined && parameter.type === 'Identifier' && tagged.has(parameter.name);
        const target = flag?.target ?? (named ? parameter : undefined);
        const variable = variables.get(target?.name);
        if (variable !== undefined && !flag?.optional && isFlag(variable)) {
          context.report({
            node: target,
            messageId: 'booleanFlag',
            data: { name: `\`${target.name}\``, owner },
          });
        }
      }
    }

    return Object.fromEntries([...FUNCTIONS].map((type) => [type, check]));
  },
};
