import { branchCoverageFindings } from '../../../../shared/rules/branch-coverage.mjs';
import { hashIdentity } from '../../../../shared/ingest/common.mjs';
import { blockAt, blockStartingIn } from './coverage-profile.mjs';

const TOOL = 'coverage';
const LABEL_LIMIT = 60;

function shortLabel(label) {
  return label.length > LABEL_LIMIT ? `${label.slice(0, LABEL_LIMIT)}…` : label;
}

function matchedCount(arms) {
  return arms.reduce((sum, { count, fellThrough }) => sum + count - fellThrough, 0);
}

export function branchOutcomes(branch, blocks, counted) {
  const arms = branch.arms.map((arm) => ({
    label: `${shortLabel(arm.label)} (line ${String(arm.from.line)})`,
    count: blockStartingIn(blocks, arm.from, arm.to)?.count,
    fellThrough: arm.fallthrough === undefined ? 0 : (blockAt(blocks, arm.fallthrough)?.count ?? 0),
  }));
  const evaluations = blockAt(blocks, branch.at)?.count;
  const known = arms.filter(({ count }) => count !== undefined);
  const implicit =
    branch.implicit === undefined ||
    !counted ||
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

function sourceLine(lines, line) {
  return (lines[line - 1] ?? '').trim().replaceAll(/\s+/gu, ' ');
}

export function goBranchFindings({ branches, profile, sourceLines }) {
  const measured = branches.flatMap((branch) => {
    const blocks = profile.files.get(branch.file);
    const outcomes = blocks === undefined ? [] : branchOutcomes(branch, blocks, profile.counted);
    const source = sourceLine(sourceLines(branch.file), branch.at.line);
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
    identify: (key, occurrence) => (occurrence === 1 ? key : `${key}#${String(occurrence)}`),
  });
}
