import { kotlinRecipe } from '../../shared/kotlin-recipe.mts';
import { closingIndex, enclosingOpen, splitArguments } from '../../shared/kotlin-scan.mts';
import type { KotlinFound, ScannedKotlin, Span } from '../../shared/kotlin-scan.mts';
import { statementPrefix } from '../../shared/spans.mts';
import { isLongExpression } from './delay-argument.mts';
import { delayImport } from './delay-import.mts';

const SUSPEND_FUN =
  /\bsuspend\s+(?:(?:inline|operator|infix|tailrec|external|actual|expect)\s+)*fun\b/gu;
const SIGNATURE =
  /^\s*(?:<[^>{}()]*>\s*)?(?:[A-Za-z_][\w.]*(?:<[^{}()]*>)?\s*\.\s*)?[A-Za-z_]\w*\s*\(/u;
const BODY = /^\s*(?::[^{}=\n]*(?:\n\s*)?)?\{/u;
const SLEEP = /(?<![\w.])((?:java\s*\.\s*lang\s*\.\s*)?Thread\s*\.\s*)sleep\s*\(/gu;
const SLEEP_NAME = 'sleep';
const CONTROL_HEADER = /^\s*(?:else\s+if|else|if|for|while|do)\b/u;

type Sleep = { readonly start: number; readonly end: number };

function bodyOf(code: string, after: number): Span | undefined {
  const signature = SIGNATURE.exec(code.slice(after));
  if (signature === null) {
    return undefined;
  }
  const open = after + signature[0].length - 1;
  const close = closingIndex(code, open);
  const body = BODY.exec(code.slice(close + 1));
  if (body === null) {
    return undefined;
  }
  const start = close + body[0].length;
  return { start, end: closingIndex(code, start) };
}

function directlyInBody(code: string, body: Span, offset: number): boolean {
  const opens: number[] = [];
  const pending = [enclosingOpen(code, offset)];
  for (const open of pending) {
    if (open <= body.start) {
      break;
    }
    opens.push(open);
    pending.push(enclosingOpen(code, open));
  }
  return opens.every((open) => CONTROL_HEADER.test(statementPrefix(code, open)));
}

function sleepsIn(scanned: ScannedKotlin, body: Span): readonly Sleep[] {
  const { code } = scanned;
  return [...code.slice(body.start, body.end).matchAll(SLEEP)].flatMap((match) => {
    const start = body.start + match.index;
    const open = start + match[0].length - 1;
    const { parts } = splitArguments(code, open);
    const [argument] = parts;
    const end = start + (match[1]?.length ?? 0) + SLEEP_NAME.length;
    const accepted =
      parts.length === 1 &&
      !scanned.comments.some((comment) => comment.start < end && start < comment.end) &&
      argument !== undefined &&
      isLongExpression(code, code.slice(argument.start, argument.end)) &&
      directlyInBody(code, body, start);
    return accepted ? [{ start, end }] : [];
  });
}

function eligibleSleeps(scanned: ScannedKotlin): readonly Sleep[] {
  const { code } = scanned;
  const found = [...code.matchAll(SUSPEND_FUN)].flatMap((match) => {
    const body = bodyOf(code, match.index + match[0].length);
    return body === undefined ? [] : sleepsIn(scanned, body);
  });
  return [...new Map(found.map((sleep) => [sleep.start, sleep])).values()].toSorted(
    (left, right) => left.start - right.start,
  );
}

export const sleepInsteadOfDelayRecipe = kotlinRecipe({
  id: 'kotlin-sleep-instead-of-delay',
  rules: [{ tool: 'detekt', rule: 'detekt.coroutines.SleepInsteadOfDelay' }],
  safety: 'review',
  keepComments: true,
  find(scanned): readonly KotlinFound[] {
    const sleeps = eligibleSleeps(scanned);
    const added = delayImport(scanned);
    const [first] = sleeps;
    if (first === undefined || !added.usable) {
      return [];
    }
    const replacements = sleeps.map(({ start, end }) => ({ start, end, text: 'delay' }));
    return [
      {
        offset: first.end - SLEEP_NAME.length,
        alsoOffsets: sleeps.slice(1).map(({ end }) => end - SLEEP_NAME.length),
        edits: [...replacements, ...added.edits],
      },
    ];
  },
});
