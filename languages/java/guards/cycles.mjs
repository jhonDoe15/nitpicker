import { RULE_IDS } from '../../../shared/policy.mjs';
import { hash } from '../../../shared/rules/finding-helpers.mjs';

const PACKAGE_CYCLE_RULE = RULE_IDS.packageCycle;
const CLASS_CYCLE_RULE = RULE_IDS.classCycle;
const LISTED_MEMBERS = 5;

function adjacencyOf(edges) {
  const adjacency = new Map();
  for (const { source, target } of edges) {
    adjacency.set(source, [...(adjacency.get(source) ?? []), target]);
  }
  return adjacency;
}

function visit(state, node) {
  state.index.set(node, state.counter);
  state.low.set(node, state.counter);
  state.counter += 1;
  state.stack.push(node);
  state.onStack.add(node);
  state.work.push({ node, next: 0 });
}

function lower(state, node, value) {
  state.low.set(node, Math.min(state.low.get(node), value));
}

function advance(state, frame) {
  const target = (state.adjacency.get(frame.node) ?? [])[frame.next];
  frame.next += 1;
  if (!state.index.has(target)) {
    visit(state, target);
  } else if (state.onStack.has(target)) {
    lower(state, frame.node, state.index.get(target));
  }
}

function close(state, frame) {
  state.work.pop();
  if (state.low.get(frame.node) === state.index.get(frame.node)) {
    const component = state.stack.splice(state.stack.lastIndexOf(frame.node));
    for (const member of component) {
      state.onStack.delete(member);
    }
    state.components.push(component);
  }
  const parent = state.work.at(-1);
  if (parent !== undefined) {
    lower(state, parent.node, state.low.get(frame.node));
  }
}

function openFrames(state) {
  return {
    [Symbol.iterator]: () => ({
      next: () =>
        state.work.length > 0 ? { done: false, value: state.work.at(-1) } : { done: true },
    }),
  };
}

function explore(state, root) {
  visit(state, root);
  for (const frame of openFrames(state)) {
    if (frame.next < (state.adjacency.get(frame.node) ?? []).length) {
      advance(state, frame);
    } else {
      close(state, frame);
    }
  }
}

export function cyclicComponents(nodes, edges) {
  const state = {
    adjacency: adjacencyOf(edges),
    index: new Map(),
    low: new Map(),
    onStack: new Set(),
    stack: [],
    work: [],
    components: [],
    counter: 0,
  };
  for (const node of [...nodes].sort()) {
    if (!state.index.has(node)) {
      explore(state, node);
    }
  }
  return state.components
    .filter((component) => component.length > 1)
    .map((component) => component.sort())
    .sort((left, right) => left[0].localeCompare(right[0]));
}

function listed(members) {
  const shown = members.slice(0, LISTED_MEMBERS).join(', ');
  return members.length > LISTED_MEMBERS
    ? `${shown} and ${String(members.length - LISTED_MEMBERS)} more`
    : shown;
}

function cycleFinding({ tool, rule, kind, members, path }) {
  const fix =
    rule === PACKAGE_CYCLE_RULE
      ? 'Move the shared types down into one of them, or invert one dependency behind an interface.'
      : 'Break the loop: pass what is needed as a parameter, or invert one dependency behind an interface.';
  return {
    tool,
    rule,
    path,
    identity: `cycle:${hash(members.join('\0'))}`,
    message: `${kind} ${listed(members)} depend on each other. ${fix} If it is right here, add an exception for ${tool}/${rule} in nitpicker.config.json.`,
    classification: 'enforceable',
  };
}

function distinctEdges(edges, keyOf) {
  const seen = new Map();
  for (const edge of edges) {
    const mapped = { source: keyOf(edge.source), target: keyOf(edge.target) };
    if (mapped.source !== mapped.target) {
      seen.set(`${mapped.source}\0${mapped.target}`, mapped);
    }
  }
  return [...seen.values()];
}

export function cycleFindings({ modules, edges, packageOf, fileOf }, tool) {
  const known = new Set(modules);
  const internal = edges.filter((edge) => known.has(edge.source) && known.has(edge.target));
  const classCycles = cyclicComponents(
    modules,
    distinctEdges(internal, (name) => name),
  );
  const packageCycles = cyclicComponents(
    modules.map(packageOf),
    distinctEdges(internal, packageOf),
  );
  function firstFile(inside) {
    return fileOf([...modules].sort().find(inside));
  }
  return [
    ...packageCycles.map((members) =>
      cycleFinding({
        tool,
        rule: PACKAGE_CYCLE_RULE,
        kind: 'Packages',
        members,
        path: firstFile((name) => packageOf(name) === members[0]),
      }),
    ),
    ...classCycles.map((members) =>
      cycleFinding({
        tool,
        rule: CLASS_CYCLE_RULE,
        kind: 'Classes',
        members,
        path: firstFile((name) => name === members[0]),
      }),
    ),
  ];
}
