import {
  isEpochName,
  unitOfCallName,
  unitOfConstant,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';

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
    file.argument(
      nameIndex,
      `${receiver.name}.${name}`,
      receiver.timeUnit,
      first.value,
      'duration',
    );
  }
  return callValue(name);
}

function durationProperty(file, { receiver, name, nameIndex }) {
  file.argument(nameIndex, `.${name}`, DURATION_PROPERTIES[name], receiver, 'receiver');
  return {};
}

function conversion(file, { receiver, name, nameIndex, args }) {
  const call = args !== undefined;
  if (call && name === 'toDuration' && args[0]?.value.timeUnit !== undefined) {
    file.argument(nameIndex, '.toDuration', args[0].value.timeUnit, receiver, 'receiver');
    return {};
  }
  if (call && name === 'toInt' && receiver.epoch === true) {
    file.narrowed(nameIndex, receiver, '.toInt()');
    return { unit: receiver.unit, epoch: true };
  }
  if (call && name === 'toIntExact' && args[0]?.value.epoch === true) {
    file.narrowed(nameIndex, args[0].value, 'Math.toIntExact');
    return { unit: args[0].value.unit, epoch: true };
  }
  return PASSING.has(name) ? { unit: receiver.unit, epoch: receiver.epoch } : undefined;
}

export function selectorValue(parser, selector) {
  const { file } = parser;
  const { receiver, name, args } = selector;
  const call = args !== undefined;
  const unitType = unitTypeValue(receiver, name, call);
  if (unitType !== undefined) {
    return unitType;
  }
  if (receiver.timeUnit !== undefined && call) {
    return unitTypeCall(file, selector);
  }
  if (!call && DURATION_PROPERTIES[name] !== undefined && file.durationProperty(name)) {
    return durationProperty(file, selector);
  }
  const converted = conversion(file, selector);
  if (converted !== undefined) {
    return converted;
  }
  if (call) {
    const unit = RECEIVER_CALLS[`${receiver.name}.${name}`];
    file.checkCall({ ...selector, unit });
    return callValue(name);
  }
  return namedValue(name, unitOfName(name));
}
