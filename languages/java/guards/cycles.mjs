import { isExplainedCycle } from '../../../shared/graph/explained-cycles.mjs';
import { listed } from '../../../shared/rules/features/feature-boundaries.mjs';
import { RULE_IDS } from '../../../shared/policy.mjs';

const PACKAGE_CYCLE_RULE = RULE_IDS.packageCycle;

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
    .sort((left, right) => left.localeCompare(right));
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
  for (const node of [...state.core].sort((left, right) => left.localeCompare(right))) {
    collectComponent(state, node);
  }
  return state.components.filter((component) => component.length > 1);
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

const NO_FEATURES = { explainedCycles: [], featureOf: () => undefined, generatedFiles: new Set() };

function fileEdges(edges, { packageOf, fileOf }) {
  return edges
    .map((edge) => ({
      source: packageOf(edge.source),
      target: packageOf(edge.target),
      files: `${fileOf(edge.source)}\0${fileOf(edge.target)}`,
    }))
    .filter((edge) => edge.source !== edge.target);
}

export function cycleFindings({ modules, edges, packageOf, fileOf }, tool, features = NO_FEATURES) {
  const generated = features.generatedFiles ?? new Set();
  const known = new Set(modules.filter((name) => !generated.has(fileOf(name))));
  const internal = edges.filter((edge) => known.has(edge.source) && known.has(edge.target));
  const sorted = [...known].sort((left, right) => left.localeCompare(right));
  const anchorOf = (member) => fileOf(sorted.find((name) => packageOf(name) === member));
  const packaged = fileEdges(internal, { packageOf, fileOf });
  const components = cyclicComponents([...known].map(packageOf), packageEdges(internal, packageOf));
  return components
    .filter(
      (members) =>
        !isExplainedCycle(members, {
          packaged,
          anchor: new Map(members.map((member) => [member, anchorOf(member)])),
          features,
        }),
    )
    .flatMap((members) =>
      members.map((member) =>
        memberFinding({
          tool,
          member,
          others: members.filter((other) => other !== member),
          path: anchorOf(member),
        }),
      ),
    );
}
