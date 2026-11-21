import { isExcepted } from '../../hygiene/rules.mts';
import type { ExceptionEntry } from '../../hygiene/check-types.mts';
import { CO_CHANGE_LIMITS, HISTORY_RULE_IDS } from '../../project-rules/hygiene-rules.mts';
import { moduleExceptionPaths } from './findings.mts';
import { readHistory } from './evidence/git-history.mts';
import { projectEvidence } from './project-evidence.mts';
import { coChangeSettings } from './settings.mts';
import {
  isReady,
  type EvidencePair,
  type HistoryPolicy,
  type ReadyEvidence,
  type UnavailableHistory,
} from '../typed/history-types.mts';

type Side = { module: string; partner: string; commits: number };
type Partner = { module: string; support: number; commits: number };
type OpenContext = {
  readonly pairs: readonly EvidencePair[];
  readonly changed: ReadonlySet<string>;
  readonly minConfidence: number;
};
type Described = { readonly support: number; readonly text: string };
type NoticeOptions = {
  readonly projectRoot: string;
  readonly policy?: HistoryPolicy | undefined;
  readonly changedPaths: readonly string[];
  readonly ref?: string | undefined;
};

const MAX_NOTICES = 3;
const MAX_PARTNERS = 3;
const PERCENT = 100;
const DEEPER_CLONE =
  'Fetch the full history (for example `fetch-depth: 0` in actions/checkout) to enable it.';

function unavailableReason(history: UnavailableHistory): string {
  if (history.reason === 'shallow') {
    return `the repository is a shallow clone. ${DEEPER_CLONE}`;
  }
  if (history.reason === 'too-few') {
    const available = history.count === 1 ? '1 commit is' : `${String(history.count)} commits are`;
    return `only ${available} available and at least ${String(CO_CHANGE_LIMITS.minHistory)} are needed. ${DEEPER_CLONE}`;
  }
  if (history.reason === 'not-a-repository') {
    return 'the project is not inside a git repository.';
  }
  if (history.reason === 'git-missing') {
    return 'git is not installed or is not on the PATH.';
  }
  return `git could not list the history (${history.detail}).`;
}

function unavailableNotice(history: UnavailableHistory): string {
  return `Co-change evidence is unavailable, so no co-change findings were produced: ${unavailableReason(history)}`;
}

function sidesOf(pair: EvidencePair): Side[] {
  return [
    { module: pair.first, partner: pair.second, commits: pair.firstCommits },
    { module: pair.second, partner: pair.first, commits: pair.secondCommits },
  ];
}

function leftAlone({
  side,
  support,
  changed,
  minConfidence,
}: {
  readonly side: Side;
  readonly support: number;
  readonly changed: ReadonlySet<string>;
  readonly minConfidence: number;
}): boolean {
  return (
    changed.has(side.module) &&
    !changed.has(side.partner) &&
    support / side.commits >= minConfidence
  );
}

function openSides({
  pairs,
  changed,
  minConfidence,
}: OpenContext): { module: string; partner: Partner }[] {
  return pairs.flatMap((pair) =>
    sidesOf(pair)
      .filter((side) => leftAlone({ side, support: pair.support, changed, minConfidence }))
      .map((side) => ({
        module: side.module,
        partner: { module: side.partner, support: pair.support, commits: side.commits },
      })),
  );
}

function partnersOf(context: OpenContext): Map<string, Partner[]> {
  const partners = new Map<string, Partner[]>();
  for (const { module, partner } of openSides(context)) {
    partners.set(module, [...(partners.get(module) ?? []), partner]);
  }
  return partners;
}

function partnerText({ module, support, commits }: Partner): string {
  const percent = Math.round((support / commits) * PERCENT);
  return `${module} (${String(support)} of ${String(commits)} commits, ${String(percent)}%)`;
}

function describePartners([module, partners]: [string, Partner[]]): Described {
  const strongest = partners
    .toSorted(
      (left, right) => right.support - left.support || left.module.localeCompare(right.module),
    )
    .slice(0, MAX_PARTNERS);
  return {
    support: strongest[0]?.support ?? 0,
    text: `Files you changed in ${module} usually change together with ${strongest.map(partnerText).join(', ')}, which this change leaves alone. Check that they need no matching edit; if they usually do, see the co-change finding for the knowledge both share.`,
  };
}

function hiddenNotice(hidden: number): string {
  const subject =
    hidden === 1 ? '1 more changed module has' : `${String(hidden)} more changed modules have`;
  return `${subject} co-change partners this change leaves alone.`;
}

function limited(described: readonly Described[]): string[] {
  const sorted = described.toSorted((left, right) => right.support - left.support);
  const shown = sorted.slice(0, MAX_NOTICES).map(({ text }) => text);
  const hidden = sorted.length - shown.length;
  return hidden > 0 ? [...shown, hiddenNotice(hidden)] : shown;
}

function acceptedPairs(
  evidence: ReadyEvidence,
  exceptions: readonly ExceptionEntry[],
): EvidencePair[] {
  return evidence.pairs.filter(
    ({ first, second }) =>
      !moduleExceptionPaths([first, second]).some((path) =>
        isExcepted(exceptions, { rule: HISTORY_RULE_IDS.coChange, path }),
      ),
  );
}

export function coChangeNotices({
  projectRoot,
  policy = {},
  changedPaths,
  ref,
}: NoticeOptions): string[] {
  const evidence = projectEvidence({ projectRoot, policy, ref });
  if (!evidence.enabled) {
    return [];
  }
  if (!isReady(evidence)) {
    return [unavailableNotice(evidence.history)];
  }
  const changed = new Set(
    changedPaths.map(evidence.moduleOf).filter((module) => module !== undefined),
  );
  const pairs = acceptedPairs(evidence, policy.exceptions ?? []);
  const { minConfidence } = evidence.settings;
  return limited([...partnersOf({ pairs, changed, minConfidence })].map(describePartners));
}

export function availabilityNotices({
  projectRoot,
  policy = {},
}: {
  readonly projectRoot: string;
  readonly policy?: HistoryPolicy | undefined;
}): string[] {
  const settings = coChangeSettings(policy);
  if (settings === undefined) {
    return [];
  }
  const history = readHistory({ projectRoot, commits: settings.commits });
  return history.available ? [] : [unavailableNotice(history)];
}
