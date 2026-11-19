import {
  isEpochName as untypedIsEpochName,
  unitOfCallName as untypedUnitOfCallName,
  unitOfConstant as untypedUnitOfConstant,
  unitOfName as untypedUnitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';
import { checkCall, hasDurationProperty, reportArgument, reportNarrowed } from './unit-reports.mts';
import type { Parser, Selector, UnitBase, UnitValue } from './unit-shapes.mts';

const isEpochName: (name: string) => boolean = untypedIsEpochName;
const unitOfCallName: (name: string) => string | undefined = untypedUnitOfCallName;
const unitOfConstant: (name: string) => string | undefined = untypedUnitOfConstant;
const unitOfName: (name: string) => string | undefined = untypedUnitOfName;

const UNIT_TYPES = new Set(['TimeUnit', 'ChronoUnit', 'DurationUnit']);
const DURATION_PROPERTIES: Readonly<Record<string, string>> = {
  nanoseconds: 'ns',
  microseconds: 'us',
  milliseconds: 'ms',
  seconds: 's',
  minutes: 'min',
};
const PASSING = new Set([
  'toLong',
  'toDouble',
  'toFloat',
  'absoluteValue',
  'coerceAtLeast',
  'coerceAtMost',
]);
const CALL_UNITS: Readonly<Record<string, string>> = { nanoTime: 'ns', measureNanoTime: 'ns' };
const EPOCH_CALLS = new Set(['currentTimeMillis']);
const RECEIVER_CALLS: Readonly<Record<string, string>> = { 'Thread.sleep': 'ms' };
const EPOCH_SELECTORS = new Set(['Date.time', 'Date.getTime']);

export function namedValue(name: string, unit: string | undefined, call = false): UnitValue {
  return unit === undefined
    ? { name }
    : { name, unit, epoch: isEpochName(name) || (call && EPOCH_CALLS.has(name)) || undefined };
}

export function callValue(name: string): UnitValue {
  return namedValue(name, CALL_UNITS[name] ?? unitOfCallName(name), true);
}

function unitTypeValue(receiver: UnitValue, name: string, call: boolean): UnitValue | undefined {
  const unit = call ? undefined : unitOfConstant(name);
  return UNIT_TYPES.has(receiver.name ?? '') && unit !== undefined
    ? { timeUnit: unit, name: `${receiver.name ?? ''}.${name}` }
    : undefined;
}

function unitTypeCall(file: UnitBase, { receiver, name, nameIndex, args }: Selector): UnitValue {
  const [first] = args ?? [];
  if (first !== undefined && first.name === undefined) {
    reportArgument(file, {
      nameIndex,
      callee: `${receiver.name ?? ''}.${name}`,
      unit: receiver.timeUnit,
      value: first.value,
      parameter: 'duration',
    });
  }
  return callValue(name);
}

function durationProperty(file: UnitBase, { receiver, name, nameIndex }: Selector): UnitValue {
  const unit = DURATION_PROPERTIES[name];
  reportArgument(file, {
    nameIndex,
    callee: `.${name}`,
    unit,
    value: receiver,
    parameter: 'receiver',
  });
  return {};
}

function conversion(
  file: UnitBase,
  { receiver, name, nameIndex, args }: Selector,
): UnitValue | undefined {
  const call = args !== undefined;
  const first = args?.[0]?.value;
  if (call && name === 'toDuration' && first?.timeUnit !== undefined) {
    const unit = first.timeUnit;
    reportArgument(file, {
      nameIndex,
      callee: '.toDuration',
      unit,
      value: receiver,
      parameter: 'receiver',
    });
    return {};
  }
  if (call && name === 'toInt' && receiver.epoch === true) {
    reportNarrowed(file, { index: nameIndex, value: receiver, operator: '.toInt()' });
    return { unit: receiver.unit, epoch: true };
  }
  if (call && name === 'toIntExact' && first?.epoch === true) {
    reportNarrowed(file, { index: nameIndex, value: first, operator: 'Math.toIntExact' });
    return { unit: first.unit, epoch: true };
  }
  return PASSING.has(name) ? { unit: receiver.unit, epoch: receiver.epoch } : undefined;
}

function plainSelector(file: UnitBase, selector: Selector): UnitValue {
  const { receiver, name, args } = selector;
  if (EPOCH_SELECTORS.has(`${receiver.name ?? ''}.${name}`)) {
    return { unit: 'ms', epoch: true };
  }
  if (args !== undefined) {
    const unit = RECEIVER_CALLS[`${receiver.name ?? ''}.${name}`];
    checkCall(file, { ...selector, args, unit });
    return callValue(name);
  }
  return namedValue(name, unitOfName(name));
}

function unitSelector(file: UnitBase, selector: Selector): UnitValue | undefined {
  const { receiver, name, args } = selector;
  const call = args !== undefined;
  const unitType = unitTypeValue(receiver, name, call);
  if (unitType !== undefined) {
    return unitType;
  }
  if (receiver.timeUnit !== undefined && call) {
    return unitTypeCall(file, selector);
  }
  return !call && DURATION_PROPERTIES[name] !== undefined && hasDurationProperty(file, name)
    ? durationProperty(file, selector)
    : undefined;
}

export function selectorValue(parser: Parser, selector: Selector): UnitValue {
  const { file } = parser;
  return (
    unitSelector(file, selector) ?? conversion(file, selector) ?? plainSelector(file, selector)
  );
}
