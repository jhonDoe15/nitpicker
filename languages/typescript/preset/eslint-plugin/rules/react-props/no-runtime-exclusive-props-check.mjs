import { logicalOperands, staticKeyName } from '../analysis/static-shapes.mjs';
import { consoleMethodOf } from '../modules/no-production-console.mjs';
import { componentVisitor } from './react-components.mjs';

function localName(property) {
  const target = property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
  return target.type === 'Identifier' ? target.name : undefined;
}

function propResolver(parameter) {
  if (parameter?.type === 'ObjectPattern') {
    const locals = new Map(
      parameter.properties
        .filter((property) => property.type === 'Property')
        .map((property) => [localName(property), staticKeyName(property.key, property.computed)]),
    );
    return (node) => (node.type === 'Identifier' ? locals.get(node.name) : undefined);
  }
  if (parameter?.type === 'Identifier') {
    return (node) =>
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.object.type === 'Identifier' &&
      node.object.name === parameter.name
        ? node.property.name
        : undefined;
  }
  return () => undefined;
}

function isAbsentValue(node) {
  return (
    (node.type === 'Identifier' && node.name === 'undefined') ||
    (node.type === 'Literal' && node.raw === 'null')
  );
}

function comparisonPresence(node, propOf) {
  const present = node.operator === '!==' || node.operator === '!=';
  const absent = node.operator === '===' || node.operator === '==';
  const leftProp = propOf(node.left);
  const prop = leftProp ?? propOf(node.right);
  const other = leftProp === undefined ? node.left : node.right;
  return (present || absent) && prop !== undefined && isAbsentValue(other)
    ? { prop, present }
    : undefined;
}

function presenceOf(node, propOf) {
  const direct = propOf(node);
  if (direct !== undefined) {
    return { prop: direct, present: true };
  }
  if (node.type === 'UnaryExpression' && node.operator === '!') {
    const prop = propOf(node.argument);
    return prop === undefined ? undefined : { prop, present: false };
  }
  return node.type === 'BinaryExpression' ? comparisonPresence(node, propOf) : undefined;
}

function exclusiveProps(test, propOf) {
  const checks = logicalOperands(test, '&&').map((operand) => presenceOf(operand, propOf));
  if (checks.some((check) => check === undefined)) {
    return [];
  }
  const props = [...new Set(checks.map(({ prop }) => prop))].sort();
  const sameKind = new Set(checks.map(({ present }) => present)).size === 1;
  return sameKind && props.length >= 2 ? props : [];
}

const REJECTING_CONSOLE_METHODS = new Set(['error', 'warn']);

function rejects(statement) {
  if (statement.type === 'ThrowStatement') {
    return true;
  }
  const call = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
  return call?.type === 'CallExpression' && REJECTING_CONSOLE_METHODS.has(consoleMethodOf(call));
}

function consequentRejects(consequent) {
  const statements = consequent.type === 'BlockStatement' ? consequent.body : [consequent];
  return statements.some(rejects);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a runtime check that rejects a combination of props',
    },
    schema: [],
    messages: {
      exclusiveProps:
        'Props {{ props }} are checked together at runtime. Make the props a discriminated union (`{ icon: Icon; image?: never } | { image: string; icon?: never }`) so the compiler rejects the combination. If a runtime check is still needed, add an exception for this rule in nitpicker.config.json.',
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
