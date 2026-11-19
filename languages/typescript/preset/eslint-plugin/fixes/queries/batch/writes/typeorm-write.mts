import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { typeServices } from '../../../../rules/security/security-values.mts';
import { isInvariant } from '../../loops/invariants.mts';
import { keyColumn } from '../../orm/key-column.mts';
import { isModernTypeorm } from '../../orm/project-files.mts';
import { isSelfReferencing, primaryProperty } from '../../orm/typeorm-columns.mts';
import { hasPerRowEffects } from '../../orm/typeorm-hooks.mts';
import { hasUniqueKeys } from '../../loops/unique-keys.mts';
import { spliced } from '../text.mts';
import { isItemChain, keyedWhere, scalarOf } from '../lookups/lookup-plan.mts';
import type { WriteSite } from './write-loop.mts';

export type TypeormWrite = {
  readonly keyExpression: TSESTree.Expression;
  readonly callText: (part: string) => string;
};

const ARGUMENT_COUNTS = new Map([
  ['delete', 1],
  ['update', 2],
]);

type Keyed = {
  readonly keyName: string;
  readonly keyExpression: TSESTree.Expression;
  readonly replace: (part: string) => { range: TSESTree.Range; text: string };
};

function primaryKeyed(site: WriteSite, argument: TSESTree.Expression): Keyed | undefined {
  const services = typeServices(site.context);
  const { entity } = site.orm;
  if (services === undefined || entity === undefined) {
    return undefined;
  }
  const keyName = primaryProperty(services.program.getTypeChecker(), entity);
  if (keyName === undefined) {
    return undefined;
  }
  return {
    keyName,
    keyExpression: argument,
    replace: (part) => ({ range: argument.range, text: `{ ${keyName}: In(${part}) }` }),
  };
}

function whereKeyed(site: WriteSite, argument: TSESTree.ObjectExpression): Keyed | undefined {
  const keyed = keyedWhere(site, argument);
  if (keyed === undefined) {
    return undefined;
  }
  return {
    keyName: keyed.keyName,
    keyExpression: keyed.keyExpression,
    replace: (part) => ({
      range: keyed.keyProperty.range,
      text: `${keyed.keyName}: In(${part})`,
    }),
  };
}

function keyedOf(site: WriteSite, argument: TSESTree.CallExpressionArgument): Keyed | undefined {
  if (argument.type === AST_NODE_TYPES.SpreadElement) {
    return undefined;
  }
  if (argument.type === AST_NODE_TYPES.ObjectExpression) {
    return whereKeyed(site, argument);
  }
  return isItemChain(argument, site.loop.item.name) ? primaryKeyed(site, argument) : undefined;
}

export function typeormWrite(site: WriteSite): TypeormWrite | undefined {
  const { call, orm, context } = site;
  const services = typeServices(context);
  const [argument, data] = call.arguments;
  if (
    orm.orm !== 'typeorm' ||
    orm.entity === undefined ||
    services === undefined ||
    argument === undefined ||
    ARGUMENT_COUNTS.get(orm.method) !== call.arguments.length ||
    !isModernTypeorm(orm.version) ||
    isSelfReferencing(services.program.getTypeChecker(), orm.entity) ||
    hasPerRowEffects(
      services.program.getTypeChecker(),
      orm.entity,
      hasUniqueKeys(context, site.loop.iterable),
    )
  ) {
    return undefined;
  }
  const keyed = keyedOf(site, argument);
  const column = keyed === undefined ? undefined : keyColumn(context, orm, keyed.keyName);
  const dataFits =
    data === undefined ||
    (data.type !== AST_NODE_TYPES.SpreadElement &&
      isInvariant(context.sourceCode, data, site.repeated));
  if (
    keyed === undefined ||
    column === undefined ||
    !dataFits ||
    !column.comparable ||
    column.type !== scalarOf(site, keyed.keyExpression)
  ) {
    return undefined;
  }
  return {
    keyExpression: keyed.keyExpression,
    callText: (part) => spliced(context.sourceCode, call.range, [keyed.replace(part)]),
  };
}
