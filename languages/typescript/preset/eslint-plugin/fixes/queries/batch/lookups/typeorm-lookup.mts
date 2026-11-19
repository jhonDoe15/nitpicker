import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { typeServices } from '../../../../rules/security/security-values.mts';
import { isModernTypeorm } from '../../orm/project-files.mts';
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

const FIND_BY = 'findBy';
const BY_FORMS = new Map([
  ['findOneBy', FIND_BY],
  [FIND_BY, FIND_BY],
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

function valueTypeOf(site: Site, kind: Lookup['kind']): string | undefined {
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
  const { call, orm } = site;
  const rename = BY_FORMS.get(orm.method) ?? OPTION_FORMS.get(orm.method);
  const [argument] = call.arguments;
  const { callee } = call;
  if (
    rename === undefined ||
    orm.entity === undefined ||
    !isModernTypeorm(orm.version) ||
    call.arguments.length !== 1 ||
    argument?.type !== AST_NODE_TYPES.ObjectExpression ||
    callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return undefined;
  }
  const byForm = BY_FORMS.has(orm.method);
  const keyed = keyedWhere(site, byForm ? argument : valueOf(argument, 'where'));
  return resolvedLookup(site, {
    callee,
    keyed,
    rename,
    kind: ROW_METHODS.has(orm.method) ? 'row' : 'list',
    optionsFit:
      byForm ||
      (optionsAllowed(site, argument, OPTIONS) &&
        selectIncludes(valueOf(argument, 'select'), keyed?.keyName ?? '')),
    keyText: (name, part) => `${name}: In(${part})`,
    valueTypeOf,
  });
}
