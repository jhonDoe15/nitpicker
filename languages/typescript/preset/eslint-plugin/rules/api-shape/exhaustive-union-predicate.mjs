import { ancestorsOf } from '../analysis/ancestry.mjs';
import { logicalOperands } from '../analysis/static-shapes.mjs';

const COMPARISON_FOR = { '||': '===', '&&': '!==' };
const MINIMUM_MEMBERS = 3;
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function isLiteralValue(node) {
  return node.type === 'Literal' && ['string', 'number'].includes(typeof node.value);
}

function isPlainReference(node) {
  const pending = [node];
  for (const current of pending) {
    if (current.type !== 'MemberExpression') {
      return current.type === 'Identifier' || current.type === 'ThisExpression';
    }
    if (current.computed && !isLiteralValue(current.property)) {
      return false;
    }
    pending.push(current.object);
  }
  return false;
}

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

function literalMembers(type) {
  if (!type.isUnion()) {
    return [];
  }
  return type.types.filter((member) => member.isStringLiteral() || member.isNumberLiteral());
}

function isProjectFile(program, sourceFile) {
  return (
    !program.isSourceFileFromExternalLibrary(sourceFile) &&
    !program.isSourceFileDefaultLibrary(sourceFile) &&
    !sourceFile.fileName.includes('/node_modules/')
  );
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
        'These comparisons list only some members of {{ union }}, so a member added later is silently classified as the default. Classify every member with a `switch` that has no `default`, or a `Record<Union, boolean>` lookup, so adding a member fails to compile. If a partial test is intended, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }

    return {
      LogicalExpression(node) {
        const operator = COMPARISON_FOR[node.operator];
        const continuesChain =
          node.parent.type === 'LogicalExpression' && node.parent.operator === node.operator;
        if (
          operator === undefined ||
          continuesChain ||
          !isPredicateValue(node) ||
          returnsTypePredicate(node)
        ) {
          return;
        }
        const comparisons = logicalOperands(node, node.operator).map((operand) =>
          comparisonOf(operand, operator),
        );
        if (comparisons.some((comparison) => comparison === undefined)) {
          return;
        }
        const union = partialUnion({ services, sourceCode: context.sourceCode }, comparisons);
        if (union !== undefined) {
          context.report({ node, messageId: 'partialUnionTest', data: { union } });
        }
      },
    };
  },
};
