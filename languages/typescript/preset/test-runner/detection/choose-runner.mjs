import { DEFAULT_TEST_RUNNER, RUNNER_NAMES, TEST_RUNNERS } from '../runners.mjs';

function firstPerRunner(candidates) {
  const byRunner = new Map();
  for (const candidate of candidates) {
    if (!byRunner.has(candidate.runner)) {
      byRunner.set(candidate.runner, candidate);
    }
  }
  return TEST_RUNNERS.filter((runner) => byRunner.has(runner)).map((runner) =>
    byRunner.get(runner),
  );
}

function listed(items, conjunction) {
  return items.length === 1
    ? items[0]
    : `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`;
}

export function ambiguityMessage(candidates) {
  const found = candidates.map(({ runner, evidence }) => `${RUNNER_NAMES[runner]} (${evidence})`);
  const choices = candidates.map(({ runner }) => `"${runner}"`);
  return (
    `found several test runners: ${listed(found, 'and')}. ` +
    `Set "tools.tests.runner" in nitpicker.config.json to ${listed(choices, 'or')} to choose one.`
  );
}

function tieBreak(laterTiers, candidates) {
  const ambiguous = new Set(candidates.map(({ runner }) => runner));
  for (const tier of laterTiers) {
    const favoured = firstPerRunner(tier()).filter(({ runner }) => ambiguous.has(runner));
    if (favoured.length === 1) {
      return favoured[0].runner;
    }
  }
  return candidates[0].runner;
}

export function chooseRunner(tiers) {
  for (const [index, tier] of tiers.entries()) {
    const candidates = firstPerRunner(tier());
    if (candidates.length === 1) {
      return candidates[0];
    }
    if (candidates.length > 1) {
      return { candidates, fallback: tieBreak(tiers.slice(index + 1), candidates) };
    }
  }
  return { runner: DEFAULT_TEST_RUNNER, evidence: 'the default' };
}
