const JUMPS = new Map([
  ['return', 'returns'],
  ['throw', 'throws'],
  ['break', 'breaks'],
  ['continue', 'continues'],
]);

export function statementsOf(node) {
  if (node === undefined || node.kind === 'none') {
    return [];
  }
  return node.kind === 'block' ? node.children : [node];
}

export function exitOf(node) {
  const pending = [node];
  for (const current of pending) {
    const last = statementsOf(current).at(-1);
    if (last?.kind === 'if' && last.children[2].kind !== 'none') {
      pending.push(last.children[1], last.children[2]);
    } else if (!JUMPS.has(last?.kind)) {
      return undefined;
    }
  }
  const last = statementsOf(node).at(-1);
  return JUMPS.get(last.kind) ?? 'leaves';
}

export function textOf(node, subject = 'condition') {
  return node.text ?? `the ${subject} on line ${String(node.start)}`;
}

export function sourceOf(node) {
  return node.text ?? String(node.value ?? '');
}

export function binaryOf(operator, left, right) {
  return {
    kind: 'binary',
    value: operator,
    children: [left, right],
    start: left.start,
    end: right.end ?? left.end,
    text: `${sourceOf(left)} ${operator} ${sourceOf(right)}`,
  };
}

export function valueEqualOf(left, right) {
  return { ...binaryOf('==', left, right), equal: true };
}
