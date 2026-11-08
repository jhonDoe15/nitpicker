import { renderMessage } from '../../messages/messages.mjs';

const CONVERT_ONCE = 'once where it enters (`{example}`)';

export const UNIT_MESSAGES = {
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

export function unitMessageTemplate(kind) {
  const { describe, allowed } = UNIT_MESSAGES[kind];
  return `${describe}. ${allowed}`;
}

export function unitMessage(kind, values) {
  return renderMessage(unitMessageTemplate(kind), values);
}

export function unitDescription(kind, values) {
  return renderMessage(UNIT_MESSAGES[kind].describe, values);
}

export function unitAllowedForm(kind, values) {
  return renderMessage(UNIT_MESSAGES[kind].allowed, values);
}

export function eslintUnitMessage(kind, values = {}) {
  return unitMessageTemplate(kind).replaceAll(/\{(\w+)\}/gu, (_whole, key) =>
    Object.hasOwn(values, key) ? values[key] : `{{ ${key} }}`,
  );
}
