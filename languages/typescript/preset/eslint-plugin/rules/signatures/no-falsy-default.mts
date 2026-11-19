import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { orderedOperandsOf } from '../typed/syntax-views.mts';
import type TypeScript from 'typescript';
import { suggestible } from '../../fixes/support/descriptors.mts';
import { nullishDefaultFix } from '../../fixes/code/nullish-default-fix.mts';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { typedScopeOf, type TypedScope } from '../promises/cannot-reject.mts';
import { ancestorsOf, variableNamed, type SourceCode } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type MessageIds = 'falsyDefault' | 'useNullishCoalescing';
type AndExpression = TSESTree.LogicalExpression & { readonly operator: '&&' };

const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const TEST_PARENTS = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ConditionalExpression,
]);
const TRUTH_CALLS = new Set(['Boolean']);
const NULLISH = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;

const STRING_CLASS = 'string';
const NUMBER_CLASS = 'number';

const WIDE_CLASSES: readonly (readonly [TypeScript.TypeFlags, string])[] = [
  [ts.TypeFlags.String, STRING_CLASS],
  [ts.TypeFlags.Number, NUMBER_CLASS],
  [ts.TypeFlags.BigInt, 'bigint'],
];
const FALSY_LITERALS: readonly (readonly [string | number | boolean, string])[] = [
  ['', STRING_CLASS],
  [0, NUMBER_CLASS],
  [false, 'boolean'],
];

function falsyClassOf(part: TypeScript.Type): string | undefined {
  const { flags } = part;
  const wide = WIDE_CLASSES.find(([flag]) => flags & flag);
  if (wide !== undefined) {
    return wide[1];
  }
  if (flags & ts.TypeFlags.BooleanLiteral && 'intrinsicName' in part) {
    return part.intrinsicName === 'false' ? 'boolean' : undefined;
  }
  if (part.isStringLiteral()) {
    return part.value === '' ? STRING_CLASS : undefined;
  }
  return part.isNumberLiteral() && part.value === 0 ? NUMBER_CLASS : undefined;
}

function falsyClasses(type: TypeScript.Type): Set<string> {
  const parts = partsOf(type);
  const nullable = parts.some((part) => part.flags & NULLISH);
  const classes = new Set(parts.map(falsyClassOf).filter((name) => name !== undefined));
  return nullable ? classes : new Set<string>();
}

function literalClass(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Literal) {
    return 'bigint' in node && node.bigint === '0'
      ? 'bigint'
      : FALSY_LITERALS.find(([value]) => value === node.value)?.[1];
  }
  return node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.quasis.length === 1 &&
    node.quasis[0]?.value.cooked === ''
    ? STRING_CLASS
    : undefined;
}

function isAbsentValue(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    (node.type === AST_NODE_TYPES.Literal && node.value === null)
  );
}

function isOuterChain(node: TSESTree.Node): boolean {
  const { parent } = node;
  return !(
    parent?.type === AST_NODE_TYPES.LogicalExpression &&
    parent.operator === '||' &&
    parent.left === node
  );
}

function isAnd(node: TSESTree.Node): node is AndExpression {
  return node.type === AST_NODE_TYPES.LogicalExpression && node.operator === '&&';
}

function isTruthTest(parent: TSESTree.Node, child: TSESTree.Node): boolean {
  if (isAnd(parent)) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression) {
    return parent.operator === '!';
  }
  if (TEST_PARENTS.has(parent.type)) {
    return 'test' in parent && parent.test === child;
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.callee.type === AST_NODE_TYPES.Identifier &&
    TRUTH_CALLS.has(parent.callee.name)
  );
}

const TRANSPARENT = new Set<string>([
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.TSNonNullExpression,
]);

function isCondition(node: TSESTree.Node): boolean {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (!TRANSPARENT.has(parent.type) || isAnd(parent)) {
      return isTruthTest(parent, child);
    }
    child = parent;
  }
  return false;
}

function isParameter(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  return (
    definition?.type === TSESLint.Scope.DefinitionType.Parameter &&
    FUNCTIONS.has(definition.node.type)
  );
}

type Scope = TypedScope<MessageIds>;

function reportParameter({ context, sourceCode }: Scope, identifier: TSESTree.Identifier): void {
  const descriptor: TSESLint.ReportDescriptor<MessageIds> = {
    node: identifier,
    messageId: 'falsyDefault',
    data: { name: identifier.name },
  };
  const plan = nullishDefaultFix(sourceCode, identifier);
  context.report(suggestible(descriptor, { messageId: 'useNullishCoalescing', plan }));
}

type Defaulted = { readonly identifiers: TSESTree.Node[]; readonly fallback: TSESTree.Node };

function checkDefault(
  scope: Scope,
  report: TSESTree.Node,
  { identifiers, fallback }: Defaulted,
): void {
  if (isAbsentValue(fallback)) {
    return;
  }
  const finalClass = literalClass(fallback);
  const parameters = identifiers.flatMap((identifier) =>
    identifier.type === AST_NODE_TYPES.Identifier && isParameter(scope.sourceCode, identifier)
      ? [identifier]
      : [],
  );
  for (const identifier of parameters) {
    const classes = falsyClasses(scope.services.getTypeAtLocation(identifier));
    const equal = classes.size === 1 && finalClass !== undefined && classes.has(finalClass);
    if (classes.size > 0 && !equal && !isCondition(report)) {
      reportParameter(scope, identifier);
    }
  }
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: {
      description: 'Disallow replacing a falsy parameter with a default through || or a ternary',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      falsyDefault:
        "`{{ name }}` is replaced by the default whenever it is falsy, so `0`, `''` and `false` count as not given. Default only `undefined` with `??` (`limit ?? DEFAULT_LIMIT`), or test `limit === undefined`.",
      useNullishCoalescing:
        'Default only `undefined` and `null` with `??`. Zero, the empty string and `false` then count as given.',
    },
  },
  create(context) {
    const scope = typedScopeOf(context);
    if (scope === undefined) {
      return {};
    }

    return {
      LogicalExpression(node: TSESTree.LogicalExpression) {
        if (node.operator === '||' && isOuterChain(node)) {
          const operands = orderedOperandsOf(node, '||');
          const fallback = operands.at(-1);
          if (fallback !== undefined) {
            checkDefault(scope, node, { identifiers: operands.slice(0, -1), fallback });
          }
        }
      },
      ConditionalExpression(node: TSESTree.ConditionalExpression) {
        if (
          node.test.type === AST_NODE_TYPES.Identifier &&
          node.consequent.type === AST_NODE_TYPES.Identifier &&
          node.test.name === node.consequent.name
        ) {
          checkDefault(scope, node, { identifiers: [node.test], fallback: node.alternate });
        }
      },
    };
  },
};
