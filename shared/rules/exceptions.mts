import { globsMatcher } from '../paths/glob.mts';
import { canonicalRule } from '../exceptions/rule-names.mts';
import { exceptionEntryText } from '../messages/exception-sentence.mts';
import { fieldOf, textOf, textsOf } from '../values/readers.mts';
import { EXCEPTION_HINT, renderMessage } from '../policy.mts';

export function exceptionMatcher(
  exceptions: readonly unknown[] | undefined,
): (rule: string, ...candidates: readonly unknown[]) => boolean {
  const matchers = (exceptions ?? []).map((entry) => ({
    rule: canonicalRule(textOf(fieldOf(entry, 'rule'))),
    matches: globsMatcher(globsOf(entry)),
  }));
  return (rule: string, ...candidates: readonly unknown[]) =>
    matchers.some(
      (matcher) =>
        matcher.rule === rule &&
        candidates.some((candidate) => typeof candidate === 'string' && matcher.matches(candidate)),
    );
}

function globsOf(entry: unknown): string[] {
  const paths = fieldOf(entry, 'paths');
  return Array.isArray(paths) ? textsOf(paths) : [textOf(fieldOf(entry, 'glob'))];
}

export function exceptionText(rule: string, path: string): string {
  return exceptionEntryText({ rule, path });
}

export function exceptionHint(rule: string, path: string): string {
  return renderMessage(EXCEPTION_HINT, { exception: exceptionText(rule, path) });
}
