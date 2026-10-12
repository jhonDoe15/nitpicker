import { ancestorsOf } from './ancestry.mjs';

const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const loopTypes = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);
const nestedStructureTypes = new Set([
  ...loopTypes,
  'ConditionalExpression',
  'SwitchStatement',
  'CatchClause',
]);
const DEFAULT_MAX = 15;

function isElseIf(node) {
  return (
    node.type === 'IfStatement' &&
    node.parent.type === 'IfStatement' &&
    node.parent.alternate === node
  );
}

function nestsChild(ancestor, child) {
  switch (ancestor.type) {
    case 'IfStatement':
      return !isElseIf(ancestor) && ancestor.test !== child;
    case 'ConditionalExpression':
      return ancestor.test !== child;
    case 'SwitchStatement':
      return ancestor.discriminant !== child;
    case 'CatchClause':
      return ancestor.body === child;
    default:
      return loopTypes.has(ancestor.type) && ancestor.body === child;
  }
}

function functionPath(node) {
  const ancestors = ancestorsOf(node);
  const nearest = ancestors.findIndex((ancestor) => functionTypes.has(ancestor.type));
  return nearest === -1
    ? undefined
    : { root: ancestors[nearest], ancestors: ancestors.slice(0, nearest + 1) };
}

function nestingOf(node, ancestors) {
  const children = [node, ...ancestors];
  return ancestors.filter((ancestor, index) => {
    const isRoot = index === ancestors.length - 1;
    return !isRoot && nestsChild(ancestor, children[index]);
  }).length;
}

function startsLogicalSequence(node) {
  return node.parent.type !== 'LogicalExpression' || node.parent.operator !== node.operator;
}

function headLocation(sourceCode, fn) {
  if (fn.id) return fn.id.loc;
  const parent = fn.parent;
  if (['MethodDefinition', 'Property', 'PropertyDefinition'].includes(parent.type)) {
    return parent.key.loc;
  }
  if (fn.type === 'ArrowFunctionExpression') {
    return sourceCode.getTokenBefore(fn.body, (token) => token.value === '=>').loc;
  }
  return sourceCode.getFirstToken(fn).loc;
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Limit how hard a function is to read: branches, loops and boolean chains cost more the deeper they nest',
    },
    schema: [{ type: 'integer', minimum: 0 }],
    messages: {
      tooComplex:
        'This function has a cognitive complexity of {{value}}; the limit is {{max}}. Move nested branches and conditions into smaller named functions.',
    },
  },
  create(context) {
    const max = context.options[0] ?? DEFAULT_MAX;
    const scores = new Map();

    function add(node, { nested }) {
      const path = functionPath(node);
      if (path === undefined) return;
      const increment = nested ? 1 + nestingOf(node, path.ancestors) : 1;
      scores.set(path.root, (scores.get(path.root) ?? 0) + increment);
    }

    function reportRoot(fn) {
      const value = scores.get(fn) ?? 0;
      if (value <= max) return;
      context.report({
        loc: headLocation(context.sourceCode, fn),
        messageId: 'tooComplex',
        data: { value: String(value), max: String(max) },
      });
    }

    return {
      IfStatement(node) {
        add(node, { nested: !isElseIf(node) });
        if (node.alternate && node.alternate.type !== 'IfStatement')
          add(node.alternate, { nested: false });
      },
      [[...nestedStructureTypes].join(',')](node) {
        add(node, { nested: true });
      },
      'BreakStatement[label], ContinueStatement[label]'(node) {
        add(node, { nested: false });
      },
      LogicalExpression(node) {
        if (startsLogicalSequence(node)) add(node, { nested: false });
      },
      ':function:exit': reportRoot,
    };
  },
};
