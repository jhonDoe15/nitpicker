import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../../rules/security/security-values.mts';
import { allOf, type FixPlans } from '../../../edits/plans.mts';
import { importingName } from '../../../edits/imports.mts';
import { replacing } from '../../../support/ranges.mts';
import { isInvariant } from '../../loops/invariants.mts';
import type { LoopCall } from '../../loops/loop-call.mts';
import type { OrmCall } from '../../orm/orm-call.mts';
import { CHUNK, pickNames } from '../text.mts';
import { typeormWrite } from './typeorm-write.mts';
import { insertSuggestion } from './inserts/insert-suggestion.mts';
import {
  chunkedLoop,
  writeStatement,
  type WriteSite,
  type WriteSuggestion,
} from './write-loop.mts';

function siteOf(
  context: Context,
  call: TSESTree.CallExpression,
  { orm, loop }: { readonly orm: OrmCall; readonly loop: LoopCall },
): WriteSite | undefined {
  const statement = writeStatement(context, call, loop);
  const repeated = { range: loop.range, body: loop.body, target: call };
  if (statement === undefined || !isInvariant(context.sourceCode, orm.receiver, repeated)) {
    return undefined;
  }
  return { context, call, loop, orm, repeated, statement };
}

function keyedSuggestion(site: WriteSite): WriteSuggestion | undefined {
  const { context, call } = site;
  const write = typeormWrite(site);
  const { sourceCode } = context;
  const names = pickNames(sourceCode, site.loop.hoistBefore, 'rows');
  if (write === undefined || names === undefined) {
    return undefined;
  }
  const iterable = sourceCode.getText(site.loop.iterable);
  const item = site.loop.item.name;
  const key = sourceCode.getText(write.keyExpression);
  const direct = key === item;
  const block = chunkedLoop(site, {
    source: direct ? iterable : names.keys,
    size: CHUNK,
    prelude: direct ? [] : [`const ${names.keys} = ${iterable}.map((${item}) => ${key});`],
    statement: (part) => `await ${write.callText(part)};`,
  });
  const imported = importingName(sourceCode, sourceCode.ast, {
    sources: [site.orm.pkg],
    name: 'In',
    sites: [call],
  });
  if (block === undefined || imported === undefined) {
    return undefined;
  }
  const plan = allOf([
    imported.present ? undefined : imported.plan,
    replacing(site.statement.range, block),
  ]);
  return plan === undefined ? undefined : { messageId: 'batchWrite', plan };
}

export function writeSuggestion(
  context: Context,
  call: TSESTree.CallExpression,
  found: { readonly orm: OrmCall; readonly loop: LoopCall },
): WriteSuggestion | undefined {
  const site = siteOf(context, call, found);
  return site === undefined ? undefined : (keyedSuggestion(site) ?? insertSuggestion(site));
}
