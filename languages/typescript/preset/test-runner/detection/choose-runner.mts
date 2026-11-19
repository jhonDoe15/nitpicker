import { DEFAULT_TEST_RUNNER, TEST_RUNNERS, runnerDisplayName } from '../runners.mts';
import type { RunnerDetection, RunnerEvidence } from '../typed/command-types.mts';

function firstPerRunner(candidates: readonly RunnerEvidence[]): RunnerEvidence[] {
  const byRunner = new Map<string, RunnerEvidence>();
  for (const candidate of candidates) {
    if (!byRunner.has(candidate.runner)) {
      byRunner.set(candidate.runner, candidate);
    }
  }
  return TEST_RUNNERS.flatMap((runner) => byRunner.get(runner) ?? []);
}

function listed(items: readonly string[], conjunction: string): string {
  return items.length === 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1) ?? ''}`;
}

export function ambiguityMessage(candidates: readonly RunnerEvidence[]): string {
  const found = candidates.map(
    ({ runner, evidence }) => `${runnerDisplayName(runner)} (${evidence})`,
  );
  const choices = candidates.map(({ runner }) => `"${runner}"`);
  return (
    `found several test runners: ${listed(found, 'and')}. ` +
    `Set "tools.tests.runner" in nitpicker.config.json to ${listed(choices, 'or')} to choose one.`
  );
}

function tieBreak(
  laterTiers: readonly (() => readonly RunnerEvidence[])[],
  candidates: readonly RunnerEvidence[],
): string {
  const ambiguous = new Set(candidates.map(({ runner }) => runner));
  for (const tier of laterTiers) {
    const favoured = firstPerRunner(tier()).filter(({ runner }) => ambiguous.has(runner));
    const [only] = favoured;
    if (favoured.length === 1 && only !== undefined) {
      return only.runner;
    }
  }
  return candidates[0]?.runner ?? DEFAULT_TEST_RUNNER;
}

export function chooseRunner(tiers: readonly (() => readonly RunnerEvidence[])[]): RunnerDetection {
  for (const [index, tier] of tiers.entries()) {
    const candidates = firstPerRunner(tier());
    const [only] = candidates;
    if (candidates.length === 1 && only !== undefined) {
      return only;
    }
    if (candidates.length > 1) {
      return { candidates, fallback: tieBreak(tiers.slice(index + 1), candidates) };
    }
  }
  return { runner: DEFAULT_TEST_RUNNER, evidence: 'the default' };
}
