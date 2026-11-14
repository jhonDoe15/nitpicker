import { escapeRegExp } from '../../../../../shared/paths/glob.mjs';
import { blankLiterals } from '../../review-rules/java-sources.mjs';

const CHECK = 'StreamResourceLeak';
const USING = /\b(?:Flux|Mono)\s*\.\s*(?:<[^()]*>\s*)?(using|usingWhen)\s*\(/gu;
const REACTOR = /\breactor\.core\.publisher\b/u;
const OPENING = new Set(['(', '[', '{']);
const CLOSING = new Set([')', ']', '}']);
const LAMBDA_PARAMETERS = /^\s*(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*->/u;
const TYPE_METHOD_REFERENCE = /(?<![\w$.])[A-Z][\w$]*(?:\s*\.\s*[A-Z][\w$]*)*\s*::\s*close\b/u;
const RETURN_KEYWORD = /^return\s/u;
const TRAILING_SEMICOLON = /;$/u;
const USING_WHEN_CLEANUPS = 3;

function argumentsOf(text, open) {
  const spans = [];
  let depth = 0;
  let start = open + 1;
  for (const [offset, character] of text.slice(open).split('').entries()) {
    const index = open + offset;
    depth += OPENING.has(character) ? 1 : 0;
    depth -= CLOSING.has(character) ? 1 : 0;
    if (depth === 0) {
      spans.push([start, index]);
      return spans;
    }
    if (character === ',' && depth === 1) {
      spans.push([start, index]);
      start = index + 1;
    }
  }
  return [];
}

function lambdaNames(argument) {
  const header = LAMBDA_PARAMETERS.exec(argument);
  const listed = header?.[1] ?? header?.[2] ?? '';
  return listed
    .split(',')
    .map((part) => part.trim().split(/\s+/u).at(-1))
    .filter((name) => /^[A-Za-z_$][\w$]*$/u.test(name ?? ''));
}

function closes(argument) {
  return (
    TYPE_METHOD_REFERENCE.test(argument) ||
    lambdaNames(argument).some((name) =>
      new RegExp(
        String.raw`(?<![\w$.])${escapeRegExp(name)}\s*(?:\.\s*close\s*\(\s*\)|::\s*close\b)`,
        'u',
      ).test(argument),
    )
  );
}

function supplierBody(argument, offset) {
  const arrow = argument.indexOf('->');
  if (arrow < 0 || LAMBDA_PARAMETERS.exec(argument)?.[0].length !== arrow + 2) {
    return undefined;
  }
  const after = arrow + 2;
  const trimmed = argument.slice(after).trim();
  const start = offset + after + argument.slice(after).indexOf(trimmed);
  if (!trimmed.startsWith('{')) {
    return { start, end: start + trimmed.length };
  }
  const inner = trimmed.slice(1, -1).trim();
  const returned = RETURN_KEYWORD.test(inner)
    ? inner.slice('return'.length).trim().replace(TRAILING_SEMICOLON, '')
    : undefined;
  if (returned === undefined || returned.includes(';')) {
    return undefined;
  }
  const from = start + trimmed.indexOf(returned);
  return { start: from, end: from + returned.length };
}

function suppliesAt(text, call, position) {
  const [supplier] = argumentsOf(text, call.open);
  if (supplier === undefined || position < supplier[0] || position >= supplier[1]) {
    return false;
  }
  if (call.kind === 'using') {
    const body = supplierBody(text.slice(...supplier), supplier[0]);
    return body !== undefined && position >= body.start && position < body.end;
  }
  return true;
}

function cleanupCloses(text, call) {
  const [, , ...cleanups] = argumentsOf(text, call.open);
  const considered =
    call.kind === 'using' ? cleanups.slice(0, 1) : cleanups.slice(0, USING_WHEN_CLEANUPS);
  return considered.some((span) => closes(text.slice(...span)));
}

export function isClosedByUsing(diagnostic, source) {
  const { message, position } = diagnostic;
  if (
    typeof message !== 'string' ||
    !message.startsWith(`[${CHECK}]`) ||
    !Number.isInteger(position) ||
    typeof source !== 'string' ||
    !REACTOR.test(source)
  ) {
    return false;
  }
  const text = blankLiterals(source);
  return [...text.matchAll(USING)]
    .map((match) => ({
      kind: match[1] === 'using' ? 'using' : 'usingWhen',
      open: match.index + match[0].length - 1,
    }))
    .some((call) => suppliesAt(text, call, position) && cleanupCloses(text, call));
}
