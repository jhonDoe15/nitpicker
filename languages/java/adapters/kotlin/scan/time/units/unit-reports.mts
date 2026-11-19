import {
  argumentUnitOfCallName as untypedArgumentUnitOfCallName,
  conversionExample as untypedConversionExample,
  unitFactor as untypedUnitFactor,
  unitLabel as untypedUnitLabel,
  unitOfName as untypedUnitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';
import { unitMessage as untypedUnitMessage } from '../../../../../../../shared/naming/time-units/unit-messages.mjs';
import type { CallInfo, UnitArgument, UnitBase, UnitToken, UnitValue } from './unit-shapes.mts';

type Values = Record<string, string>;
type ReportRequest = { offset: number; kind: string; values: Values };

const argumentUnitOfCallName: (name: string) => string | undefined = untypedArgumentUnitOfCallName;
const conversionExample: (
  value: string,
  from: string | undefined,
  to: string | undefined,
) => string = untypedConversionExample;
const unitFactor: (left: string | undefined, right: string | undefined) => number =
  untypedUnitFactor;
const unitLabel: (unit: string | undefined) => string = untypedUnitLabel;
const unitOfName: (name: string) => string | undefined = untypedUnitOfName;
const unitMessage: (kind: string, values: Values) => string = untypedUnitMessage;

export const TIME_UNIT_RULE = 'TimeUnitMismatch';
const MAX_TEXT = 40;
const ELLIPSIS = '...';
const KEEP = 'Keep epoch times in a `Long` or an `Instant`.';

function shortened(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - ELLIPSIS.length)}${ELLIPSIS}` : text;
}

function textOf(file: UnitBase, value: UnitValue): string {
  if (value.from === undefined || value.to === undefined || value.to < value.from) {
    return value.name ?? 'value';
  }
  const start = file.tokens[value.from]?.start ?? 0;
  const end = file.tokens[value.to]?.end ?? 0;
  return shortened(file.code.slice(start, end).replaceAll(/\s+/gu, ' '));
}

function report(file: UnitBase, { offset, kind, values }: ReportRequest): void {
  const key = `${String(offset)}:${kind}`;
  if (!file.reports.has(key)) {
    file.reports.set(key, {
      rule: TIME_UNIT_RULE,
      offset,
      message: unitMessage(kind, { keep: KEEP, ...values }),
    });
  }
}

function convertedValues(from: string, to: string, value: string): Values {
  return {
    valueUnit: unitLabel(from),
    targetUnit: unitLabel(to),
    factor: String(unitFactor(from, to)),
    example: conversionExample(value, from, to),
  };
}

export function hasDurationProperty(file: UnitBase, name: string): boolean {
  return file.imports.has(name) || file.imports.has('*');
}

export function reportMixed(
  file: UnitBase,
  { operator, left, right }: { operator: UnitToken; left: UnitValue; right: UnitValue },
): void {
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

export function reportArgument(
  file: UnitBase,
  {
    nameIndex,
    callee,
    unit,
    value,
    parameter,
  }: {
    nameIndex: number;
    callee: string;
    unit: string | undefined;
    value: UnitValue;
    parameter: string;
  },
): void {
  if (unit === undefined || value.unit === undefined || value.unit === unit) {
    return;
  }
  const text = textOf(file, value);
  report(file, {
    offset: file.tokens[value.from ?? nameIndex]?.start ?? 0,
    kind: 'argument',
    values: { callee, parameter, value: text, ...convertedValues(value.unit, unit, text) },
  });
}

export function reportAssigned(
  file: UnitBase,
  { index, target, value }: { index: number; target: string; value: UnitValue },
): void {
  const unit = unitOfName(target);
  if (unit === undefined || value.unit === undefined || value.unit === unit) {
    return;
  }
  const text = textOf(file, value);
  report(file, {
    offset: file.tokens[index]?.start ?? 0,
    kind: 'assigned',
    values: { target, value: text, ...convertedValues(value.unit, unit, text) },
  });
}

export function reportNarrowed(
  file: UnitBase,
  { index, value, operator }: { index: number; value: UnitValue; operator: string },
): void {
  report(file, {
    offset: file.tokens[index]?.start ?? 0,
    kind: 'narrowed',
    values: { value: textOf(file, value), operator },
  });
}

function checkPositional(
  file: UnitBase,
  {
    name,
    nameIndex,
    callee,
    positional,
  }: { name: string; nameIndex: number; callee: string; positional: UnitArgument[] },
): void {
  const parameters = file.functions.get(name) ?? [];
  for (const [index, arg] of positional.entries()) {
    const parameter = parameters[index];
    if (parameter !== undefined) {
      const unit = unitOfName(parameter);
      reportArgument(file, { nameIndex, callee, unit, value: arg.value, parameter });
    }
    const paired = positional[index + 1]?.value;
    if (paired?.timeUnit !== undefined) {
      const { timeUnit: unit, name = '' } = paired;
      reportArgument(file, { nameIndex, callee, unit, value: arg.value, parameter: name });
    }
  }
}

export function checkCall(
  file: UnitBase,
  { name, nameIndex, args, receiver, unit }: CallInfo,
): void {
  const positional = args.filter((arg) => arg.name === undefined);
  const known = unit ?? argumentUnitOfCallName(name);
  const callee = receiver.name === undefined ? name : `${receiver.name}.${name}`;
  const [firstArgument] = positional;
  if (known !== undefined && firstArgument !== undefined) {
    const value = firstArgument.value;
    reportArgument(file, { nameIndex, callee, unit: known, value, parameter: name });
  }
  checkPositional(file, { name, nameIndex, callee, positional });
  for (const arg of args.filter(({ name: argName }) => argName !== undefined)) {
    const parameter = arg.name ?? '';
    reportArgument(file, {
      nameIndex,
      callee,
      unit: unitOfName(parameter),
      value: arg.value,
      parameter,
    });
  }
}
