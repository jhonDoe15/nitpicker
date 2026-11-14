import { stronglyConnected } from './strongly-connected.mjs';

function staysCyclic(members, packaged, cycleEdges) {
  const inside = new Set(members);
  const removed = new Set(cycleEdges.map(({ from, to }) => `${from}\0${to}`));
  const rest = packaged.filter(
    ({ source, target, files }) => inside.has(source) && inside.has(target) && !removed.has(files),
  );
  return stronglyConnected(members, rest).length > 0;
}

export function isExplainedCycle(members, { packaged, anchor, features }) {
  const directories = members.map((member) => features.featureOf(anchor.get(member)));
  if (directories.includes(undefined) || new Set(directories).size < 2) {
    return false;
  }
  return features.explainedCycles.some(
    (cycle) =>
      directories.every((directory) => cycle.features.includes(directory)) &&
      !staysCyclic(members, packaged, cycle.edges),
  );
}
