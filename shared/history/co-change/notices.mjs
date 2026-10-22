import { isExcepted } from '../../hygiene/rules.mjs';
import { CO_CHANGE_LIMITS, HISTORY_RULE_IDS } from '../../project-rules/hygiene-rules.mjs';
import { moduleExceptionPaths } from './findings.mjs';
import { readHistory } from './evidence/git-history.mjs';
import { projectEvidence } from './project-evidence.mjs';
import { coChangeSettings } from './settings.mjs';

const MAX_NOTICES = 3;
const MAX_PARTNERS = 3;
const DEEPER_CLONE =
  'Fetch the full history (for example `fetch-depth: 0` in actions/checkout) to enable it.';

function unavailableReason(history) {
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
  return `git could not list the history (${history.detail}).`;
}

function unavailableNotice(history) {
  return `Co-change evidence is unavailable, so no co-change findings were produced: ${unavailableReason(history)}`;
}

function sidesOf(pair) {
  return [
    { module: pair.first, partner: pair.second, commits: pair.firstCommits },
    { module: pair.second, partner: pair.first, commits: pair.secondCommits },
  ];
}

function partnersOf({ pairs, changed }) {
  const partners = new Map();
  for (const pair of pairs) {
    const open = sidesOf(pair).filter(
      ({ module, partner }) => changed.has(module) && !changed.has(partner),
    );
    for (const side of open) {
      const entry = { module: side.partner, support: pair.support, commits: side.commits };
      partners.set(side.module, [...(partners.get(side.module) ?? []), entry]);
    }
  }
  return partners;
}

function describePartners([module, partners]) {
  const strongest = partners
    .toSorted(
      (left, right) => right.support - left.support || left.module.localeCompare(right.module),
    )
    .slice(0, MAX_PARTNERS);
  const text = strongest
    .map(
      ({ module: partner, support, commits }) =>
        `${partner} (${String(support)} of ${String(commits)} commits)`,
    )
    .join(', ');
  return {
    support: strongest[0].support,
    text: `Files you changed in ${module} usually change together with ${text}, which this change leaves alone. Check that they need no matching edit; if they usually do, see the co-change finding for the knowledge both share.`,
  };
}

function hiddenNotice(hidden) {
  const subject =
    hidden === 1 ? '1 more changed module has' : `${String(hidden)} more changed modules have`;
  return `${subject} co-change partners this change leaves alone.`;
}

function limited(described) {
  const sorted = described.toSorted((left, right) => right.support - left.support);
  const shown = sorted.slice(0, MAX_NOTICES).map(({ text }) => text);
  const hidden = sorted.length - shown.length;
  return hidden > 0 ? [...shown, hiddenNotice(hidden)] : shown;
}

export function coChangeNotices({ projectRoot, policy = {}, changedFiles }) {
  const evidence = projectEvidence({ projectRoot, policy });
  if (!evidence.enabled) {
    return [];
  }
  if (!evidence.history.available) {
    return [unavailableNotice(evidence.history)];
  }
  const exceptions = policy.exceptions ?? [];
  const pairs = evidence.pairs.filter(
    ({ first, second }) =>
      !moduleExceptionPaths([first, second]).some((path) =>
        isExcepted(exceptions, { rule: HISTORY_RULE_IDS.coChange, path }),
      ),
  );
  const changed = new Set(
    changedFiles.map(evidence.moduleOf).filter((module) => module !== undefined),
  );
  return limited([...partnersOf({ pairs, changed })].map(describePartners));
}

export function availabilityNotices({ projectRoot, policy = {} }) {
  const settings = coChangeSettings(policy);
  if (settings === undefined) {
    return [];
  }
  const history = readHistory({ projectRoot, commits: settings.commits });
  return history.available ? [] : [unavailableNotice(history)];
}
