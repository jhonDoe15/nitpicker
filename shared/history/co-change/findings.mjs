import {
  escapeGlob,
  exceptionEntryText,
  exceptionSentence,
} from '../../messages/exception-sentence.mjs';
import { CHANGE_HISTORY_TOOL, HISTORY_RULE_IDS } from '../../project-rules/hygiene-rules.mjs';

const PERCENT = 100;
const SHORT_SHA_LENGTH = 7;

export function moduleExceptionPaths(modules) {
  return modules.flatMap((module) => [module, `${module}/`]);
}

function lessChanged(pair) {
  return pair.secondCommits < pair.firstCommits
    ? { module: pair.second, commits: pair.secondCommits }
    : { module: pair.first, commits: pair.firstCommits };
}

function coChangeMessage({ pair, used }) {
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
    'This is correlation, not proof of coupling: if they share knowledge (a format, a constant, a schema) give it one owner, and if they only ever change as one unit, merge them.',
    route,
  ].join(' ');
}

export function coChangeFindings({ pairs, used }) {
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
