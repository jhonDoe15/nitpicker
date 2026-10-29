import path from 'node:path';
import { isExplainedCycle } from '../../graph/explained-cycles.mjs';
import { stronglyConnected } from '../../graph/strongly-connected.mjs';
import { RULE_IDS } from '../../policy.mjs';
import { exceptionHint } from '../exceptions.mjs';
import { listed } from './feature-boundaries.mjs';

const COUPLING_TOOL = 'coupling';
const NO_FEATURES = { explainedCycles: [], featureOf: () => undefined };

function cycleMessage(member, members, anchorFile) {
  const others = listed(members.filter((other) => other !== member));
  const hint = exceptionHint(
    `${COUPLING_TOOL}/${RULE_IDS.packageCycle}`,
    `${path.posix.dirname(anchorFile)}/*`,
  );
  return `Keep dependencies between packages one-way: package ${member} is in a dependency cycle with ${others}. Move the shared types down into one of them, or invert one dependency behind an interface. ${hint}`;
}

export function packageCycleFindings({ anchor, packaged }, features = NO_FEATURES) {
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
