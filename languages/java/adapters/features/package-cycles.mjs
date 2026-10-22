import path from 'node:path';
import { stronglyConnected } from '../../../../shared/graph/strongly-connected.mjs';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { listed } from '../../../../shared/rules/features/feature-boundaries.mjs';

const COUPLING_TOOL = 'coupling';
const ROOT_PACKAGE = '(root)';

function packageName({ packageName: name }) {
  return name === '' ? ROOT_PACKAGE : name;
}

function packageEdges(edges, skipped) {
  return edges
    .filter(({ source, target }) => !skipped.has(`${source.file}\0${target.file}`))
    .map(({ source, target }) => ({ source: packageName(source), target: packageName(target) }))
    .filter(({ source, target }) => source !== target);
}

function anchors(classes) {
  const anchor = new Map();
  for (const entry of classes.toSorted((left, right) => left.file.localeCompare(right.file))) {
    if (!anchor.has(packageName(entry))) {
      anchor.set(packageName(entry), entry.file);
    }
  }
  return anchor;
}

function cycleMessage(member, members, anchorFile) {
  const others = listed(members.filter((other) => other !== member));
  const hint = exceptionHint(
    `${COUPLING_TOOL}/${RULE_IDS.packageCycle}`,
    `${path.posix.dirname(anchorFile)}/*`,
  );
  return `Keep dependencies between packages one-way: package ${member} is in a dependency cycle with ${others}. Move the shared types down into one of them, or invert one dependency behind an interface. ${hint}`;
}

export function packageCycleFindings({ classes, edges }, skippedFileEdges = new Set()) {
  const anchor = anchors(classes);
  return stronglyConnected([...anchor.keys()], packageEdges(edges, skippedFileEdges)).flatMap(
    (members) =>
      members.map((member) => ({
        tool: COUPLING_TOOL,
        rule: RULE_IDS.packageCycle,
        path: anchor.get(member),
        identity: `cycle:${member}`,
        message: cycleMessage(member, members, anchor.get(member)),
        classification: 'enforceable',
      })),
  );
}
