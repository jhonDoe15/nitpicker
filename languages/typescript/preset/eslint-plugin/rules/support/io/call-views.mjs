import ts from 'typescript';

const ESTREE_WRAPPERS = new Set([
  'AwaitExpression',
  'ChainExpression',
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
]);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const SPREAD = '...';
const IDENTIFIER = 'Identifier';

function linksLabel(links) {
  return `${links.map(({ name, called }) => (called ? `${name}()` : name)).join('.')}()`;
}

function viewOf(links, root, args) {
  return {
    names: links.map(({ name }) => name).filter((name) => name !== 'this'),
    label: linksLabel(links),
    method: links.at(-1)?.name,
    root,
    args,
  };
}

function estreeStep(node) {
  if (ESTREE_WRAPPERS.has(node.type)) {
    return { next: node.expression ?? node.argument };
  }
  if (node.type === 'MemberExpression') {
    return { name: node.computed ? '[]' : node.property.name, next: node.object };
  }
  if (node.type === 'CallExpression') {
    return { next: node.callee, called: true };
  }
  if (node.type === IDENTIFIER) {
    return { name: node.name, root: node };
  }
  return node.type === 'ThisExpression' ? { name: 'this' } : {};
}

function isTsWrapper(node) {
  return (
    ts.isAwaitExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node)
  );
}

function tsStep(node) {
  if (isTsWrapper(node)) {
    return { next: node.expression };
  }
  if (ts.isPropertyAccessExpression(node)) {
    return { name: node.name.text, next: node.expression };
  }
  if (ts.isElementAccessExpression(node)) {
    return { name: '[]', next: node.expression };
  }
  if (ts.isCallExpression(node)) {
    return { next: node.expression, called: true };
  }
  if (ts.isIdentifier(node)) {
    return { name: node.text, root: node };
  }
  return node.kind === ts.SyntaxKind.ThisKeyword ? { name: 'this' } : {};
}

function isCalledLink(steps, index) {
  const previous = steps.slice(0, index).findLast((step) => step.name !== undefined || step.called);
  return previous?.called === true;
}

function chainLinks(callee, step) {
  const steps = [];
  const pending = [callee];
  for (const node of pending) {
    const current = step(node);
    steps.push(current);
    if (current.next !== undefined) {
      pending.push(current.next);
    }
  }
  const links = steps.flatMap((current, index) =>
    current.name === undefined ? [] : [{ name: current.name, called: isCalledLink(steps, index) }],
  );
  return { links: links.toReversed(), root: steps.find((current) => current.root)?.root };
}

function estreeChildren(node) {
  if (node?.type === 'ArrayExpression') {
    return node.elements.map((element) => ({ value: element }));
  }
  return node?.type === 'ObjectExpression'
    ? node.properties.map((property) => ({
        key: property.type === 'Property' && !property.computed ? property.key.name : SPREAD,
        value: property.value,
      }))
    : [];
}

function tsChildren(node) {
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => ({ value: element }));
  }
  return ts.isObjectLiteralExpression(node)
    ? node.properties.map((property) => ({
        key:
          property.name !== undefined && ts.isIdentifier(property.name)
            ? property.name.text
            : SPREAD,
        value: ts.isPropertyAssignment(property) ? property.initializer : undefined,
      }))
    : [];
}

function deepKeys(root, children) {
  const keys = new Set();
  const pending = [root];
  for (const node of pending) {
    const entries = children(node);
    for (const { key } of entries.filter((entry) => entry.key !== undefined)) {
      keys.add(key);
    }
    pending.push(
      ...entries.map(({ value }) => value).filter((value) => value !== undefined && value !== null),
    );
  }
  return keys;
}

function estreeLiteral(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return { type: 'text', text: node.value };
  }
  if (node.type === 'TemplateLiteral') {
    return { type: 'text', text: node.quasis.map((quasi) => quasi.value.raw).join('?') };
  }
  if (FUNCTIONS.has(node.type)) {
    return { type: 'function' };
  }
  const isLiteral = node.type === 'ObjectExpression' || node.type === 'ArrayExpression';
  return isLiteral ? { type: 'object', keys: deepKeys(node, estreeChildren) } : { type: 'other' };
}

function estreeArgument(node) {
  if (node.type === 'NewExpression' && node.callee.type === IDENTIFIER) {
    const [input] = node.arguments;
    return { type: 'new', name: node.callee.name, input: input && estreeLiteral(input) };
  }
  return estreeLiteral(node);
}

export function estreeCallView(call) {
  const tagged = call.type === 'TaggedTemplateExpression';
  const { links, root } = chainLinks(tagged ? call.tag : call.callee, estreeStep);
  const args = tagged ? [estreeLiteral(call.quasi)] : call.arguments.map(estreeArgument);
  return viewOf(links, root, args);
}

function tsTemplateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('?');
}

function tsLiteral(node) {
  if (ts.isStringLiteral(node)) {
    return { type: 'text', text: node.text };
  }
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
    return { type: 'text', text: tsTemplateText(node) };
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return { type: 'function' };
  }
  const isLiteral = ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node);
  return isLiteral ? { type: 'object', keys: deepKeys(node, tsChildren) } : { type: 'other' };
}

function tsArgument(node) {
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
    const input = node.arguments?.[0];
    return { type: 'new', name: node.expression.text, input: input && tsLiteral(input) };
  }
  return tsLiteral(node);
}

export function tsCallee(call) {
  return ts.isTaggedTemplateExpression(call) ? call.tag : call.expression;
}

export function tsCallView(call) {
  const { links, root } = chainLinks(tsCallee(call), tsStep);
  const args = ts.isTaggedTemplateExpression(call)
    ? [{ type: 'text', text: tsTemplateText(call.template) }]
    : call.arguments.map(tsArgument);
  return viewOf(links, root, args);
}
