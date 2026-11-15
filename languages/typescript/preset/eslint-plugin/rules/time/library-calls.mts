import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import { chainOf, type SourceCode } from '../typed/node-views.mts';
import { objectKeys, typeNames } from './date-calls.mts';
import { propertyName } from './units/unit-nodes.mts';
import {
  hasTypeInformation,
  libraryBinding,
  variableOf,
  type LibraryBinding,
  type Problem,
} from './time-views.mts';
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
  type ChainLibrary,
} from './time-zone-tables.mts';

function exportedName(binding: LibraryBinding): string {
  if (binding.name !== undefined) {
    return binding.name;
  }
  const subpath = binding.source.split('/').slice(binding.source.startsWith('@') ? 2 : 1);
  return subpath.length === 0 || subpath.at(-1) === 'fp' ? '' : (subpath.at(-1) ?? '');
}

function bindingOf(
  sourceCode: SourceCode,
  identifier: TSESTree.Node,
  packages: readonly string[],
): LibraryBinding | undefined {
  return identifier.type === AST_NODE_TYPES.Identifier
    ? libraryBinding(variableOf(sourceCode, identifier), packages)
    : undefined;
}

function calleeChain(callee: TSESTree.Node): { root: TSESTree.Node; names: string[] } | undefined {
  const nodes = chainOf(callee, (node) =>
    node.type === AST_NODE_TYPES.MemberExpression ? node.object : undefined,
  );
  const members = nodes.slice(0, -1).toReversed();
  const names = members.map((member) => propertyName(member));
  const known = names.filter((name) => name !== undefined);
  const root = nodes.at(-1);
  return root === undefined || known.length !== names.length ? undefined : { root, names: known };
}

function libraryPath(
  sourceCode: SourceCode,
  callee: TSESTree.Node,
  packages: readonly string[],
): string | undefined {
  const chain = calleeChain(callee);
  const binding = chain === undefined ? undefined : bindingOf(sourceCode, chain.root, packages);
  if (chain === undefined || binding === undefined) {
    return undefined;
  }
  const owner = exportedName(binding);
  return [...(owner === '' ? [] : [owner]), ...chain.names].join('.');
}

function chainedMethod(
  call: TSESTree.CallExpression,
): { name: string | undefined; call: TSESTree.CallExpression } | undefined {
  const member = call.parent;
  const outer = member.parent;
  return member.type === AST_NODE_TYPES.MemberExpression &&
    member.object === call &&
    outer?.type === AST_NODE_TYPES.CallExpression &&
    outer.callee === member
    ? { name: propertyName(member), call: outer }
    : undefined;
}

function isSubDayComparison(call: TSESTree.CallExpression): boolean {
  const [, unit] = call.arguments;
  return (
    call.arguments.length <= 1 ||
    (unit?.type === AST_NODE_TYPES.Literal &&
      typeof unit.value === 'string' &&
      SUB_DAY_UNITS.includes(unit.value))
  );
}

function readsInstant(call: TSESTree.CallExpression): boolean {
  const member = call.parent;
  const name = propertyName(member);
  return (
    member.type === AST_NODE_TYPES.MemberExpression &&
    member.object === call &&
    member.parent.type !== AST_NODE_TYPES.CallExpression &&
    name !== undefined &&
    CHAIN_READS.includes(name)
  );
}

function settlesZone(call: TSESTree.CallExpression, library: ChainLibrary): boolean {
  if (readsInstant(call)) {
    return true;
  }
  const next = chainedMethod(call);
  if (next === undefined) {
    return false;
  }
  const name = next.name ?? '';
  if (CHAIN_ZONE_SETTERS[library].includes(name)) {
    return !isLocalZone(next.call.arguments[0]);
  }
  return (
    CHAIN_INSTANTS[library].includes(name) ||
    (CHAIN_COMPARISONS[library].includes(name) && isSubDayComparison(next.call))
  );
}

function isLocalZone(node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.Literal &&
    typeof node.value === 'string' &&
    LOCAL_ZONE_NAMES.includes(node.value)
  );
}

function zoneOption(call: TSESTree.CallExpression, keys: readonly string[]): TSESTree.Node[] {
  return call.arguments
    .map((argument) => objectKeys(argument))
    .filter((options) => options !== undefined)
    .flatMap((options) => keys.flatMap((key) => options.get(key) ?? []));
}

export function luxonProblem(
  context: SourceContext,
  call: TSESTree.CallExpression,
): Problem | undefined {
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

function hasUnknownOptions(call: TSESTree.CallExpression, factory: string): boolean {
  const position = LUXON_OPTION_POSITIONS[factory];
  const options = position === undefined ? undefined : call.arguments[position];
  return (
    options !== undefined &&
    options.type !== AST_NODE_TYPES.Literal &&
    objectKeys(options) === undefined
  );
}

function isZonedArgument(context: SourceContext, node: TSESTree.Node | undefined): boolean {
  const { sourceCode } = context;
  if (node === undefined) {
    return false;
  }
  const value =
    node.type === AST_NODE_TYPES.NewExpression || node.type === AST_NODE_TYPES.CallExpression
      ? node.callee
      : undefined;
  if (value !== undefined && libraryPath(sourceCode, value, ZONE_PACKAGES) !== undefined) {
    return true;
  }
  const services = sourceCode.parserServices;
  return (
    hasTypeInformation(services) &&
    typeNames(services, node).some((name) => name !== undefined && ZONED_DATE_TYPES.includes(name))
  );
}

function isOffsetText(node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.Literal &&
    typeof node.value === 'string' &&
    WITH_OFFSET.test(node.value)
  );
}

export function dateFnsProblem(
  context: SourceContext,
  call: TSESTree.CallExpression,
): Problem | undefined {
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

export function dayjsProblem(
  context: SourceContext,
  call: TSESTree.CallExpression,
): Problem | undefined {
  const root =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.object : call.callee;
  const binding = bindingOf(context.sourceCode, root, DAYJS_PACKAGES);
  const path = libraryPath(context.sourceCode, call.callee, DAYJS_PACKAGES);
  if (binding === undefined || path === undefined || !DAYJS_FACTORIES.includes(path)) {
    return undefined;
  }
  const library = binding.source.startsWith('moment') ? 'moment' : 'dayjs';
  const name = path === '' ? `${library}()` : `${library}.${path}()`;
  return settlesZone(call, 'dayjs') ? undefined : { messageId: 'dayjsLocal', data: { name } };
}
