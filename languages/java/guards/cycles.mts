import { isExplainedCycle as untypedIsExplainedCycle } from '../../../shared/graph/explained-cycles.mjs';
import { listed as untypedListed } from '../../../shared/rules/features/feature-boundaries.mjs';
import { RULE_IDS } from '../../../shared/policy.mjs';
import type { Finding } from '../../../shared/values/findings.mts';
import type {
  CycleEdge,
  CycleFeatures,
  CycleGraph,
  ExplainedCycleCheck,
  FileEdge,
} from './typed/cycle-types.mts';

const isExplainedCycle: ExplainedCycleCheck = untypedIsExplainedCycle;
const listed: (items: readonly string[]) => string = untypedListed;
const PACKAGE_CYCLE_RULE: string = RULE_IDS.packageCycle;

type Adjacency = ReadonlyMap<string, readonly string[]>;
type Graph = {
  forward: Adjacency;
  backward: Adjacency;
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
  remaining: Set<string>;
  queue: string[];
};
type ComponentState = {
  forward: Adjacency;
  backward: Adjacency;
  core: ReadonlySet<string>;
  assigned: Set<string>;
  components: string[][];
};

function adjacencyOf(
  edges: readonly CycleEdge[],
  from: keyof CycleEdge,
  to: keyof CycleEdge,
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge[from], [...(adjacency.get(edge[from]) ?? []), edge[to]]);
  }
  return adjacency;
}

function decrement(degree: Map<string, number>, node: string, queue: string[]): void {
  const left = (degree.get(node) ?? 0) - 1;
  degree.set(node, left);
  if (left === 0) {
    queue.push(node);
  }
}

function release(graph: Graph, node: string): void {
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

function inLoops(nodes: readonly string[], forward: Adjacency, backward: Adjacency): Set<string> {
  const inDegree = new Map(nodes.map((node) => [node, (backward.get(node) ?? []).length]));
  const outDegree = new Map(nodes.map((node) => [node, (forward.get(node) ?? []).length]));
  const graph: Graph = {
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

function reachable(adjacency: Adjacency, start: string, allowed: ReadonlySet<string>): Set<string> {
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

function collectComponent(state: ComponentState, node: string): void {
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

export function cyclicComponents(
  nodes: readonly string[],
  edges: readonly CycleEdge[],
): string[][] {
  const forward = adjacencyOf(edges, 'source', 'target');
  const backward = adjacencyOf(edges, 'target', 'source');
  const state: ComponentState = {
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

function memberFinding({
  tool,
  member,
  others,
  path,
}: {
  tool: string;
  member: string;
  others: readonly string[];
  path: string;
}): Finding {
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

function packageEdges(
  edges: readonly CycleEdge[],
  packageOf: (name: string) => string,
): CycleEdge[] {
  const seen = new Map<string, CycleEdge>();
  for (const edge of edges) {
    const mapped = { source: packageOf(edge.source), target: packageOf(edge.target) };
    seen.set(`${mapped.source}\0${mapped.target}`, mapped);
  }
  return [...seen.values()].filter((edge) => edge.source !== edge.target);
}

const NO_FEATURES: CycleFeatures = {
  explainedCycles: [],
  featureOf: () => undefined,
  generatedFiles: new Set(),
};

function fileEdges(
  edges: readonly CycleEdge[],
  { packageOf, fileOf }: Pick<CycleGraph, 'packageOf' | 'fileOf'>,
): FileEdge[] {
  return edges
    .map((edge) => ({
      source: packageOf(edge.source),
      target: packageOf(edge.target),
      files: `${fileOf(edge.source)}\0${fileOf(edge.target)}`,
    }))
    .filter((edge) => edge.source !== edge.target);
}

export function cycleFindings(
  { modules, edges, packageOf, fileOf }: CycleGraph,
  tool: string,
  features: CycleFeatures = NO_FEATURES,
): Finding[] {
  const generated = features.generatedFiles;
  const known = new Set(modules.filter((name) => !generated.has(fileOf(name))));
  const internal = edges.filter((edge) => known.has(edge.source) && known.has(edge.target));
  const sorted = [...known].sort((left, right) => left.localeCompare(right));
  function anchorOf(member: string): string {
    return fileOf(sorted.find((name) => packageOf(name) === member) ?? '');
  }
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
