import type { TSESTree } from '@typescript-eslint/utils';
import type { JoinSite, Types } from '../../../rules/joins/relation-types.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import type { ReportFix } from '../../support/ranges.mts';
import { mikroStrategyFix } from './mikro-strategy.mts';
import { sequelizeSeparateFix } from './sequelize-separate.mts';
import { typeormStrategyFix } from './typeorm-strategy.mts';

export type StrategySuggestion = {
  readonly messageId: 'queryStrategy' | 'selectIn' | 'separate';
  readonly plan: ReportFix;
};

export function joinStrategyFix(
  context: Context,
  types: Types,
  site: { readonly join: JoinSite; readonly call: TSESTree.CallExpression },
): StrategySuggestion | undefined {
  const { orm } = site.join;
  if (orm === 'typeorm') {
    const plan = typeormStrategyFix(context, types, site);
    return plan === undefined ? undefined : { messageId: 'queryStrategy', plan };
  }
  if (orm === 'mikroOrm') {
    const plan = mikroStrategyFix(context, site);
    return plan === undefined ? undefined : { messageId: 'selectIn', plan };
  }
  const plan = sequelizeSeparateFix(context, types, site);
  return plan === undefined ? undefined : { messageId: 'separate', plan };
}
