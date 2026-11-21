import { branchKey } from './arm-keys.mts';
import { branchGroups } from './arms.mts';
import { guardSimplifications } from './guards/guard-merges.mts';
import { testsType } from './guards/type-tests.mts';
import { sharedEnds } from './shared-ends.mts';
import { escapingNames } from '../../near-duplicates/canonical/effects.mts';
import { digest } from '../../near-duplicates/tree/keys.mts';
import { sizeOf } from '../../near-duplicates/tree/nodes.mts';
import { RULE_IDS } from '../../policy.mts';
import { listNames } from '../../messages/messages.mts';
import { functionUnitRule, identityCounter, reuseFinding } from '../reuse/reuse-finding.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import type { Finding } from '../../values/findings.mts';
import type { Arm, BranchGroup } from './arm-types.mts';
import type { SharedEnd } from './shared-ends.mts';

type BranchUnit = { readonly file: string; readonly name: string; readonly tree: TreeNode };

type ArmClass = [string, Arm[]];

const MIN_BLOCK_NODES = 3;
const SHORT_KEY = 12;
const CONSTRUCTS: Readonly<Record<string, string>> = { if: '`if`', when: '`when`' };

function isEnteredFromAbove(group: BranchGroup, index: number): boolean {
  const before = group.arms[index - 1];
  return before?.fallsThrough === true && sizeOf(before.body) > 1;
}

function isComparable(group: BranchGroup, arm: Arm, index: number): boolean {
  return (
    !arm.fallsThrough &&
    !isEnteredFromAbove(group, index) &&
    !testsType(arm) &&
    sizeOf(arm.body) >= (arm.body.kind === 'block' ? MIN_BLOCK_NODES : 1)
  );
}

function equalArms(group: BranchGroup): ArmClass[] {
  const classes = new Map<string, Arm[]>();
  for (const arm of group.arms.filter((arm, index) => isComparable(group, arm, index))) {
    const armKey = branchKey(arm.body);
    classes.set(armKey, [...(classes.get(armKey) ?? []), arm]);
  }
  return [...classes].filter(([, arms]) => arms.length > 1);
}

function isAdjacentChain(group: BranchGroup, arms: readonly Arm[]): boolean {
  const indexes = arms.map((arm) => group.arms.indexOf(arm));
  return (
    arms.every((arm) => arm.condition !== undefined) &&
    indexes.every((index, position) => position === 0 || indexes[position - 1] === index - 1)
  );
}

function isLeftToTool(file: string, group: BranchGroup, arms: readonly Arm[]): boolean {
  if (file.endsWith('.java')) {
    return group.kind === 'ternary' || (group.kind === 'if' && group.arms.length === 2);
  }
  if (file.endsWith('.go')) {
    return group.node.value !== 'select';
  }
  return file.endsWith('.py') && group.kind === 'if' && isAdjacentChain(group, arms);
}

function armName(arm: Arm): string {
  const line = `line ${String(arm.start)}`;
  if (arm.condition === undefined) {
    return `\`else\` (${line})`;
  }
  return `\`${arm.condition.text ?? 'its condition'}\` (${line})`;
}

function duplicateText(
  group: BranchGroup,
  arms: readonly Arm[],
): { readonly subject: string; readonly fix: string } {
  if (group.kind === 'ternary') {
    return {
      subject: `Both branches of the ternary on line ${String(group.node.start)} are the same`,
      fix: 'Use the value without the ternary, or change the branch that was meant to differ.',
    };
  }
  if (group.node.value === 'select') {
    return {
      subject: `The cases on lines ${listNames(arms.map(({ start }) => String(start)))} of the select have the same body`,
      fix: 'Move the shared body into one function and call it from each case, or change the case that was meant to differ.',
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

function sharedText(
  group: BranchGroup,
  { end, count }: SharedEnd,
): { readonly subject: string; readonly fix: string } {
  const construct = CONSTRUCTS[group.kind] ?? '';
  const statements = count === 1 ? 'statement' : `${String(count)} statements`;
  const where = end === 'start' ? 'before' : 'after';
  return {
    subject: `Every arm of the ${construct} on line ${String(group.node.start)} ${end === 'start' ? 'starts' : 'ends'} with the same ${statements}`,
    fix: `Move ${count === 1 ? 'it' : 'them'} ${where} the ${construct}.`,
  };
}

type FindingInput = {
  readonly identity: string;
  readonly line: number | undefined;
  readonly values: Readonly<Record<string, string>>;
  readonly classification: string;
};

type MakeFinding = (input: FindingInput) => Finding;

function groupFindings(
  unit: BranchUnit,
  escaping: ReturnType<typeof escapingNames>,
  finding: MakeFinding,
): Finding[] {
  return branchGroups(unit.tree).flatMap((group) => {
    const equal = equalArms(group);
    const duplicates = equal.filter(([, arms]) => !isLeftToTool(unit.file, group, arms));
    if (equal.length > 0) {
      return duplicates.map(([armKey, arms]) =>
        finding({
          identity: `${group.kind}:${digest(armKey).slice(0, SHORT_KEY)}`,
          line: arms[1]?.start,
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

function unitFindings(unit: BranchUnit, analyzerName: string): Finding[] {
  const numbered = identityCounter();
  function finding({ identity, line, values, classification }: FindingInput): Finding {
    const base = `${unit.file}#${unit.name}:${identity}`;
    const found = reuseFinding(analyzerName, {
      key: 'duplicateBranch',
      path: unit.file,
      identity: numbered(`duplicate-branch:${base}`),
      symbol: unit.name,
      line,
      values,
    });
    return { ...found, classification };
  }
  const guards = guardSimplifications(unit.tree, unit.file).map((found) =>
    finding({ ...found, classification: 'descriptive' }),
  );
  return [...groupFindings(unit, escapingNames(unit.tree), finding), ...guards];
}

export const duplicateBranchFindings = functionUnitRule(RULE_IDS.duplicateBranch, unitFindings);
