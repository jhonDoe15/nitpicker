import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import type { SourceCode } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';
import { propertyName } from './units/unit-nodes.mts';
import { hasTypeInformation, initializer, variableOf, type Problem } from './time-views.mts';
import {
  DATE_ONLY,
  LOCAL_DATE_METHODS,
  LOCAL_STRING_METHODS,
  LOCALE_METHODS,
  NAMED_ZONE,
  OFFSET_METHOD,
  TRAILING_TIME,
  WITH_OFFSET,
} from './time-zone-tables.mts';

type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;

const TIME_ZONE = 'timeZone';
const NULLISH = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;

export function objectKeys(
  node: TSESTree.Node | undefined,
): Map<string, TSESTree.Node> | undefined {
  if (node?.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const keys = new Map<string, TSESTree.Node>();
  for (const property of node.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.computed) {
      return undefined;
    }
    keys.set(keyText(property.key), property.value);
  }
  return keys;
}

function keyText(key: TSESTree.Node): string {
  return key.type === AST_NODE_TYPES.Identifier ? key.name : String(Reflect.get(key, 'value'));
}

function isGlobal(sourceCode: SourceCode, identifier: TSESTree.Node, name: string): boolean {
  return (
    identifier.type === AST_NODE_TYPES.Identifier &&
    identifier.name === name &&
    (variableOf(sourceCode, identifier)?.defs.length ?? 0) === 0
  );
}

function isDateConstruction(sourceCode: SourceCode, node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.NewExpression &&
    isGlobal(sourceCode, node.callee, 'Date') &&
    node.arguments.length <= 1
  );
}

function withoutReadonly(type: TypeScript.Type): TypeScript.Type {
  const [only] = type.aliasTypeArguments ?? [];
  return type.aliasSymbol?.getName() === 'Readonly' &&
    type.aliasTypeArguments?.length === 1 &&
    only !== undefined
    ? only
    : type;
}

export function typeNames(
  services: ParserServicesWithTypeInformation,
  node: TSESTree.Node,
): (string | undefined)[] {
  const type = withoutReadonly(services.getTypeAtLocation(node));
  const parts = (type.isUnion() ? type.types : [type]).filter(
    (part) => (part.flags & NULLISH) === 0,
  );
  return parts.map((part) => withoutReadonly(part).getSymbol()?.getName());
}

function isLibraryDateMember(
  services: ParserServicesWithTypeInformation,
  property: TSESTree.Node,
): boolean {
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

function isDate(context: SourceContext, member: TSESTree.MemberExpression): boolean {
  const { sourceCode } = context;
  const services = sourceCode.parserServices;
  if (hasTypeInformation(services)) {
    return isLibraryDateMember(services, member.property);
  }
  const node = member.object;
  const value =
    node.type === AST_NODE_TYPES.Identifier ? initializer(variableOf(sourceCode, node)) : node;
  return isDateConstruction(sourceCode, value);
}

function lacksTimeZone(options: TSESTree.Node | undefined): boolean {
  if (options === undefined) {
    return true;
  }
  const keys = objectKeys(options);
  return keys !== undefined && !keys.has(TIME_ZONE);
}

function dateMethodReport(name: string, call: TSESTree.CallExpression): Problem | undefined {
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

export function dateMethodProblem(
  context: SourceContext,
  call: TSESTree.CallExpression,
): Problem | undefined {
  const { callee } = call;
  const name = propertyName(callee);
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    name === undefined ||
    callee.object.type === AST_NODE_TYPES.Super
  ) {
    return undefined;
  }
  const report = dateMethodReport(name, call);
  return report !== undefined && isDate(context, callee) ? report : undefined;
}

function isIntlFormatter(sourceCode: SourceCode, callee: TSESTree.Node): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(callee) === 'DateTimeFormat' &&
    isGlobal(sourceCode, callee.object, 'Intl')
  );
}

function readsZoneKey(pattern: TSESTree.Node): boolean {
  return (
    pattern.type === AST_NODE_TYPES.ObjectPattern &&
    pattern.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        !property.computed &&
        keyText(property.key) === TIME_ZONE,
    )
  );
}

function resolvedOptionsRead(call: CallLike): string | undefined {
  const member = call.parent;
  const outer =
    member.type === AST_NODE_TYPES.MemberExpression &&
    member.object === call &&
    propertyName(member) === 'resolvedOptions' &&
    member.parent.type === AST_NODE_TYPES.CallExpression &&
    member.parent.callee === member
      ? member.parent
      : undefined;
  if (outer === undefined) {
    return undefined;
  }
  const read = outer.parent;
  if (read.type === AST_NODE_TYPES.VariableDeclarator && read.init === outer) {
    return readsZoneKey(read.id) ? TIME_ZONE : '';
  }
  return read.type === AST_NODE_TYPES.MemberExpression && read.object === outer
    ? propertyName(read)
    : '';
}

export function intlProblem(context: SourceContext, call: CallLike): Problem | undefined {
  if (!(isIntlFormatter(context.sourceCode, call.callee) && lacksTimeZone(call.arguments[1]))) {
    return undefined;
  }
  const read = resolvedOptionsRead(call);
  if (read === undefined) {
    return { messageId: 'intlWithoutZone', data: {} };
  }
  return read === TIME_ZONE ? { messageId: 'serverZoneName', data: {} } : undefined;
}

function staticText(
  node: TSESTree.Node | undefined,
): { text: string; complete: boolean } | undefined {
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return { text: node.value.trim(), complete: true };
  }
  if (node?.type === AST_NODE_TYPES.TemplateLiteral) {
    const last = node.quasis.at(-1)?.value.cooked ?? '';
    return {
      text: node.expressions.length === 0 ? last.trim() : last,
      complete: node.expressions.length === 0,
    };
  }
  return undefined;
}

function isLocalDateTimeText(node: TSESTree.Node | undefined): boolean {
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

export function constructorProblem(
  context: SourceContext,
  node: TSESTree.NewExpression,
): Problem | undefined {
  if (!isGlobal(context.sourceCode, node.callee, 'Date')) {
    return undefined;
  }
  if (node.arguments.length >= 2) {
    return { messageId: 'localConstructor', data: {} };
  }
  return isLocalDateTimeText(node.arguments[0]) ? { messageId: 'localParse', data: {} } : undefined;
}

export function parseProblem(
  context: SourceContext,
  call: TSESTree.CallExpression,
): Problem | undefined {
  const { callee } = call;
  const parses =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(callee) === 'parse' &&
    isGlobal(context.sourceCode, callee.object, 'Date');
  return parses && isLocalDateTimeText(call.arguments[0])
    ? { messageId: 'localParse', data: {} }
    : undefined;
}
