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
const sequenceOperators = new Set(['&&', '||']);
const outsideFunctions = { root: undefined, nesting: 0 };
const DEFAULT_MAX = 15;

function isElseIf(node) {
  return (
    node.type === 'IfStatement' &&
    node.parent.type === 'IfStatement' &&
    node.parent.alternate === node
  );
}

function nestsChild(parent, child) {
  switch (parent.type) {
    case 'IfStatement':
      return (
        parent.consequent === child || (parent.alternate === child && child.type !== 'IfStatement')
      );
    case 'ConditionalExpression':
      return parent.test !== child;
    case 'SwitchStatement':
      return parent.discriminant !== child;
    case 'CatchClause':
      return parent.body === child;
    default:
      return loopTypes.has(parent.type) && parent.body === child;
  }
}

function startsLogicalSequence(node) {
  return (
    sequenceOperators.has(node.operator) &&
    (node.parent.type !== 'LogicalExpression' || node.parent.operator !== node.operator)
  );
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

function reportFunction({ context, max, scores }, fn) {
  const value = scores.get(fn) ?? 0;
  if (value <= max) return;
  context.report({
    loc: headLocation(context.sourceCode, fn),
    messageId: 'tooComplex',
    data: { value: String(value), max: String(max) },
  });
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
        'This function has a cognitive complexity of {{value}}; the limit is {{max}}. Move nested branches and conditions into smaller named functions. If it must stay this way, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const max = context.options[0] ?? DEFAULT_MAX;
    const positions = new Map();
    const scores = new Map();

    function positionOf(node) {
      if (functionTypes.has(node.type)) return { root: node, nesting: 0 };
      const parent = node.parent ? positions.get(node.parent) : undefined;
      if (parent === undefined) return outsideFunctions;
      const nests = nestsChild(node.parent, node) ? 1 : 0;
      return { root: parent.root, nesting: parent.nesting + nests };
    }

    function add(node, { nested }) {
      const { root, nesting } = positionOf(node);
      if (root === undefined) return;
      scores.set(root, (scores.get(root) ?? 0) + (nested ? 1 + nesting : 1));
    }

    return {
      '*'(node) {
        positions.set(node, positionOf(node));
      },
      IfStatement(node) {
        add(node, { nested: !isElseIf(node) });
        if (node.alternate && node.alternate.type !== 'IfStatement') {
          add(node.alternate, { nested: false });
        }
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
      ':function:exit'(fn) {
        reportFunction({ context, max, scores }, fn);
      },
    };
  },
};
