import {
  argumentUnitOfCallName,
  conversionExample,
  unitFactor,
  unitLabel,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';
import { unitMessage } from '../../../../../../../shared/naming/time-units/unit-messages.mjs';

export const TIME_UNIT_RULE = 'TimeUnitMismatch';
const MAX_TEXT = 40;
const ELLIPSIS = '...';
const KEEP = 'Keep epoch times in a `Long` or an `Instant`.';

function shortened(text) {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - ELLIPSIS.length)}${ELLIPSIS}` : text;
}

function textOf(file, value) {
  if (value.from === undefined || value.to === undefined || value.to < value.from) {
    return value.name ?? 'value';
  }
  const { start } = file.tokens[value.from];
  const { end } = file.tokens[value.to];
  return shortened(file.code.slice(start, end).replaceAll(/\s+/gu, ' '));
}

function report(file, { offset, kind, values }) {
  const key = `${String(offset)}:${kind}`;
  if (!file.reports.has(key)) {
    file.reports.set(key, {
      rule: TIME_UNIT_RULE,
      offset,
      message: unitMessage(kind, { keep: KEEP, ...values }),
    });
  }
}

function convertedValues(from, to, value) {
  return {
    valueUnit: unitLabel(from),
    targetUnit: unitLabel(to),
    factor: String(unitFactor(from, to)),
    example: conversionExample(value, from, to),
  };
}

export function hasDurationProperty(file, name) {
  return file.imports.has(name) || file.imports.has('*');
}

export function reportMixed(file, { operator, left, right }) {
  const value = textOf(file, right);
  report(file, {
    offset: operator.start,
    kind: 'mixed',
    values: {
      left: textOf(file, left),
      leftUnit: unitLabel(left.unit),
      right: value,
      rightUnit: unitLabel(right.unit),
      factor: String(unitFactor(left.unit, right.unit)),
      example: conversionExample(value, right.unit, left.unit),
    },
  });
}

export function reportArgument(file, { nameIndex, callee, unit, value, parameter }) {
  if (unit === undefined || value?.unit === undefined || value.unit === unit) {
    return;
  }
  const text = textOf(file, value);
  report(file, {
    offset: file.tokens[value.from ?? nameIndex].start,
    kind: 'argument',
    values: { callee, parameter, value: text, ...convertedValues(value.unit, unit, text) },
  });
}

export function reportAssigned(file, { index, target, value }) {
  const unit = unitOfName(target);
  if (unit === undefined || value.unit === undefined || value.unit === unit) {
    return;
  }
  const text = textOf(file, value);
  report(file, {
    offset: file.tokens[index].start,
    kind: 'assigned',
    values: { target, value: text, ...convertedValues(value.unit, unit, text) },
  });
}

export function reportNarrowed(file, { index, value, operator }) {
  report(file, {
    offset: file.tokens[index].start,
    kind: 'narrowed',
    values: { value: textOf(file, value), operator },
  });
}

function checkPositional(file, { name, nameIndex, callee, positional }) {
  const parameters = file.functions.get(name) ?? [];
  for (const [index, arg] of positional.entries()) {
    const parameter = parameters[index];
    if (parameter !== undefined) {
      const unit = unitOfName(parameter);
      reportArgument(file, { nameIndex, callee, unit, value: arg.value, parameter });
    }
    const paired = positional[index + 1]?.value;
    if (paired?.timeUnit !== undefined) {
      const { timeUnit: unit, name } = paired;
      reportArgument(file, { nameIndex, callee, unit, value: arg.value, parameter: name });
    }
  }
}

export function checkCall(file, { name, nameIndex, args, receiver, unit }) {
  const positional = args.filter((arg) => arg.name === undefined);
  const known = unit ?? argumentUnitOfCallName(name);
  const callee = receiver?.name === undefined ? name : `${receiver.name}.${name}`;
  if (known !== undefined && positional[0] !== undefined) {
    const value = positional[0].value;
    reportArgument(file, { nameIndex, callee, unit: known, value, parameter: name });
  }
  checkPositional(file, { name, nameIndex, callee, positional });
  for (const arg of args.filter(({ name: argName }) => argName !== undefined)) {
    const parameter = arg.name;
    reportArgument(file, {
      nameIndex,
      callee,
      unit: unitOfName(parameter),
      value: arg.value,
      parameter,
    });
  }
}
