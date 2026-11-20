import { callBefore, declarations, eachFrame, ownUses, textsOf } from '../scan.mts';
import type { Declaration, ValueCheck, ValueFound } from '../scan.mts';
import type { Frame, SourceFile, Span } from '../../max-value-sums/sum-types.mts';

const RESPONSE_BODY_RULE = 'UncheckedResponseBody';

const JSON_PARSERS = new Set([
  'readValue',
  'readTree',
  'fromJson',
  'parseString',
  'parseReader',
  'decodeFromString',
  'JSONObject',
  'JSONArray',
  'JsonParser',
  'JsonPath',
]);
const SENDERS = new Set(['send', 'sendAsync']);

type ParseSite = {
  readonly index: number;
  readonly range: Span;
  readonly alias: string | undefined;
};

function responseCalls(source: SourceFile, { at, end }: Declaration): boolean {
  const texts = textsOf(source, at, end);
  const jdk = texts.includes('BodyHandlers') && texts.some((text) => SENDERS.has(text));
  const okhttp = texts.includes('newCall') && texts.includes('execute');
  return jdk || okhttp;
}

function bodyReads(source: SourceFile, range: Span, name: string): number[] {
  const { tokens } = source;
  return ownUses(source, range, name).filter(
    (index) => tokens[index + 1]?.text === '.' && tokens[index + 2]?.text === 'body',
  );
}

function isParsedAt(source: SourceFile, { index, range, alias }: ParseSite): boolean {
  if (JSON_PARSERS.has(callBefore(source, index) ?? '')) {
    return true;
  }
  if (alias === undefined) {
    return false;
  }
  return ownUses(source, { from: index, to: range.to }, alias).some((use) => {
    const { tokens } = source;
    const direct =
      ['(', ','].includes(tokens[use - 1]?.text ?? '') &&
      [')', ','].includes(tokens[use + 1]?.text ?? '');
    return direct && JSON_PARSERS.has(callBefore(source, use) ?? '');
  });
}

function aliasOf(source: SourceFile, index: number, range: Span): string | undefined {
  const own = declarations(source, range).find(({ at, end }) => at < index && index < end);
  return own?.name;
}

function reportsFor(
  source: SourceFile,
  range: Span,
  response: Declaration,
): Pick<ValueFound, 'line' | 'name'>[] {
  const { tokens } = source;
  const reads = bodyReads(source, range, response.name).filter((index) => index > response.end);
  const first = reads.find((index) =>
    isParsedAt(source, { index, range, alias: aliasOf(source, index, range) }),
  );
  if (first === undefined) {
    return [];
  }
  const checked = ownUses(source, { from: response.end, to: first }, response.name).some(
    (use) => !(tokens[use + 1]?.text === '.' && tokens[use + 2]?.text === 'body'),
  );
  return checked ? [] : [{ line: tokens[first]?.line ?? 0, name: response.name }];
}

function findIn(source: SourceFile, range: Span, frame: Frame): ValueFound[] {
  return declarations(source, range)
    .filter((response) => responseCalls(source, response))
    .flatMap((response) =>
      reportsFor(source, range, response).map((found) => ({ ...found, method: frame.name })),
    );
}

export const RESPONSE_BODY_CHECK: ValueCheck = {
  rule: RESPONSE_BODY_RULE,
  find: (source) => eachFrame(source, (range, frame) => findIn(source, range, frame)),
  message: ({ name }, kotlin) =>
    `The body of \`${name}\` is parsed as JSON before its status is checked, so an ` +
    `error page from a proxy fails as an opaque parse error and the real status is ` +
    `lost; check ` +
    `${kotlin ? '`statusCode()` or `isSuccessful`' : '`statusCode()` (or `isSuccessful()`)'} ` +
    `first and fail with it.`,
  allowed:
    'Check `statusCode()` (or `isSuccessful`) before the body is parsed, and throw with the status and body text.',
};
