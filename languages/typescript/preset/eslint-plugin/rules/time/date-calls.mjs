import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { initializer, variableOf } from '../../../libraries/module-bindings.mjs';
import {
  DATE_ONLY,
  LOCAL_DATE_METHODS,
  LOCAL_STRING_METHODS,
  LOCALE_METHODS,
  NAMED_ZONE,
  OFFSET_METHOD,
  TRAILING_TIME,
  WITH_OFFSET,
} from './time-zone-tables.mjs';

const NULLISH = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;

export function propertyName(member) {
  if (member.type !== 'MemberExpression') {
    return undefined;
  }
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name;
  }
  return member.property.type === 'Literal' && typeof member.property.value === 'string'
    ? member.property.value
    : undefined;
}

export function objectKeys(node) {
  if (node?.type !== 'ObjectExpression') {
    return undefined;
  }
  if (node.properties.some((property) => property.type !== 'Property' || property.computed)) {
    return undefined;
  }
  return new Map(
    node.properties.map((property) => [
      property.key.type === 'Identifier' ? property.key.name : property.key.value,
      property.value,
    ]),
  );
}

function isGlobal(sourceCode, identifier, name) {
  return (
    identifier.type === 'Identifier' &&
    identifier.name === name &&
    (variableOf(sourceCode, identifier)?.defs.length ?? 0) === 0
  );
}

function isDateConstruction(sourceCode, node) {
  return (
    node?.type === 'NewExpression' &&
    isGlobal(sourceCode, node.callee, 'Date') &&
    node.arguments.length <= 1
  );
}

function withoutReadonly(type) {
  return type.aliasSymbol?.getName() === 'Readonly' && type.aliasTypeArguments?.length === 1
    ? type.aliasTypeArguments[0]
    : type;
}

export function typeNames(services, node) {
  const type = withoutReadonly(services.getTypeAtLocation(node));
  const parts = (type.isUnion() ? type.types : [type]).filter((part) => !(part.flags & NULLISH));
  return parts.map((part) => withoutReadonly(part).getSymbol()?.getName());
}

function isLibraryDateMember(services, property) {
  const { program } = services;
  const symbol = program
    .getTypeChecker()
    .getSymbolAtLocation(services.esTreeNodeToTSNodeMap.get(property));
  const declarations = symbol?.getDeclarations() ?? [];
  return (
    declarations.length > 0 &&
    declarations.every(
      (declaration) =>
        ts.isInterfaceDeclaration(declaration.parent) &&
        declaration.parent.name.text === 'Date' &&
        program.isSourceFileDefaultLibrary(declaration.getSourceFile()),
    )
  );
}

function isDate(context, member) {
  const { sourceCode } = context;
  const services = sourceCode.parserServices;
  if (services?.program !== null && services?.program !== undefined) {
    return isLibraryDateMember(services, member.property);
  }
  const node = member.object;
  const value = node.type === 'Identifier' ? initializer(variableOf(sourceCode, node)) : node;
  return isDateConstruction(sourceCode, value);
}

function lacksTimeZone(options) {
  if (options === undefined) {
    return true;
  }
  const keys = objectKeys(options);
  return keys !== undefined && !keys.has('timeZone');
}

function dateMethodReport(name, call) {
  if (Object.hasOwn(LOCAL_DATE_METHODS, name)) {
    return { messageId: 'localDateMethod', data: { name, utc: LOCAL_DATE_METHODS[name] } };
  }
  if (name === OFFSET_METHOD) {
    return { messageId: 'localOffset', data: { name } };
  }
  if (LOCAL_STRING_METHODS.includes(name)) {
    return call.arguments.length === 0 ? { messageId: 'localString', data: { name } } : undefined;
  }
  return LOCALE_METHODS.includes(name) && lacksTimeZone(call.arguments[1])
    ? { messageId: 'localeWithoutZone', data: { name } }
    : undefined;
}

export function dateMethodProblem(context, call) {
  const { callee } = call;
  const name = propertyName(callee);
  if (name === undefined || callee.object.type === 'Super') {
    return undefined;
  }
  const report = dateMethodReport(name, call);
  return report !== undefined && isDate(context, callee) ? report : undefined;
}

function isIntlFormatter(sourceCode, callee) {
  return propertyName(callee) === 'DateTimeFormat' && isGlobal(sourceCode, callee.object, 'Intl');
}

function readsZoneKey(pattern) {
  return (
    pattern.type === 'ObjectPattern' &&
    pattern.properties.some(
      (property) =>
        property.type === 'Property' &&
        !property.computed &&
        (property.key.name ?? property.key.value) === 'timeZone',
    )
  );
}

function resolvedOptionsRead(call) {
  const member = call.parent;
  const resolved =
    member.type === 'MemberExpression' &&
    member.object === call &&
    propertyName(member) === 'resolvedOptions' &&
    member.parent.type === 'CallExpression' &&
    member.parent.callee === member;
  if (!resolved) {
    return undefined;
  }
  const read = member.parent.parent;
  if (read.type === 'VariableDeclarator' && read.init === member.parent) {
    return readsZoneKey(read.id) ? 'timeZone' : '';
  }
  return read.type === 'MemberExpression' && read.object === member.parent
    ? propertyName(read)
    : '';
}

export function intlProblem(context, call) {
  if (!isIntlFormatter(context.sourceCode, call.callee) || !lacksTimeZone(call.arguments[1])) {
    return undefined;
  }
  const read = resolvedOptionsRead(call);
  if (read === undefined) {
    return { messageId: 'intlWithoutZone', data: {} };
  }
  return read === 'timeZone' ? { messageId: 'serverZoneName', data: {} } : undefined;
}

function staticText(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return { text: node.value.trim(), complete: true };
  }
  if (node?.type === 'TemplateLiteral') {
    const last = node.quasis.at(-1).value.cooked ?? '';
    return {
      text: node.expressions.length === 0 ? last.trim() : last,
      complete: node.expressions.length === 0,
    };
  }
  return undefined;
}

function isLocalDateTimeText(node) {
  const value = staticText(node);
  if (value === undefined) {
    return false;
  }
  if (!value.complete) {
    return TRAILING_TIME.test(value.text);
  }
  return (
    value.text !== '' &&
    !DATE_ONLY.test(value.text) &&
    !WITH_OFFSET.test(value.text) &&
    !NAMED_ZONE.test(value.text)
  );
}

export function constructorProblem(context, node) {
  if (!isGlobal(context.sourceCode, node.callee, 'Date')) {
    return undefined;
  }
  if (node.arguments.length >= 2) {
    return { messageId: 'localConstructor', data: {} };
  }
  return isLocalDateTimeText(node.arguments[0]) ? { messageId: 'localParse', data: {} } : undefined;
}

export function parseProblem(context, call) {
  const { callee } = call;
  const parses =
    propertyName(callee) === 'parse' && isGlobal(context.sourceCode, callee.object, 'Date');
  return parses && isLocalDateTimeText(call.arguments[0])
    ? { messageId: 'localParse', data: {} }
    : undefined;
}
