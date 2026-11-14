import { branchKey } from './arm-keys.mjs';
import { branchGroups } from './arms.mjs';
import { sharedEnds } from './shared-ends.mjs';
import { escapingNames } from '../../near-duplicates/canonical/effects.mjs';
import { digest } from '../../near-duplicates/tree/keys.mjs';
import { nodesOf, sizeOf } from '../../near-duplicates/tree/nodes.mjs';
import { RULE_IDS } from '../../policy.mjs';
import { listNames } from '../../messages/messages.mjs';
import { functionUnitRule, reuseFinding } from '../reuse/reuse-finding.mjs';

const MIN_BLOCK_NODES = 3;
const SHORT_KEY = 12;
const CONSTRUCTS = { if: '`if`', when: '`when`' };
const PATTERN = /^\w*pattern\w*:/u;

function testsType(arm) {
  const tests = [
    ...(arm.conditions ?? []),
    ...(arm.condition === undefined ? [] : [arm.condition]),
  ];
  return tests
    .flatMap((test) => nodesOf(test))
    .some(({ kind, value }) => kind === 'type' || PATTERN.test(String(value)));
}

function isEnteredFromAbove(group, index) {
  const before = group.arms[index - 1];
  return before?.fallsThrough === true && sizeOf(before.body) > 1;
}

function isComparable(group, arm, index) {
  return (
    !arm.fallsThrough &&
    !isEnteredFromAbove(group, index) &&
    !testsType(arm) &&
    sizeOf(arm.body) >= (arm.body.kind === 'block' ? MIN_BLOCK_NODES : 1)
  );
}

function equalArms(group) {
  const classes = new Map();
  for (const arm of group.arms.filter((arm, index) => isComparable(group, arm, index))) {
    const armKey = branchKey(arm.body);
    classes.set(armKey, [...(classes.get(armKey) ?? []), arm]);
  }
  return [...classes].filter(([, arms]) => arms.length > 1);
}

function isAdjacentChain(group, arms) {
  const indexes = arms.map((arm) => group.arms.indexOf(arm));
  return (
    arms.every((arm) => arm.condition !== undefined) &&
    indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1)
  );
}

function isLeftToTool(file, group, arms) {
  if (file.endsWith('.java')) {
    return group.kind === 'ternary' || (group.kind === 'if' && group.arms.length === 2);
  }
  return file.endsWith('.py') && group.kind === 'if' && isAdjacentChain(group, arms);
}

function armName(arm) {
  const line = `line ${String(arm.start)}`;
  if (arm.condition === undefined) {
    return `\`else\` (${line})`;
  }
  return `\`${arm.condition.text ?? 'its condition'}\` (${line})`;
}

function duplicateText(group, arms) {
  if (group.kind === 'ternary') {
    return {
      subject: `Both branches of the ternary on line ${String(group.node.start)} are the same`,
      fix: 'Use the value without the ternary, or change the branch that was meant to differ.',
    };
  }
  if (group.kind === 'switch') {
    return {
      subject: `The cases on lines ${listNames(arms.map(({ start }) => String(start)))} have the same body`,
      fix: 'Merge their labels into one case, or change the case that was meant to differ.',
    };
  }
  return {
    subject: `The arms for ${listNames(arms.map(armName))} have the same body`,
    fix: 'Merge them into one arm, or change the arm that was meant to differ.',
  };
}

function sharedText(group, { end, count }) {
  const construct = CONSTRUCTS[group.kind];
  const statements = count === 1 ? 'statement' : `${String(count)} statements`;
  const where = end === 'start' ? 'before' : 'after';
  return {
    subject: `Every arm of the ${construct} on line ${String(group.node.start)} ${end === 'start' ? 'starts' : 'ends'} with the same ${statements}`,
    fix: `Move ${count === 1 ? 'it' : 'them'} ${where} the ${construct}.`,
  };
}

function unitFindings(unit, analyzerName) {
  const escaping = escapingNames(unit.tree);
  const seen = new Map();
  function finding({ identity, line, values, classification }) {
    const base = `${unit.file}#${unit.name}:${identity}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const found = reuseFinding(analyzerName, {
      key: 'duplicateBranch',
      path: unit.file,
      identity: `duplicate-branch:${base}#${String(count)}`,
      symbol: unit.name,
      line,
      values,
    });
    return { ...found, classification };
  }
  return branchGroups(unit.tree).flatMap((group) => {
    const equal = equalArms(group);
    const duplicates = equal.filter(([, arms]) => !isLeftToTool(unit.file, group, arms));
    if (equal.length > 0) {
      return duplicates.map(([armKey, arms]) =>
        finding({
          identity: `${group.kind}:${digest(armKey).slice(0, SHORT_KEY)}`,
          line: arms[1].start,
          values: duplicateText(group, arms),
          classification: 'enforceable',
        }),
      );
    }
    return sharedEnds(group, escaping).map((shared) =>
      finding({
        identity: `${group.kind}:${shared.end}:${String(shared.count)}`,
        line: group.node.start,
        values: sharedText(group, shared),
        classification: 'descriptive',
      }),
    );
  });
}

export const duplicateBranchFindings = functionUnitRule(RULE_IDS.duplicateBranch, unitFindings);
