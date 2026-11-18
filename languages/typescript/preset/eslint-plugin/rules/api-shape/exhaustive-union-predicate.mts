import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { hasTypeInformation } from '../promises/cannot-reject.mts';
import { isProjectFile } from '../analysis/mutation/caller-objects.mts';
import { logicalOperands } from '../analysis/static-shapes.mts';
import { ancestorsOf, type SourceCode } from '../typed/node-views.mts';
import { isFunction } from '../typed/syntax-views.mts';
import {
  isLiteralValue,
  isPlainReference,
  membershipComparisons,
  switchComparisons,
  type Comparison,
} from './union-predicate-forms.mts';

type Services = ParserServicesWithTypeInformation;
type Check = { readonly services: Services; readonly sourceCode: SourceCode };
type Context = Readonly<TSESLint.RuleContext<'partialUnionTest', []>>;
type Docs = { readonly requiresTypeChecking: boolean };
type LiteralType = TypeScript.StringLiteralType | TypeScript.NumberLiteralType;

const COMPARISON_FOR: Readonly<Record<string, string>> = { '||': '===', '&&': '!==' };
const MINIMUM_MEMBERS = 3;

function comparisonOf(node: TSESTree.Node, operator: string): Comparison | undefined {
  if (node.type !== AST_NODE_TYPES.BinaryExpression || node.operator !== operator) {
    return undefined;
  }
  const literalOnRight = isLiteralValue(node.right);
  const [subject, literal]: readonly [TSESTree.Node, TSESTree.Node] = literalOnRight
    ? [node.left, node.right]
    : [node.right, node.left];
  return isLiteralValue(literal) && isPlainReference(subject)
    ? { subject, value: literal.value }
    : undefined;
}

function operandComparisons(node: TSESTree.Node, logical: string): Comparison[] | undefined {
  const comparison = comparisonOf(node, COMPARISON_FOR[logical] ?? '');
  if (comparison !== undefined) {
    return [comparison];
  }
  const negated =
    node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!'
      ? node.argument
      : undefined;
  if (logical === '||') {
    return negated === undefined ? membershipComparisons(node) : undefined;
  }
  return negated === undefined ? undefined : membershipComparisons(negated);
}

function isChainOperand(call: TSESTree.CallExpression): boolean {
  const { parent } = call;
  const negated = parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!';
  const operand = negated ? parent : call;
  return (
    operand.parent.type === AST_NODE_TYPES.LogicalExpression &&
    operand.parent.operator === (negated ? '&&' : '||')
  );
}

function literalMembers(type: TypeScript.Type): LiteralType[] {
  if (!type.isUnion()) {
    return [];
  }
  return type.types.filter(
    (member): member is LiteralType => member.isStringLiteral() || member.isNumberLiteral(),
  );
}

function declaredAliasOf(
  services: Services,
  subject: TSESTree.Node,
  type: TypeScript.Type,
): TypeScript.Symbol | undefined {
  const checker = services.program.getTypeChecker();
  const direct = checker.getNonNullableType(type).aliasSymbol;
  const symbol = services.getSymbolAtLocation(subject);
  const declaration = symbol?.valueDeclaration;
  if (direct !== undefined || symbol === undefined || declaration === undefined) {
    return direct;
  }
  return checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(symbol, declaration))
    .aliasSymbol;
}

function isWrittenInProject(
  services: Services,
  alias: TypeScript.Symbol | undefined,
  subject: TSESTree.Node,
): boolean {
  const { program } = services;
  const declarations =
    alias === undefined
      ? (services.getSymbolAtLocation(subject)?.declarations ?? []).filter(
          (declaration) => 'type' in declaration && declaration.type !== undefined,
        )
      : (alias.declarations ?? []);
  return declarations.some((declaration) => isProjectFile(program, declaration.getSourceFile()));
}

function narrowsDiscriminatedUnion(services: Services, subject: TSESTree.Node): boolean {
  if (subject.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  return checker.getNonNullableType(services.getTypeAtLocation(subject.object)).isUnion();
}

function isValueSlot(parent: TSESTree.Node, node: TSESTree.Node): boolean {
  if (parent.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return parent.body === node;
  }
  if (parent.type === AST_NODE_TYPES.ReturnStatement) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return parent.init === node;
  }
  return parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === node;
}

function isWrappingValue(parent: TSESTree.Node, node: TSESTree.Node): boolean {
  if (parent.type === AST_NODE_TYPES.ConditionalExpression) {
    return parent.test !== node;
  }
  return (
    parent.type === AST_NODE_TYPES.LogicalExpression ||
    (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!')
  );
}

function isPredicateValue(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const current of pending) {
    const { parent } = current;
    if (parent === undefined) {
      return false;
    }
    if (!isWrappingValue(parent, current)) {
      return isValueSlot(parent, current);
    }
    pending.push(parent);
  }
  return false;
}

function returnsTypePredicate(node: TSESTree.Node): boolean {
  const owner = ancestorsOf(node).find(isFunction);
  return owner?.returnType?.typeAnnotation.type === AST_NODE_TYPES.TSTypePredicate;
}

function sharedSubject(
  sourceCode: Check['sourceCode'],
  comparisons: readonly Comparison[],
): Comparison['subject'] | undefined {
  const [first] = comparisons;
  if (first === undefined) {
    return undefined;
  }
  const text = sourceCode.getText(first.subject);
  return comparisons.some((comparison) => sourceCode.getText(comparison.subject) !== text)
    ? undefined
    : first.subject;
}

function partialUnion(
  { services, sourceCode }: Check,
  comparisons: readonly Comparison[],
): string | undefined {
  const subject = sharedSubject(sourceCode, comparisons);
  if (subject === undefined) {
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

function chainComparisons(node: TSESTree.LogicalExpression): Comparison[] | undefined {
  const continuesChain =
    node.parent.type === AST_NODE_TYPES.LogicalExpression && node.parent.operator === node.operator;
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
  return operands.every((found): found is Comparison[] => found !== undefined)
    ? operands.flat()
    : undefined;
}

function callComparisons(node: TSESTree.CallExpression): Comparison[] | undefined {
  const comparisons = membershipComparisons(node);
  return comparisons !== undefined &&
    !isChainOperand(node) &&
    isPredicateValue(node) &&
    !returnsTypePredicate(node)
    ? comparisons
    : undefined;
}

function switchPredicateComparisons(node: TSESTree.SwitchStatement): Comparison[] | undefined {
  return returnsTypePredicate(node) ? undefined : switchComparisons(node);
}

function reportPartial(
  { context, check }: { readonly context: Context; readonly check: Check },
  node: TSESTree.Node,
  comparisons: readonly Comparison[] | undefined,
): void {
  const union = comparisons === undefined ? undefined : partialUnion(check, comparisons);
  if (union !== undefined) {
    context.report({ node, messageId: 'partialUnionTest', data: { union } });
  }
}

export const rule: TSESLint.RuleModule<'partialUnionTest', [], Docs> = {
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
    if (!hasTypeInformation(services)) {
      return {};
    }

    const check = { services, sourceCode: context.sourceCode };
    return {
      LogicalExpression(node) {
        reportPartial({ context, check }, node, chainComparisons(node));
      },
      CallExpression(node) {
        reportPartial({ context, check }, node, callComparisons(node));
      },
      SwitchStatement(node) {
        reportPartial({ context, check }, node, switchPredicateComparisons(node));
      },
    };
  },
};
