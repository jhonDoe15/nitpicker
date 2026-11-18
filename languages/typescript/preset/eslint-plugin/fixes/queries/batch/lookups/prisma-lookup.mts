import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices } from '../../../../rules/security/security-values.mts';
import { isReference } from '../../../../rules/typed/typescript-views.mts';
import type { OrmCall } from '../../orm/orm-call.mts';
import { isAtLeast, packageVersion } from '../../orm/project-files.mts';
import { isTypeScriptFile, printedType } from '../text.mts';
import {
  keyedWhere,
  optionsAllowed,
  resolvedLookup,
  selectIncludes,
  valueOf,
  type Lookup,
  type Site,
} from './lookup-plan.mts';

const ROW_METHODS = new Set(['findUnique', 'findFirst']);
const WHERE = 'where';
const SELECT = 'select';
const NO_MIDDLEWARE_MAJOR = 6;
const ROW_OPTIONS = new Set([WHERE, SELECT, 'include']);
const LIST_OPTIONS = new Set([WHERE, SELECT, 'include', 'orderBy']);
export const EXTENSIONS = /\$extends|\$use\b/u;

export function hasNoMiddleware(orm: OrmCall): boolean {
  const version = orm.version ?? packageVersion(orm.declarationFile, 'prisma');
  return isAtLeast(version, NO_MIDDLEWARE_MAJOR, 0);
}

function elementOf(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
): TypeScript.Type | undefined {
  return checker.isArrayType(type) && isReference(type)
    ? checker.getTypeArguments(type)[0]
    : undefined;
}

function valueTypeOf(site: Site, kind: Lookup['kind']): string | undefined {
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
  const keyed = keyedWhere(site, valueOf(argument, WHERE));
  const allowed = kind === 'row' ? ROW_OPTIONS : LIST_OPTIONS;
  return resolvedLookup(site, {
    callee,
    keyed,
    kind,
    rename: 'findMany',
    optionsFit:
      keyed !== undefined &&
      optionsAllowed(site, argument, allowed) &&
      selectIncludes(valueOf(argument, SELECT), keyed.keyName),
    keyText: (name, part) => `${name}: { in: ${part} }`,
    valueTypeOf,
  });
}
