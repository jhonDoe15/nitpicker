import { renderMessage } from '../../messages/messages.mts';

const CONVERT_ONCE = 'once where it enters (`{example}`)';

type Values = Readonly<Record<string, string | number | undefined>>;

const UNIT_MESSAGES: Readonly<Record<string, { describe: string; allowed: string }>> = {
  mixed: {
    describe:
      '`{left}` is in {leftUnit} and `{right}` is in {rightUnit}, so the result is off by {factor}x',
    allowed: `Bring both sides to one unit first: convert the value ${CONVERT_ONCE}, and name the result with its unit.`,
  },
  assigned: {
    describe:
      '`{target}` is named in {targetUnit} but gets `{value}`, which is in {valueUnit} (off by {factor}x)',
    allowed: `Convert the value ${CONVERT_ONCE}; or, if the name is wrong, rename it to its real unit.`,
  },
  argument: {
    describe:
      '`{callee}` takes {targetUnit} for `{parameter}`, but `{value}` is in {valueUnit} (off by {factor}x)',
    allowed: `Convert the argument ${CONVERT_ONCE}.`,
  },
  narrowed: {
    describe:
      '`{value}` is an epoch time, and `{operator}` cuts it to a 32-bit integer, which overflows (epoch milliseconds already, epoch seconds in 2038)',
    allowed: '{keep}',
  },
};

function messageParts(kind: string): { describe: string; allowed: string } {
  const parts = Object.hasOwn(UNIT_MESSAGES, kind) ? UNIT_MESSAGES[kind] : undefined;
  if (parts === undefined) {
    throw new TypeError(`Unknown unit message kind: ${kind}`);
  }
  return parts;
}

function unitMessageTemplate(kind: string): string {
  const { describe, allowed } = messageParts(kind);
  return `${describe}. ${allowed}`;
}

export function unitMessage(kind: string, values: Values): string {
  return renderMessage(unitMessageTemplate(kind), values);
}

export function unitDescription(kind: string, values: Values): string {
  return renderMessage(messageParts(kind).describe, values);
}

export function unitAllowedForm(kind: string, values: Values): string {
  return renderMessage(messageParts(kind).allowed, values);
}

export function eslintUnitMessage(kind: string, values: Values = {}): string {
  return unitMessageTemplate(kind).replaceAll(/\{(\w+)\}/gu, (_whole: string, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : `{{ ${key} }}`,
  );
}
