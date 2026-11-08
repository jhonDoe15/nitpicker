const MAX_CYCLE_CLASSES = 6;
const MAX_PATHS = 5000;

function byPosition(left, right) {
  return left.file.localeCompare(right.file) || left.line - right.line;
}

function outgoing(edges) {
  const from = new Map();
  for (const edge of edges) {
    from.set(edge.from, [...(from.get(edge.from) ?? []), edge]);
  }
  return from;
}

function closingEdge(cycle) {
  const single = cycle.filter((edge) => !edge.many);
  const candidates = single.length > 0 ? single : cycle;
  return candidates.toSorted(byPosition).at(-1);
}

function selfCycles(edges) {
  const byClass = outgoing(edges.filter((edge) => edge.from === edge.to));
  return [...byClass.values()].flatMap((own) => {
    const single = own.filter((edge) => !edge.many).toSorted(byPosition);
    const many = own.filter((edge) => edge.many).toSorted(byPosition);
    return single.length > 0 && many.length > 0 ? [[many[0], single[0]]] : [];
  });
}

function cyclesFrom(start, { from, rank }) {
  const cycles = [];
  const pending = [{ path: [], seen: new Set([start]) }];
  for (const { path, seen } of pending) {
    const head = path.length === 0 ? start : path.at(-1).to;
    for (const edge of from.get(head) ?? []) {
      if (edge.to === start && path.length > 0) {
        cycles.push([...path, edge]);
      } else if (
        !seen.has(edge.to) &&
        (rank.get(edge.to) ?? -1) > rank.get(start) &&
        path.length + 1 < MAX_CYCLE_CLASSES &&
        pending.length < MAX_PATHS
      ) {
        pending.push({ path: [...path, edge], seen: new Set([...seen, edge.to]) });
      }
    }
  }
  return cycles;
}

function longerCycles(edges) {
  const from = outgoing(edges.filter((edge) => edge.from !== edge.to));
  const order = [...from.keys()].sort();
  const rank = new Map(order.map((name, index) => [name, index]));
  return order.flatMap((start) => cyclesFrom(start, { from, rank }));
}

export function memberCycles(edges) {
  const closing = new Map();
  for (const cycle of [...selfCycles(edges), ...longerCycles(edges)]) {
    const edge = closingEdge(cycle);
    const key = `${edge.file}\0${String(edge.line)}\0${edge.field}`;
    if (!closing.has(key)) {
      closing.set(key, { edge, cycle });
    }
  }
  return [...closing.values()].toSorted((left, right) => byPosition(left.edge, right.edge));
}

export function cycleText(cycle, edge) {
  const start = cycle.indexOf(edge) + 1;
  const ordered = [...cycle.slice(start), ...cycle.slice(0, start)];
  return [...ordered.map((step) => `${step.fromName}.${step.field}`), ordered.at(-1).toName].join(
    ' -> ',
  );
}
