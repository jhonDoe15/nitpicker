import {
  isEpochName,
  unitOfCallName,
  unitOfConstant,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';
import { checkCall, hasDurationProperty, reportArgument, reportNarrowed } from './unit-reports.mjs';

const UNIT_TYPES = new Set(['TimeUnit', 'ChronoUnit', 'DurationUnit']);
const DURATION_PROPERTIES = {
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
const CALL_UNITS = { nanoTime: 'ns', measureNanoTime: 'ns' };
const EPOCH_CALLS = new Set(['currentTimeMillis']);
const RECEIVER_CALLS = { 'Thread.sleep': 'ms' };
const EPOCH_SELECTORS = new Set(['Date.time', 'Date.getTime']);

export function namedValue(name, unit, call = false) {
  return unit === undefined
    ? { name }
    : { name, unit, epoch: isEpochName(name) || (call && EPOCH_CALLS.has(name)) };
}

export function callValue(name) {
  return namedValue(name, CALL_UNITS[name] ?? unitOfCallName(name), true);
}

function unitTypeValue(receiver, name, call) {
  const unit = call ? undefined : unitOfConstant(name);
  return UNIT_TYPES.has(receiver.name) && unit !== undefined
    ? { timeUnit: unit, name: `${receiver.name}.${name}` }
    : undefined;
}

function unitTypeCall(file, { receiver, name, nameIndex, args }) {
  const [first] = args;
  if (first !== undefined && first.name === undefined) {
    reportArgument(file, {
      nameIndex,
      callee: `${receiver.name}.${name}`,
      unit: receiver.timeUnit,
      value: first.value,
      parameter: 'duration',
    });
  }
  return callValue(name);
}

function durationProperty(file, { receiver, name, nameIndex }) {
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

function conversion(file, { receiver, name, nameIndex, args }) {
  const call = args !== undefined;
  if (call && name === 'toDuration' && args[0]?.value.timeUnit !== undefined) {
    const unit = args[0].value.timeUnit;
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
  if (call && name === 'toIntExact' && args[0]?.value.epoch === true) {
    reportNarrowed(file, { index: nameIndex, value: args[0].value, operator: 'Math.toIntExact' });
    return { unit: args[0].value.unit, epoch: true };
  }
  return PASSING.has(name) ? { unit: receiver.unit, epoch: receiver.epoch } : undefined;
}

function plainSelector(file, selector) {
  const { receiver, name, args } = selector;
  if (EPOCH_SELECTORS.has(`${receiver.name}.${name}`)) {
    return { unit: 'ms', epoch: true };
  }
  if (args !== undefined) {
    const unit = RECEIVER_CALLS[`${receiver.name}.${name}`];
    checkCall(file, { ...selector, unit });
    return callValue(name);
  }
  return namedValue(name, unitOfName(name));
}

function unitSelector(file, selector) {
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

export function selectorValue(parser, selector) {
  const { file } = parser;
  return (
    unitSelector(file, selector) ?? conversion(file, selector) ?? plainSelector(file, selector)
  );
}
