import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';
import { logicalOperands, staticKeyName } from '../analysis/static-shapes.mts';
import { consoleMethodOf } from '../modules/no-production-console.mts';
import { componentVisitor } from './react-components.mts';

type PropOf = (node: TSESTree.Node) => string | undefined;
type Presence = { readonly prop: string; readonly present: boolean };

function localName(property: TSESTree.Property): string | undefined {
  const target =
    property.value.type === AST_NODE_TYPES.AssignmentPattern ? property.value.left : property.value;
  return target.type === AST_NODE_TYPES.Identifier ? target.name : undefined;
}

function propResolver(parameter: TSESTree.Parameter | undefined): PropOf {
  if (parameter?.type === AST_NODE_TYPES.ObjectPattern) {
    const locals = new Map<string | undefined, string | undefined>(
      parameter.properties.flatMap((property) =>
        property.type === AST_NODE_TYPES.Property
          ? [[localName(property), staticKeyName(property)]]
          : [],
      ),
    );
    return (node) => (node.type === AST_NODE_TYPES.Identifier ? locals.get(node.name) : undefined);
  }
  if (parameter?.type === AST_NODE_TYPES.Identifier) {
    return (node) =>
      node.type === AST_NODE_TYPES.MemberExpression &&
      !node.computed &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      node.object.name === parameter.name
        ? nameOf(node.property)
        : undefined;
  }
  return () => undefined;
}

function isAbsentValue(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    (node.type === AST_NODE_TYPES.Literal && node.raw === 'null')
  );
}

function comparisonPresence(node: TSESTree.BinaryExpression, propOf: PropOf): Presence | undefined {
  const present = node.operator === '!==' || node.operator === '!=';
  const absent = node.operator === '===' || node.operator === '==';
  const leftProp = propOf(node.left);
  const prop = leftProp ?? propOf(node.right);
  const other = leftProp === undefined ? node.left : node.right;
  return (present || absent) && prop !== undefined && isAbsentValue(other)
    ? { prop, present }
    : undefined;
}

function presenceOf(node: TSESTree.Node, propOf: PropOf): Presence | undefined {
  const direct = propOf(node);
  if (direct !== undefined) {
    return { prop: direct, present: true };
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!') {
    const prop = propOf(node.argument);
    return prop === undefined ? undefined : { prop, present: false };
  }
  return node.type === AST_NODE_TYPES.BinaryExpression
    ? comparisonPresence(node, propOf)
    : undefined;
}

function exclusiveProps(test: TSESTree.Expression, propOf: PropOf): string[] {
  const checks = logicalOperands(test, '&&').map((operand) => presenceOf(operand, propOf));
  const presences = checks.filter((check) => check !== undefined);
  if (presences.length < checks.length) {
    return [];
  }
  const props = [...new Set(presences.map(({ prop }) => prop))].sort();
  const sameKind = new Set(presences.map(({ present }) => present)).size === 1;
  return sameKind && props.length >= 2 ? props : [];
}

const REJECTING_CONSOLE_METHODS = new Set<string | undefined>(['error', 'warn']);

function rejects(statement: TSESTree.Statement): boolean {
  if (statement.type === AST_NODE_TYPES.ThrowStatement) {
    return true;
  }
  const call =
    statement.type === AST_NODE_TYPES.ExpressionStatement ? statement.expression : undefined;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    REJECTING_CONSOLE_METHODS.has(consoleMethodOf(call))
  );
}

function consequentRejects(consequent: TSESTree.Statement): boolean {
  const statements =
    consequent.type === AST_NODE_TYPES.BlockStatement ? consequent.body : [consequent];
  return statements.some(rejects);
}

export const rule: TSESLint.RuleModule<'exclusiveProps'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a runtime check that rejects a combination of props',
    },
    schema: [],
    messages: {
      exclusiveProps:
        'Props {{ props }} are checked together at runtime. Make the props a discriminated union (`{ icon: Icon; image?: never } | { image: string; icon?: never }`) so the compiler rejects the combination.',
    },
  },
  create(context) {
    return componentVisitor(({ node, ifs }) => {
      const propOf = propResolver(node.params[0]);
      for (const statement of ifs) {
        const props = exclusiveProps(statement.test, propOf);
        if (props.length > 0 && consequentRejects(statement.consequent)) {
          context.report({
            node: statement,
            messageId: 'exclusiveProps',
            data: { props: props.map((prop) => `\`${prop}\``).join(', ') },
          });
        }
      }
    });
  },
};
