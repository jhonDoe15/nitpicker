export function staticKeyName(key, computed = false) {
  if (computed) {
    return undefined;
  }
  if (key.type === 'Identifier') {
    return key.name;
  }
  return key.type === 'Literal' && typeof key.value === 'string' ? key.value : undefined;
}

export function logicalOperands(test, operator) {
  const operands = [];
  const pending = [test];
  for (const node of pending) {
    if (node.type === 'LogicalExpression' && node.operator === operator) {
      pending.push(node.left, node.right);
    } else {
      operands.push(node);
    }
  }
  return operands.sort((first, second) => first.range[0] - second.range[0]);
}
