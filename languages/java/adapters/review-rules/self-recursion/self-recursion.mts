import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { mainSourceTexts } from '../java-sources.mts';
import { parseSource } from '../max-value-sums/source-file.mts';
import { callsOf } from './calls.mts';
import { recursionsOf } from './cycles.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';

export const SELF_RECURSION_RULE = 'SelfRecursion';
export const SELF_RECURSION_EXCEPTION_RULE = `pmd/${SELF_RECURSION_RULE}`;

function selfMessage(name: string, kotlin: boolean): string {
  const worklist = kotlin
    ? "an `ArrayDeque` that each step adds the node's children to"
    : "a `Deque` or `List` that each step adds the node's children to";
  const flat = kotlin
    ? '`map`, `flatMap` or `fold`'
    : 'a stream with `map` or `flatMap`, or a loop';
  return (
    `\`${name}\` calls itself. Retry or poll: loop over attempt numbers. Tree walk (directories, AST, ` +
    `JSON): loop over a worklist, ${worklist}. Flat data: ${flat}. An exception fits only when the recursion is bounded and deliberate.`
  );
}

function mutualMessage(name: string, other: string): string {
  return (
    `\`${name}\` and \`${other}\` call each other. Replace the cycle with a loop over a worklist, ` +
    'or merge them into one function that loops. An exception fits only when the recursion is bounded and deliberate.'
  );
}

export function readSelfRecursionFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  const finding = findingFactory();
  return mainSourceTexts(projectRoot, options).flatMap(({ file, text, kotlin }) => {
    const source = parseSource(text, { file, kotlin });
    function named(open: number): string {
      return source.tokens[open - 1]?.text ?? '';
    }
    return recursionsOf(source, callsOf(source)).map(({ call, mutual }) => {
      const name = named(call.source.open);
      const other = named(call.target.open);
      return finding({
        rule: SELF_RECURSION_RULE,
        file,
        line: call.line,
        symbol: name,
        key: `${file}:${name}:${other}`,
        message: mutual ? mutualMessage(name, other) : selfMessage(name, kotlin),
      });
    });
  });
}

export const SELF_RECURSION_ALLOWED = selfMessage('<function>', false);
