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
    ? { module: pair.second, other: pair.first, commits: pair.secondCommits }
    : { module: pair.first, other: pair.second, commits: pair.firstCommits };
}

function coChangeMessage({ pair, used }) {
  const { module, other, commits } = lessChanged(pair);
  const percent = Math.round(pair.confidence * PERCENT);
  const route = exceptionSentence(
    exceptionEntryText({
      rule: HISTORY_RULE_IDS.coChange,
      glob: `${escapeGlob(pair.first)}/**`,
    }),
  );
  return [
    `${pair.first} and ${pair.second} changed together in ${String(pair.support)} commits:`,
    `${String(percent)}% of the ${String(commits)} commits that changed ${module}`,
    `(${String(used)} commits sampled; for example ${pair.examples.map((sha) => sha.slice(0, SHORT_SHA_LENGTH)).join(', ')}).`,
    'Nitpicker does not read imports for this check, so it does not know whether either imports the other.',
    'Co-change is correlation: feature work, migrations and coordinated releases change modules together on purpose.',
    `If ${module} reaches into the internals of ${other}, put what it needs behind one smaller interface that ${other} owns.`,
    `If neither imports the other, they share knowledge (a format, a constant, a schema) that needs one owner.`,
    `If they only ever change as one unit, merge them into one module.`,
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
