import { libraryBinding, variableOf } from '../../../libraries/module-bindings.mjs';
import { chainOf } from '../analysis/ancestry.mjs';
import { objectKeys, propertyName, typeNames } from './date-calls.mjs';
import {
  CHAIN_COMPARISONS,
  CHAIN_INSTANTS,
  CHAIN_READS,
  CHAIN_ZONE_SETTERS,
  DATE_FNS_CALENDAR,
  DATE_FNS_PACKAGES,
  DAYJS_FACTORIES,
  DAYJS_PACKAGES,
  LOCAL_ZONE_NAMES,
  LUXON_FACTORIES,
  LUXON_OPTION_POSITIONS,
  LUXON_PACKAGES,
  LUXON_ZONE_KEYS,
  SUB_DAY_UNITS,
  WITH_OFFSET,
  ZONE_PACKAGES,
  ZONED_DATE_TYPES,
} from './time-zone-tables.mjs';

function exportedName(binding) {
  if (binding.name !== undefined) {
    return binding.name;
  }
  const subpath = binding.source.split('/').slice(binding.source.startsWith('@') ? 2 : 1);
  return subpath.length === 0 || subpath.at(-1) === 'fp' ? '' : subpath.at(-1);
}

function bindingOf(sourceCode, identifier, packages) {
  return identifier.type === 'Identifier'
    ? libraryBinding(variableOf(sourceCode, identifier), packages)
    : undefined;
}

function calleeChain(callee) {
  const nodes = chainOf(callee, (node) =>
    node.type === 'MemberExpression' ? node.object : undefined,
  );
  const members = nodes.slice(0, -1).toReversed();
  const names = members.map((member) => propertyName(member));
  return names.includes(undefined) ? undefined : { root: nodes.at(-1), names };
}

function libraryPath(sourceCode, callee, packages) {
  const chain = calleeChain(callee);
  const binding = chain === undefined ? undefined : bindingOf(sourceCode, chain.root, packages);
  if (binding === undefined) {
    return undefined;
  }
  const owner = exportedName(binding);
  return [...(owner === '' ? [] : [owner]), ...chain.names].join('.');
}

function chainedMethod(call) {
  const member = call.parent;
  const outer = member.parent;
  return member.type === 'MemberExpression' &&
    member.object === call &&
    outer.type === 'CallExpression' &&
    outer.callee === member
    ? { name: propertyName(member), call: outer }
    : undefined;
}

function isSubDayComparison(call) {
  const [, unit] = call.arguments;
  return (
    call.arguments.length <= 1 || (unit?.type === 'Literal' && SUB_DAY_UNITS.includes(unit.value))
  );
}

function readsInstant(call) {
  const member = call.parent;
  return (
    member.type === 'MemberExpression' &&
    member.object === call &&
    member.parent.type !== 'CallExpression' &&
    CHAIN_READS.includes(propertyName(member))
  );
}

function settlesZone(call, library) {
  if (readsInstant(call)) {
    return true;
  }
  const next = chainedMethod(call);
  if (next === undefined) {
    return false;
  }
  if (CHAIN_ZONE_SETTERS[library].includes(next.name)) {
    return !isLocalZone(next.call.arguments[0]);
  }
  return (
    CHAIN_INSTANTS[library].includes(next.name) ||
    (CHAIN_COMPARISONS[library].includes(next.name) && isSubDayComparison(next.call))
  );
}

function isLocalZone(node) {
  return node?.type === 'Literal' && LOCAL_ZONE_NAMES.includes(node.value);
}

function zoneOption(call, keys) {
  return call.arguments
    .map((argument) => objectKeys(argument))
    .filter((options) => options !== undefined)
    .flatMap((options) => keys.filter((key) => options.has(key)).map((key) => options.get(key)));
}

export function luxonProblem(context, call) {
  const path = libraryPath(context.sourceCode, call.callee, LUXON_PACKAGES);
  const factory = path?.startsWith('DateTime.') ? path.slice('DateTime.'.length) : undefined;
  if (factory === undefined || !LUXON_FACTORIES.includes(factory)) {
    return undefined;
  }
  const zones = zoneOption(call, LUXON_ZONE_KEYS);
  const explicit =
    (zones.length > 0 && !zones.some(isLocalZone)) || hasUnknownOptions(call, factory);
  return explicit || settlesZone(call, 'luxon')
    ? undefined
    : { messageId: 'luxonLocal', data: { name: `DateTime.${factory}` } };
}

function hasUnknownOptions(call, factory) {
  const position = LUXON_OPTION_POSITIONS[factory];
  const options = position === undefined ? undefined : call.arguments[position];
  return options !== undefined && options.type !== 'Literal' && objectKeys(options) === undefined;
}

function isZonedArgument(context, node) {
  const { sourceCode } = context;
  if (node === undefined) {
    return false;
  }
  const value =
    node.type === 'NewExpression' || node.type === 'CallExpression' ? node.callee : undefined;
  if (value !== undefined && libraryPath(sourceCode, value, ZONE_PACKAGES) !== undefined) {
    return true;
  }
  const services = sourceCode.parserServices;
  return (
    services?.program !== null &&
    services?.program !== undefined &&
    typeNames(services, node).some((name) => ZONED_DATE_TYPES.includes(name))
  );
}

function isOffsetText(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' && WITH_OFFSET.test(node.value);
}

export function dateFnsProblem(context, call) {
  const name = libraryPath(context.sourceCode, call.callee, DATE_FNS_PACKAGES)
    ?.split('.')
    .at(-1)
    ?.replace(/WithOptions$/u, '');
  if (name === undefined || !DATE_FNS_CALENDAR.test(name)) {
    return undefined;
  }
  const [first] = call.arguments;
  const zoned =
    zoneOption(call, ['in', 'timeZone']).length > 0 ||
    isZonedArgument(context, first) ||
    isOffsetText(first);
  return zoned ? undefined : { messageId: 'dateFnsLocal', data: { name } };
}

export function dayjsProblem(context, call) {
  const root = call.callee.type === 'MemberExpression' ? call.callee.object : call.callee;
  const binding = bindingOf(context.sourceCode, root, DAYJS_PACKAGES);
  const path = libraryPath(context.sourceCode, call.callee, DAYJS_PACKAGES);
  if (binding === undefined || path === undefined || !DAYJS_FACTORIES.includes(path)) {
    return undefined;
  }
  const library = binding.source.startsWith('moment') ? 'moment' : 'dayjs';
  const name = path === '' ? `${library}()` : `${library}.${path}()`;
  return settlesZone(call, 'dayjs') ? undefined : { messageId: 'dayjsLocal', data: { name } };
}
