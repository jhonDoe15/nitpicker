const TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);
const MINIMUM_ELEMENTS = 2;
const FALLS_THROUGH = 'falls through';

export function isLiteralValue(node) {
  return node.type === 'Literal' && ['string', 'number'].includes(typeof node.value);
}

export function isPlainReference(node) {
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

function withoutTypeWrappers(node) {
  const pending = [node];
  for (const current of pending) {
    if (!TYPE_WRAPPERS.has(current.type)) {
      return current;
    }
    pending.push(current.expression);
  }
  return node;
}

function literalElements(node) {
  const list = withoutTypeWrappers(node);
  const isLiteralList =
    list.type === 'ArrayExpression' &&
    list.elements.length >= MINIMUM_ELEMENTS &&
    list.elements.every((element) => element !== null && isLiteralValue(element));
  return isLiteralList ? list.elements : undefined;
}

function isNewSet(node) {
  return (
    node.type === 'NewExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Set' &&
    node.arguments.length === 1
  );
}

function listedElements(callee) {
  const receiver = withoutTypeWrappers(callee.object);
  if (callee.property.name === 'includes') {
    return literalElements(receiver);
  }
  return callee.property.name === 'has' && isNewSet(receiver)
    ? literalElements(receiver.arguments[0])
    : undefined;
}

export function membershipComparisons(node) {
  if (node.type !== 'CallExpression' || node.optional || node.arguments.length !== 1) {
    return undefined;
  }
  const { callee } = node;
  const [subject] = node.arguments;
  if (callee.type !== 'MemberExpression' || callee.computed || !isPlainReference(subject)) {
    return undefined;
  }
  return listedElements(callee)?.map((element) => ({ subject, value: element.value }));
}

function returnedBoolean(statements) {
  const [first] = statements;
  const body = statements.length === 1 && first.type === 'BlockStatement' ? first.body : statements;
  if (body.length === 0) {
    return FALLS_THROUGH;
  }
  const [only] = body;
  const returnsBoolean =
    body.length === 1 &&
    only.type === 'ReturnStatement' &&
    only.argument?.type === 'Literal' &&
    typeof only.argument.value === 'boolean';
  return returnsBoolean ? only.argument.value : undefined;
}

function effectiveValues(values) {
  return values.map((value, index) =>
    value === FALLS_THROUGH ? values.slice(index).find((later) => later !== FALLS_THROUGH) : value,
  );
}

export function switchComparisons(node) {
  const own = node.cases.map((entry) => returnedBoolean(entry.consequent));
  const values = effectiveValues(own);
  const defaultIndex = node.cases.findIndex((entry) => entry.test === null);
  const fallback = own[defaultIndex];
  if (!isPlainReference(node.discriminant) || typeof fallback !== 'boolean') {
    return undefined;
  }
  const listed = node.cases.filter(
    (entry, index) => entry.test !== null && values[index] !== fallback,
  );
  const isPartialSwitch =
    listed.length >= MINIMUM_ELEMENTS &&
    values.every((value) => typeof value === 'boolean') &&
    own.every(
      (value, index) => index === defaultIndex || value === FALLS_THROUGH || value !== fallback,
    ) &&
    listed.every((entry) => isLiteralValue(entry.test));
  return isPartialSwitch
    ? listed.map((entry) => ({ subject: node.discriminant, value: entry.test.value }))
    : undefined;
}
