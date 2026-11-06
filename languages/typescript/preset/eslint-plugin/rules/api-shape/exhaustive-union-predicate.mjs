import { ancestorsOf } from '../analysis/ancestry.mjs';
import { logicalOperands } from '../analysis/static-shapes.mjs';
import { isProjectFile } from '../analysis/mutation/caller-objects.mjs';
import {
  isLiteralValue,
  isPlainReference,
  membershipComparisons,
  switchComparisons,
} from './union-predicate-forms.mjs';

const COMPARISON_FOR = { '||': '===', '&&': '!==' };
const MINIMUM_MEMBERS = 3;
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function comparisonOf(node, operator) {
  if (node.type !== 'BinaryExpression' || node.operator !== operator) {
    return undefined;
  }
  const literalOnRight = isLiteralValue(node.right);
  const [subject, literal] = literalOnRight ? [node.left, node.right] : [node.right, node.left];
  return isLiteralValue(literal) && isPlainReference(subject)
    ? { subject, value: literal.value }
    : undefined;
}

function operandComparisons(node, logical) {
  const comparison = comparisonOf(node, COMPARISON_FOR[logical]);
  if (comparison !== undefined) {
    return [comparison];
  }
  const negated = node.type === 'UnaryExpression' && node.operator === '!';
  if (logical === '||') {
    return negated ? undefined : membershipComparisons(node);
  }
  return negated ? membershipComparisons(node.argument) : undefined;
}

function isChainOperand(call) {
  const negated = call.parent.type === 'UnaryExpression' && call.parent.operator === '!';
  const operand = negated ? call.parent : call;
  return (
    operand.parent.type === 'LogicalExpression' &&
    operand.parent.operator === (negated ? '&&' : '||')
  );
}

function literalMembers(type) {
  if (!type.isUnion()) {
    return [];
  }
  return type.types.filter((member) => member.isStringLiteral() || member.isNumberLiteral());
}

function declaredAliasOf(services, subject, type) {
  const checker = services.program.getTypeChecker();
  const direct = checker.getNonNullableType(type).aliasSymbol;
  const symbol = services.getSymbolAtLocation(subject);
  const declaration = symbol?.valueDeclaration;
  if (direct !== undefined || declaration === undefined) {
    return direct;
  }
  return checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(symbol, declaration))
    .aliasSymbol;
}

function isWrittenInProject(services, alias, subject) {
  const { program } = services;
  const declarations =
    alias === undefined
      ? (services.getSymbolAtLocation(subject)?.declarations ?? []).filter(
          (declaration) => declaration.type !== undefined,
        )
      : (alias.declarations ?? []);
  return declarations.some((declaration) => isProjectFile(program, declaration.getSourceFile()));
}

function narrowsDiscriminatedUnion(services, subject) {
  if (subject.type !== 'MemberExpression') {
    return false;
  }
  const checker = services.program.getTypeChecker();
  return checker.getNonNullableType(services.getTypeAtLocation(subject.object)).isUnion();
}

function isValueSlot(parent, node) {
  switch (parent.type) {
    case 'ArrowFunctionExpression':
      return parent.body === node;
    case 'ReturnStatement':
      return true;
    case 'VariableDeclarator':
      return parent.init === node;
    case 'AssignmentExpression':
      return parent.right === node;
    default:
      return false;
  }
}

function isWrappingValue(parent, node) {
  if (parent.type === 'ConditionalExpression') {
    return parent.test !== node;
  }
  return (
    parent.type === 'LogicalExpression' ||
    (parent.type === 'UnaryExpression' && parent.operator === '!')
  );
}

function isPredicateValue(node) {
  const pending = [node];
  for (const current of pending) {
    if (!isWrappingValue(current.parent, current)) {
      return isValueSlot(current.parent, current);
    }
    pending.push(current.parent);
  }
  return false;
}

function returnsTypePredicate(node) {
  const owner = ancestorsOf(node).find(({ type }) => FUNCTION_TYPES.has(type));
  return owner?.returnType?.typeAnnotation.type === 'TSTypePredicate';
}

function partialUnion({ services, sourceCode }, comparisons) {
  const [{ subject }] = comparisons;
  const text = sourceCode.getText(subject);
  if (comparisons.some((comparison) => sourceCode.getText(comparison.subject) !== text)) {
    return undefined;
  }
  const type = services.getTypeAtLocation(subject);
  const members = literalMembers(type).map((member) => member.value);
  const compared = new Set(comparisons.map(({ value }) => value));
  const isSubset =
    members.length >= MINIMUM_MEMBERS &&
    compared.size < members.length &&
    [...compared].every((value) => members.includes(value));
  const alias = declaredAliasOf(services, subject, type);
  const flagged =
    isSubset &&
    isWrittenInProject(services, alias, subject) &&
    !narrowsDiscriminatedUnion(services, subject);
  if (!flagged) {
    return undefined;
  }
  return alias === undefined ? 'the union' : `\`${alias.name}\``;
}

function chainComparisons(node) {
  const continuesChain =
    node.parent.type === 'LogicalExpression' && node.parent.operator === node.operator;
  if (
    COMPARISON_FOR[node.operator] === undefined ||
    continuesChain ||
    !isPredicateValue(node) ||
    returnsTypePredicate(node)
  ) {
    return undefined;
  }
  const operands = logicalOperands(node, node.operator).map((operand) =>
    operandComparisons(operand, node.operator),
  );
  return operands.every((found) => found !== undefined) ? operands.flat() : undefined;
}

function callComparisons(node) {
  const comparisons = membershipComparisons(node);
  return comparisons !== undefined &&
    !isChainOperand(node) &&
    isPredicateValue(node) &&
    !returnsTypePredicate(node)
    ? comparisons
    : undefined;
}

function switchPredicateComparisons(node) {
  return returnsTypePredicate(node) ? undefined : switchComparisons(node);
}

const FORMS = {
  LogicalExpression: chainComparisons,
  CallExpression: callComparisons,
  SwitchStatement: switchPredicateComparisons,
};

function reportPartial({ context, check }, node, comparisons) {
  const union = comparisons === undefined ? undefined : partialUnion(check, comparisons);
  if (union !== undefined) {
    context.report({ node, messageId: 'partialUnionTest', data: { union } });
  }
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow classifying a union by listing only some of its members',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      partialUnionTest:
        'These comparisons list only some members of {{ union }}, so a member added later is silently classified as the default. Classify every member with a `switch` that has no `default`, or a `Record<Union, boolean>` lookup, so adding a member fails to compile.',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }

    const check = { services, sourceCode: context.sourceCode };
    return Object.fromEntries(
      Object.entries(FORMS).map(([type, comparisonsOf]) => [
        type,
        (node) => {
          reportPartial({ context, check }, node, comparisonsOf(node));
        },
      ]),
    );
  },
};
