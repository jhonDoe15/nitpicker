import { blockAt, blockStartingIn } from '../typed/go-readers.mts';
import {
  branchCoverageFindings,
  formatAgnosticText,
  hashIdentity,
} from '../typed/shared-readers.mts';
import type {
  Arm,
  Branch,
  CoverBlock,
  CoverProfile,
  FindingRow,
  Outcome,
  Position,
} from '../go-types.mts';

const TOOL = 'coverage';
const LABEL_LIMIT = 60;

function shortLabel(label: string) {
  return label.length > LABEL_LIMIT ? `${label.slice(0, LABEL_LIMIT)}…` : label;
}

type KnownArm = { label: string; count: number; fellThrough: number };

function matchedCount(arms: readonly KnownArm[]) {
  return arms.reduce((sum, { count, fellThrough }) => sum + count - fellThrough, 0);
}

export function branchOutcomes(
  branch: Branch,
  blocks: readonly CoverBlock[],
  profile: Pick<CoverProfile, 'counted'>,
): Outcome[] {
  const arms = branch.arms.map((arm: Arm) => ({
    label: `${shortLabel(arm.label)} (line ${String(arm.from.line)})`,
    count: blockStartingIn(blocks, arm.from, arm.to)?.count,
    fellThrough: arm.fallthrough === undefined ? 0 : (blockAt(blocks, arm.fallthrough)?.count ?? 0),
  }));
  const evaluations = blockAt(blocks, branch.at)?.count;
  const known = arms.filter((arm): arm is KnownArm => arm.count !== undefined);
  const implicit =
    branch.implicit === undefined ||
    !profile.counted ||
    evaluations === undefined ||
    known.length < arms.length
      ? []
      : [
          {
            label: branch.implicit,
            count: Math.max(0, evaluations - matchedCount(known)),
          },
        ];
  return [...known.map(({ label, count }) => ({ label, count })), ...implicit];
}

function sourceLine(lines: readonly string[], { file, at }: { file: string; at: Position }) {
  return formatAgnosticText(lines[at.line - 1] ?? '', file);
}

export function goBranchFindings({
  branches,
  profile,
  sourceLines,
}: {
  branches: readonly Branch[];
  profile: CoverProfile;
  sourceLines: (file: string) => readonly string[];
}): FindingRow[] {
  const measured = branches.flatMap((branch) => {
    const blocks = profile.files.get(branch.file);
    const outcomes = blocks === undefined ? [] : branchOutcomes(branch, blocks, profile);
    const source = sourceLine(sourceLines(branch.file), branch);
    if (outcomes.length === 0 || source === '') {
      return [];
    }
    const taken = outcomes.filter(({ count }) => count > 0).length;
    return [
      {
        path: branch.file,
        line: branch.at.line,
        key: hashIdentity('branch-source', [branch.function, source]),
        anchor: hashIdentity('branch-source', [source]),
        percent: (taken / outcomes.length) * 100,
        arms: outcomes.filter(({ count }) => count === 0).map(({ label }) => label),
        symbol: branch.function,
      },
    ];
  });
  return branchCoverageFindings(measured, {
    tool: TOOL,
    identify: (key: string, occurrence: number) =>
      occurrence === 1 ? key : `${key}#${String(occurrence)}`,
  });
}
