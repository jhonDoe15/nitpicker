import { fieldOf, fieldsOf, numberOr, optionalText, textOf } from '../../values/readers.mts';
import { withoutExceptionRoute } from '../../messages/exception-sentence.mts';
import { capitalized } from '../../naming/name-words.mts';
import { nameFreeHash } from '../finding-parts.mts';

const COUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;

export const REMEDIES = {
  function: 'Put the new code in a new function.',
  nesting: 'Put the new nested code in a new function.',
  class: 'Put the new code in a new class.',
  file: 'Put the new code in a new file.',
  parameters: 'Group related parameters into one object instead of adding another.',
  condition: 'Move the new condition into a named function.',
  coupling: 'Use the new dependency from a new class.',
};

export type CountPattern = { pattern: RegExp; unit: string; remedy: string };
type Locate = (path: string, line: number) => unknown;

export function countPattern(
  template: string,
  unit: string,
  remedy: string = REMEDIES.function,
): CountPattern {
  return {
    pattern: new RegExp(
      template.replace('{count}', () => COUNT),
      'du',
    ),
    unit,
    remedy,
  };
}

export function countInMessage(
  rawMessage: unknown,
  pattern: RegExp,
): { value: number; subject: string } | undefined {
  const message = textOf(rawMessage);
  const match = pattern.exec(message);
  const span = match?.indices?.[1];
  if (match === null || span === undefined) {
    return undefined;
  }
  const [start, end] = span;
  return {
    value: Number((match[1] ?? '').replaceAll(',', '')),
    subject: `${message.slice(0, start)}#${message.slice(end)}`,
  };
}

function ratchetOf(finding: unknown, count: unknown, key: string): Record<string, unknown> {
  const countValue = fieldOf(count, 'value');
  const value = String(countValue);
  const message = textOf(fieldOf(finding, 'message'));
  const unit = textOf(fieldOf(count, 'unit'));
  const remedy = optionalText(fieldOf(count, 'remedy')) ?? REMEDIES.function;
  return {
    key,
    value: countValue,
    worseMessage: `${capitalized(unit)} grew from {base} to ${value}. ${remedy} ${message}`,
    heldMessage: `${withoutExceptionRoute(message)} Allowed at ${value} ${unit} because base was {base}; any increase fails.`,
  };
}

export function unitAt(finding: unknown, locate: Locate): unknown {
  const line = fieldOf(fieldOf(finding, 'location'), 'line');
  return line === undefined
    ? undefined
    : locate(textOf(fieldOf(finding, 'path')), numberOr(line, Number.NaN));
}

function unitKeys(
  subject: string,
  unit: unknown,
): { key: string; declarationKey: string | undefined; anchor: { key: string } | undefined } {
  const name = fieldOf(unit, 'name');
  const declarationHash = fieldOf(unit, 'declarationHash');
  const anchorHash = fieldOf(unit, 'anchorHash');
  const key = `count:${subject}:in:${textOf(name ?? '')}`;
  return {
    key,
    declarationKey:
      declarationHash === undefined ? undefined : `${key}:declaration:${textOf(declarationHash)}`,
    anchor:
      anchorHash === undefined
        ? undefined
        : { key: `count:${nameFreeHash(subject, name)}:text:${textOf(anchorHash)}` },
  };
}

export function withCountRatchets<F extends object>(
  findings: readonly F[],
  countOf: (finding: F) => unknown,
  unitOf: (finding: F) => unknown,
): F[];
export function withCountRatchets(
  findings: readonly unknown[],
  countOf: (finding: unknown) => unknown,
  unitOf: (finding: unknown) => unknown,
): unknown[];
export function withCountRatchets(
  findings: readonly unknown[],
  countOf: (finding: unknown) => unknown,
  unitOf: (finding: unknown) => unknown,
): unknown[] {
  return findings.map((finding) => {
    const count = fieldOf(finding, 'ratchet') === undefined ? countOf(finding) : undefined;
    if (count === undefined) {
      return finding;
    }
    const unit = unitOf(finding);
    const countedSubject = textOf(fieldOf(count, 'subject')).replaceAll(/\bline \d+\b/gu, 'line');
    const subject = `${textOf(fieldOf(count, 'unit'))}:${countedSubject}`;
    const { key, declarationKey, anchor } = unitKeys(subject, unit);
    return {
      ...fieldsOf(finding),
      identity: [
        textOf(fieldOf(finding, 'identity')),
        `in:${textOf(fieldOf(unit, 'name') ?? '')}`,
        `value:${String(fieldOf(count, 'value'))}`,
      ].join('|'),
      ratchet: {
        ...ratchetOf(finding, count, key),
        ...(declarationKey === undefined ? {} : { declarationKey }),
      },
      ...(anchor === undefined ? {} : { anchor }),
    };
  });
}
