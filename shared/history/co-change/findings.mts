import {
  escapeGlob,
  exceptionEntryText,
  exceptionSentence,
} from '../../messages/exception-sentence.mts';
import { CHANGE_HISTORY_TOOL, HISTORY_RULE_IDS } from '../../project-rules/hygiene-rules.mts';
import type { PathFinding } from '../../hygiene/check-types.mts';
import type { EvidencePair } from '../typed/history-types.mts';

export const CO_CHANGE_ADVICE =
  'This is correlation, not proof of coupling: if they share knowledge (a format, a constant, a schema) give it one owner, and if they only ever change as one unit, merge them.';

const PERCENT = 100;
const SHORT_SHA_LENGTH = 7;

export function moduleExceptionPaths(modules: readonly string[]): string[] {
  return modules.flatMap((module) => [module, `${module}/`]);
}

function lessChanged(pair: EvidencePair): { module: string; commits: number } {
  return pair.secondCommits < pair.firstCommits
    ? { module: pair.second, commits: pair.secondCommits }
    : { module: pair.first, commits: pair.firstCommits };
}

function coChangeMessage({ pair, used }: { pair: EvidencePair; used: number }): string {
  const { module, commits } = lessChanged(pair);
  const percent = Math.round(pair.confidence * PERCENT);
  const route = exceptionSentence(
    exceptionEntryText({
      rule: HISTORY_RULE_IDS.coChange,
      glob: `${escapeGlob(pair.first)}/**`,
    }),
  );
  const examples = pair.examples.map((sha) => sha.slice(0, SHORT_SHA_LENGTH)).join(', ');
  return [
    `${pair.first} and ${pair.second} changed together in ${String(pair.support)} of ${String(used)} sampled commits`,
    `(${String(percent)}% of the ${String(commits)} that changed ${module}; for example ${examples}).`,
    CO_CHANGE_ADVICE,
    route,
  ].join(' ');
}

export function coChangeFindings({
  pairs,
  used,
}: {
  readonly pairs: readonly EvidencePair[];
  readonly used: number;
}): PathFinding[] {
  return pairs.map((pair) => ({
    tool: CHANGE_HISTORY_TOOL,
    rule: HISTORY_RULE_IDS.coChange,
    path: pair.first,
    identity: `${pair.first}|${pair.second}`,
    message: coChangeMessage({ pair, used }),
    classification: 'descriptive',
    exceptionPaths: moduleExceptionPaths([pair.first, pair.second]),
  }));
}
