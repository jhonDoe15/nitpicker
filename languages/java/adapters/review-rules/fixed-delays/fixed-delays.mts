import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { mainSourceTexts } from '../java-sources.mts';
import { parseSource } from '../max-value-sums/source-file.mts';
import { delayCalls } from './delay-calls.mts';
import { delayConstants } from './delay-constants.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';
import type { Frame, SourceFile, Span } from '../max-value-sums/sum-types.mts';

export const FIXED_DELAY_RULE = 'UninjectableDelay';
export const FIXED_DELAY_EXCEPTION_RULE = `pmd/${FIXED_DELAY_RULE}`;

const MIN_FIXED_DELAY_MS = 500;
const OPTION_PARAMETER_NAME =
  /option|opts|config|setting|delay|timeout|interval|wait|duration|ms$|param|override|dependenc|deps|context|ctx|env|clock|sleeper|scheduler|executor/iu;
const HIDDEN_FROM_CALLERS = new Set(['private', 'protected', 'internal']);
const DECLARATION_BREAKS = new Set([';', '{', '}']);

function outermostFrame(source: SourceFile, index: number): Frame | undefined {
  return source.frames
    .filter(({ body }) => index >= body.from && index < body.to)
    .reduce<Frame | undefined>(
      (best, each) => (best === undefined || each.open < best.open ? each : best),
      undefined,
    );
}

function modifiersOf(source: SourceFile, frame: Frame): string[] {
  const line = source.tokens[frame.open - 1]?.line ?? 0;
  const before = source.tokens.slice(0, frame.open - 1).reverse();
  const stop = before.findIndex(
    ({ text, line: at }) => DECLARATION_BREAKS.has(text) || at < line,
  );
  return before.slice(0, stop === -1 ? undefined : stop).map(({ text }) => text);
}

const CLASS_WORDS = new Set(['class', 'object', 'interface', 'enum', 'record']);

function wordsBefore(source: SourceFile, index: number): string[] {
  const line = source.tokens[index]?.line ?? 0;
  const before = source.tokens.slice(0, index).reverse();
  const stop = before.findIndex(({ text, line: at }) => DECLARATION_BREAKS.has(text) || at < line);
  return before.slice(0, stop === -1 ? undefined : stop).map(({ text }) => text);
}

function enclosingClassWords(source: SourceFile, at: number): string[][] {
  return source.tokens.flatMap(({ text }, index) => {
    if (!CLASS_WORDS.has(text) || source.tokens[index - 1]?.text === '.') {
      return [];
    }
    const body = source.tokens.findIndex((token, next) => next > index && token.text === '{');
    const close = source.partner[body] ?? -1;
    return close > at && body < at ? [wordsBefore(source, index)] : [];
  });
}

function isOpenToCallers(source: SourceFile, frame: Frame): boolean {
  const words = modifiersOf(source, frame);
  const hidden = enclosingClassWords(source, frame.open).some((each) =>
    each.some((word) => HIDDEN_FROM_CALLERS.has(word)),
  );
  const open = source.kotlin
    ? !words.some((word) => HIDDEN_FROM_CALLERS.has(word))
    : words.includes('public');
  return open && !hidden && frame.name !== 'main';
}

function mentions(source: SourceFile, span: Span, name: string): boolean {
  return source.tokens.slice(span.from, span.to).some(({ text }) => text === name);
}

function canCarryDelay(source: SourceFile, frame: Frame, constant: string): boolean {
  return frame.params.some(
    ({ name, defaultValue }) =>
      (defaultValue !== undefined && mentions(source, defaultValue, constant)) ||
      OPTION_PARAMETER_NAME.test(name),
  );
}

function declaresLocal(source: SourceFile, at: number): boolean {
  const before = source.tokens[at - 1];
  return (
    ['val', 'var'].includes(before?.text ?? '') ||
    (before?.kind === 'identifier' && source.tokens[at + 1]?.text === '=')
  );
}

function isShadowed(
  source: SourceFile,
  frame: Frame,
  call: { index: number; name: string },
): boolean {
  return source.tokens
    .slice(frame.body.from, call.index)
    .some(({ text }, offset) => text === call.name && declaresLocal(source, frame.body.from + offset));
}

export function fixedDelayMessage(parts: {
  timer: string;
  name: string;
  millis: string;
  owner: string;
  kotlin: boolean;
}): string {
  const { timer, name, millis, owner, kotlin } = parts;
  const form = kotlin
    ? `a parameter with the constant as its default, for example "delayMs: Long = ${name}"`
    : `a constructor or method parameter (or a field the constructor sets) that defaults to ${name}`;
  return (
    `${timer} waits ${name} (${millis} ms), a constant that public "${owner}" cannot override, ` +
    `so a test must wait it out or fake the clock. Accept the delay as ${form}. ` +
    'An exception fits only when the delay is deliberately fixed.'
  );
}

export function readFixedDelayFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  const finding = findingFactory();
  return mainSourceTexts(projectRoot, options).flatMap(({ file, text, kotlin }) => {
    const source = parseSource(text, { file, kotlin });
    return delayCalls(source, delayConstants(source)).flatMap((call) => {
      const frame = outermostFrame(source, call.index);
      if (
        frame === undefined ||
        call.millis < MIN_FIXED_DELAY_MS ||
        !isOpenToCallers(source, frame) ||
        canCarryDelay(source, frame, call.name) ||
        isShadowed(source, frame, call)
      ) {
        return [];
      }
      return [
        finding({
          rule: FIXED_DELAY_RULE,
          file,
          line: source.tokens[call.index]?.line ?? 0,
          symbol: call.name,
          key: `${file}:${frame.name}:${call.name}`,
          message: fixedDelayMessage({
            timer: call.timer,
            name: call.name,
            millis: String(call.millis),
            owner: frame.name,
            kotlin,
          }),
        }),
      ];
    });
  });
}

export const FIXED_DELAY_ALLOWED = fixedDelayMessage({
  timer: '<timer>',
  name: '<NAME>',
  millis: '<ms>',
  owner: '<function>',
  kotlin: false,
});
