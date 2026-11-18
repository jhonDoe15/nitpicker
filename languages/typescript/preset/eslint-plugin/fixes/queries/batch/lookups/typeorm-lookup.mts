import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { typeServices } from '../../../../rules/security/security-values.mts';
import { keyColumn } from '../../orm/key-column.mts';
import { isAtLeast } from '../../orm/project-files.mts';
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

const BY_FORMS = new Map([
  ['findOneBy', 'findBy'],
  ['findBy', 'findBy'],
]);
const OPTION_FORMS = new Map([
  ['findOne', 'find'],
  ['find', 'find'],
]);
const ROW_METHODS = new Set(['findOneBy', 'findOne']);
const OPTIONS = new Set([
  'where',
  'select',
  'relations',
  'order',
  'withDeleted',
  'loadEagerRelations',
]);

function valueTypeOf(site: Site, kind: 'row' | 'list'): string | undefined {
  const services = typeServices(site.context);
  const { entity } = site.orm;
  if (services === undefined || entity === undefined || !isTypeScriptFile(site.context.filename)) {
    return undefined;
  }
  const text = printedType(
    services.program.getTypeChecker(),
    entity,
    services.esTreeNodeToTSNodeMap.get(site.call),
  );
  return text === undefined || kind === 'row' ? text : `${text}[]`;
}

export function typeormLookup(site: Site): Lookup | undefined {
  const { call, orm, context } = site;
  const rename = BY_FORMS.get(orm.method) ?? OPTION_FORMS.get(orm.method);
  const [argument] = call.arguments;
  const { callee } = call;
  if (
    rename === undefined ||
    orm.entity === undefined ||
    !isAtLeast(orm.version, 0, 3) ||
    call.arguments.length !== 1 ||
    argument?.type !== AST_NODE_TYPES.ObjectExpression ||
    callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return undefined;
  }
  const byForm = BY_FORMS.has(orm.method);
  const keyed = keyedWhere(site, byForm ? argument : valueOf(argument, 'where'));
  const kind = ROW_METHODS.has(orm.method) ? 'row' : 'list';
  const column = keyed === undefined ? undefined : keyColumn(context, orm, keyed.keyName);
  const optionsFit =
    byForm ||
    (optionsAllowed(site, argument, OPTIONS) &&
      selectIncludes(valueOf(argument, 'select'), keyed?.keyName ?? ''));
  const unique = column?.primary === true || column?.unique === true;
  if (
    keyed === undefined ||
    column === undefined ||
    !optionsFit ||
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
        { range: callee.property.range, text: rename },
        { range: keyed.keyProperty.range, text: `${keyed.keyName}: In(${part})` },
      ]),
  };
}
