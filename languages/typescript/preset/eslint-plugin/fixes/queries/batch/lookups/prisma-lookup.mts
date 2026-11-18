import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices } from '../../../../rules/security/security-values.mts';
import { isReference } from '../../../../rules/typed/typescript-views.mts';
import { keyColumn } from '../../orm/key-column.mts';
import type { OrmCall } from '../../orm/orm-call.mts';
import { isAtLeast, packageVersion } from '../../orm/project-files.mts';
import { isTypeScriptFile, printedType, spliced } from '../text.mts';
import {
  keyedWhere,
  optionsAllowed,
  scalarOf,
  selectIncludes,
  valueOf,
  type Lookup,
  type Site,
} from './lookup-plan.mts';

const ROW_METHODS = new Set(['findUnique', 'findFirst']);
const ROW_OPTIONS = new Set(['where', 'select', 'include']);
const LIST_OPTIONS = new Set(['where', 'select', 'include', 'orderBy']);
export const EXTENSIONS = /\$extends|\$use\b/u;

export function hasNoMiddleware(orm: OrmCall): boolean {
  const version = orm.version ?? packageVersion(orm.declarationFile, 'prisma');
  return isAtLeast(version, 6, 0);
}

function elementOf(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
): TypeScript.Type | undefined {
  return checker.isArrayType(type) && isReference(type)
    ? checker.getTypeArguments(type)[0]
    : undefined;
}

function valueTypeOf(site: Site, kind: 'row' | 'list'): string | undefined {
  const services = typeServices(site.context);
  if (services === undefined || !isTypeScriptFile(site.context.filename)) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const awaited = checker.getAwaitedType(services.getTypeAtLocation(site.call));
  if (awaited === undefined) {
    return undefined;
  }
  const type = kind === 'row' ? checker.getNonNullableType(awaited) : elementOf(checker, awaited);
  const text =
    type === undefined
      ? undefined
      : printedType(checker, type, services.esTreeNodeToTSNodeMap.get(site.call));
  return text === undefined || kind === 'row' ? text : `Array<${text}>`;
}

export function prismaLookup(site: Site): Lookup | undefined {
  const { call, orm, context } = site;
  const [argument] = call.arguments;
  const { callee } = call;
  const kind = ROW_METHODS.has(orm.method) ? 'row' : 'list';
  if (
    (kind === 'list' && orm.method !== 'findMany') ||
    call.arguments.length !== 1 ||
    argument?.type !== AST_NODE_TYPES.ObjectExpression ||
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    !hasNoMiddleware(orm) ||
    EXTENSIONS.test(context.sourceCode.text)
  ) {
    return undefined;
  }
  const keyed = keyedWhere(site, valueOf(argument, 'where'));
  const column = keyed === undefined ? undefined : keyColumn(context, orm, keyed.keyName);
  const unique = column?.primary === true || column?.unique === true;
  if (
    keyed === undefined ||
    column === undefined ||
    !optionsAllowed(site, argument, kind === 'row' ? ROW_OPTIONS : LIST_OPTIONS) ||
    !selectIncludes(valueOf(argument, 'select'), keyed.keyName) ||
    !column.comparable ||
    (kind === 'row' && !unique) ||
    column.type !== scalarOf(site, keyed.keyExpression)
  ) {
    return undefined;
  }
  const { sourceCode } = context;
  return {
    orm,
    kind,
    keyName: keyed.keyName,
    keyExpression: keyed.keyExpression,
    keyType: column.type,
    valueType: valueTypeOf(site, kind),
    callText: (part) =>
      spliced(sourceCode, call.range, [
        { range: callee.property.range, text: 'findMany' },
        { range: keyed.keyProperty.range, text: `${keyed.keyName}: { in: ${part} }` },
      ]),
  };
}
