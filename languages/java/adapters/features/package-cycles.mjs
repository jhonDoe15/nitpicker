import path from 'node:path';
import { isExplainedCycle } from '../../../../shared/graph/explained-cycles.mjs';
import { stronglyConnected } from '../../../../shared/graph/strongly-connected.mjs';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { listed } from '../../../../shared/rules/features/feature-boundaries.mjs';

const COUPLING_TOOL = 'coupling';
const ROOT_PACKAGE = '(root)';
const NO_FEATURES = { explainedCycles: [], featureOf: () => undefined };

function packageName({ packageName: name }) {
  return name === '' ? ROOT_PACKAGE : name;
}

function packageEdges(edges) {
  return edges
    .map(({ source, target }) => ({
      source: packageName(source),
      target: packageName(target),
      files: `${source.file}\0${target.file}`,
    }))
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

export function packageCycleFindings({ classes, edges }, features = NO_FEATURES) {
  const anchor = anchors(classes);
  const packaged = packageEdges(edges);
  return stronglyConnected([...anchor.keys()], packaged)
    .filter((members) => !isExplainedCycle(members, { packaged, anchor, features }))
    .flatMap((members) =>
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
