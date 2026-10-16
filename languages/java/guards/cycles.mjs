import { RULE_IDS } from '../../../shared/policy.mjs';

const PACKAGE_CYCLE_RULE = RULE_IDS.packageCycle;
const LISTED_MEMBERS = 5;

function adjacencyOf(edges, from, to) {
  const adjacency = new Map();
  for (const edge of edges) {
    adjacency.set(edge[from], [...(adjacency.get(edge[from]) ?? []), edge[to]]);
  }
  return adjacency;
}

function decrement(degree, node, queue) {
  const left = degree.get(node) - 1;
  degree.set(node, left);
  if (left === 0) {
    queue.push(node);
  }
}

function release(graph, node) {
  if (!graph.remaining.delete(node)) {
    return;
  }
  for (const next of graph.forward.get(node) ?? []) {
    decrement(graph.inDegree, next, graph.queue);
  }
  for (const previous of graph.backward.get(node) ?? []) {
    decrement(graph.outDegree, previous, graph.queue);
  }
}

function inLoops(nodes, forward, backward) {
  const inDegree = new Map(nodes.map((node) => [node, (backward.get(node) ?? []).length]));
  const outDegree = new Map(nodes.map((node) => [node, (forward.get(node) ?? []).length]));
  const graph = {
    forward,
    backward,
    inDegree,
    outDegree,
    remaining: new Set(nodes),
    queue: nodes.filter((node) => inDegree.get(node) === 0 || outDegree.get(node) === 0),
  };
  for (const node of graph.queue) {
    release(graph, node);
  }
  return graph.remaining;
}

function reachable(adjacency, start, allowed) {
  const seen = new Set([start]);
  const queue = [start];
  for (const current of queue) {
    const fresh = (adjacency.get(current) ?? []).filter(
      (next) => allowed.has(next) && !seen.has(next),
    );
    for (const next of fresh) {
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function collectComponent(state, node) {
  if (state.assigned.has(node)) {
    return;
  }
  const ahead = reachable(state.forward, node, state.core);
  const component = [...reachable(state.backward, node, state.core)]
    .filter((member) => ahead.has(member))
    .sort();
  for (const member of component) {
    state.assigned.add(member);
  }
  state.components.push(component);
}

export function cyclicComponents(nodes, edges) {
  const forward = adjacencyOf(edges, 'source', 'target');
  const backward = adjacencyOf(edges, 'target', 'source');
  const state = {
    forward,
    backward,
    core: inLoops([...new Set(nodes)], forward, backward),
    assigned: new Set(),
    components: [],
  };
  for (const node of [...state.core].sort()) {
    collectComponent(state, node);
  }
  return state.components.filter((component) => component.length > 1);
}

function listed(members) {
  const shown = members.slice(0, LISTED_MEMBERS).join(', ');
  return members.length > LISTED_MEMBERS
    ? `${shown} and ${String(members.length - LISTED_MEMBERS)} more`
    : shown;
}

function memberFinding({ tool, member, others, path }) {
  return {
    tool,
    rule: PACKAGE_CYCLE_RULE,
    path,
    identity: `cycle:${member}`,
    message:
      `Package ${member} is in a dependency cycle with ${listed(others)}. ` +
      'Move the shared types down into one of them, or invert one dependency behind an interface.',
    classification: 'enforceable',
  };
}

function packageEdges(edges, packageOf) {
  const seen = new Map();
  for (const edge of edges) {
    const mapped = { source: packageOf(edge.source), target: packageOf(edge.target) };
    seen.set(`${mapped.source}\0${mapped.target}`, mapped);
  }
  return [...seen.values()].filter((edge) => edge.source !== edge.target);
}

export function cycleFindings({ modules, edges, packageOf, fileOf }, tool) {
  const known = new Set(modules);
  const internal = edges.filter((edge) => known.has(edge.source) && known.has(edge.target));
  const sorted = [...modules].sort();
  const components = cyclicComponents(modules.map(packageOf), packageEdges(internal, packageOf));
  return components.flatMap((members) =>
    members.map((member) =>
      memberFinding({
        tool,
        member,
        others: members.filter((other) => other !== member),
        path: fileOf(sorted.find((name) => packageOf(name) === member)),
      }),
    ),
  );
}
