import { kotlinRecipe } from '../../../shared/kotlin-recipe.mts';
import { closingIndex, splitArguments } from '../../../shared/kotlin-scan.mts';
import type { KotlinFound, ScannedKotlin, Span } from '../../../shared/kotlin-scan.mts';
import { isIterableName, isRepositoryName } from '../declared-names.mts';
import { isDiscardedStatement } from '../statement-position.mts';

const WHOLE_OPERATIONS: Readonly<Record<string, string>> = {
  save: 'saveAll',
  delete: 'deleteAll',
  deleteById: 'deleteAllById',
};
const NAME = String.raw`(?:this\s*\.\s*)?[A-Za-z_]\w*`;
const ITERATED = String.raw`${NAME}(?:\s*\.\s*findAll\s*\(\s*\))?`;
const FOR_HEADER = new RegExp(
  String.raw`\bfor\s*\(\s*([A-Za-z_]\w*)\s+in\s+(${ITERATED})\s*\)`,
  'dgu',
);
const FOR_EACH = new RegExp(
  String.raw`(?<![\w.)\]?!])(${ITERATED})\s*\.\s*forEach\s*(?=[({])`,
  'dgu',
);
const CALL = new RegExp(
  String.raw`^(${NAME})\s*\.\s*(save|delete|deleteById)\s*\(\s*([A-Za-z_]\w*)\s*\)\s*;?$`,
  'u',
);
const REFERENCE = new RegExp(String.raw`^(${NAME})\s*::\s*(save|delete|deleteById)$`, 'u');
const LAMBDA = /^\s*(?:([A-Za-z_]\w*)\s*->)?/u;

type Site = {
  readonly start: number;
  readonly end: number;
  readonly iterated: Span;
  readonly receiver: string;
  readonly method: string;
  readonly call: number;
};

function plain(text: string): string {
  return text.replace(/^this\s*\.\s*/u, '').replaceAll(/\s+/gu, '');
}

function iterableSource(code: string, text: string): boolean {
  const findAll = /^(.+)\.findAll\(\)$/u.exec(plain(text));
  return findAll === null
    ? isIterableName(code, plain(text))
    : isRepositoryName(code, findAll[1] ?? '');
}

function accepted(scanned: ScannedKotlin, site: Site): KotlinFound | undefined {
  const { code, source } = scanned;
  const { start, end, iterated, receiver, method, call } = site;
  const operation = WHOLE_OPERATIONS[method];
  const iteratedText = source.slice(iterated.start, iterated.end);
  if (
    operation === undefined ||
    !isRepositoryName(code, plain(receiver)) ||
    !iterableSource(code, iteratedText) ||
    !isDiscardedStatement(code, start, end)
  ) {
    return undefined;
  }
  const text = `${receiver.replaceAll(/\s+/gu, '')}.${operation}(${iteratedText.replaceAll(/\s+/gu, '')})`;
  return { offset: call, edits: [{ start, end, text }] };
}

function bodyOf(code: string, from: number): { readonly text: string; readonly end: number } {
  const bodyStart = from + (/^\s*/u.exec(code.slice(from))?.[0].length ?? 0);
  if (code[bodyStart] === '{') {
    const close = closingIndex(code, bodyStart);
    return { text: code.slice(bodyStart + 1, close), end: close + 1 };
  }
  const length = code.slice(bodyStart).split('\n')[0]?.trimEnd().length ?? 0;
  return { text: code.slice(bodyStart, bodyStart + length), end: bodyStart + length };
}

function callOffset(code: string, text: string, from: number): number {
  return code.indexOf(text.trim(), from);
}

function forLoops(scanned: ScannedKotlin): readonly KotlinFound[] {
  const { code } = scanned;
  return [...code.matchAll(FOR_HEADER)].flatMap((match) => {
    const [headerText = '', variable = ''] = match;
    const [from = 0, to = 0] = match.indices?.[2] ?? [];
    const body = bodyOf(code, match.index + headerText.length);
    const call = CALL.exec(body.text.trim());
    if (call === null || call[3] !== variable) {
      return [];
    }
    const site = {
      start: match.index,
      end: body.end,
      iterated: { start: from, end: to },
      receiver: call[1] ?? '',
      method: call[2] ?? '',
      call: callOffset(code, body.text, match.index + headerText.length),
    };
    const found = accepted(scanned, site);
    return found === undefined ? [] : [found];
  });
}

function lambdaSite(
  scanned: ScannedKotlin,
  match: RegExpExecArray,
  open: number,
): KotlinFound | undefined {
  const { code } = scanned;
  const close = closingIndex(code, open);
  const inner = code.slice(open + 1, close);
  const [prefix = '', parameter = 'it'] = LAMBDA.exec(inner) ?? [];
  const body = inner.slice(prefix.length);
  const call = CALL.exec(body.trim());
  const [from = 0, to = 0] = match.indices?.[1] ?? [];
  if (call === null || call[3] !== parameter) {
    return undefined;
  }
  return accepted(scanned, {
    start: match.index,
    end: close + 1,
    iterated: { start: from, end: to },
    receiver: call[1] ?? '',
    method: call[2] ?? '',
    call: callOffset(code, body, open + 1),
  });
}

function referenceSite(
  scanned: ScannedKotlin,
  match: RegExpExecArray,
  open: number,
): KotlinFound | undefined {
  const { code } = scanned;
  const { close, parts } = splitArguments(code, open);
  const [only] = parts;
  if (only === undefined || parts.length !== 1) {
    return undefined;
  }
  const reference = REFERENCE.exec(code.slice(only.start, only.end).trim());
  const [from = 0, to = 0] = match.indices?.[1] ?? [];
  if (reference === null) {
    return undefined;
  }
  if (/^\s*\{/u.test(code.slice(close + 1))) {
    return undefined;
  }
  return accepted(scanned, {
    start: match.index,
    end: close + 1,
    iterated: { start: from, end: to },
    receiver: reference[1] ?? '',
    method: reference[2] ?? '',
    call: only.start,
  });
}

function forEachLoops(scanned: ScannedKotlin): readonly KotlinFound[] {
  const { code } = scanned;
  return [...code.matchAll(FOR_EACH)].flatMap((match) => {
    const open = match.index + match[0].length;
    const found =
      code[open] === '{' ? lambdaSite(scanned, match, open) : referenceSite(scanned, match, open);
    return found === undefined ? [] : [found];
  });
}

export const saveInLoopRecipe = kotlinRecipe({
  id: 'kotlin-spring-data-save-in-loop',
  rules: [{ tool: 'pmd', rule: 'SpringDataNoSaveInLoop' }],
  safety: 'review',
  keepComments: true,
  find(scanned): readonly KotlinFound[] {
    return [...forLoops(scanned), ...forEachLoops(scanned)];
  },
});
