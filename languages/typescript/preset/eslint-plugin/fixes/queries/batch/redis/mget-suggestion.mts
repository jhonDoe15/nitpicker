import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { typeServices, type Context } from '../../../../rules/security/security-values.mts';
import { ts } from '../../../../rules/typed/typescript-views.mts';
import { allOf, type FixPlans } from '../../../edits/plans.mts';
import { freeName } from '../../../edits/names.mts';
import { hasCommentIn, inserting, replacing } from '../../../support/ranges.mts';
import { isInvariant } from '../../loops/invariants.mts';
import { isAlwaysReached } from '../../loops/loop-effects.mts';
import { resultDeclarator, type LoopCall } from '../../loops/loop-call.mts';
import type { OrmCall } from '../../orm/orm-call.mts';
import { CHUNK, indentOf, isTypeScriptFile, printedType } from '../text.mts';

export type MgetSuggestion = {
  readonly messageId: 'batchMget';
  readonly plan: FixPlans;
};

type Site = {
  readonly context: Context;
  readonly call: TSESTree.CallExpression;
  readonly loop: LoopCall;
  readonly orm: OrmCall;
  readonly declarator: TSESTree.VariableDeclarator;
  readonly key: TSESTree.Expression;
};

type Names = {
  readonly map: string;
  readonly keys: string;
  readonly index: string;
  readonly part: string;
  readonly values: string;
  readonly offset: string;
  readonly key: string;
};

function isStringKey(context: Context, key: TSESTree.Node): boolean {
  const type = typeServices(context)?.getTypeAtLocation(key);
  if (type === undefined) {
    return false;
  }
  const members = type.isUnion() ? type.types : [type];
  return members.every((member) => (member.flags & ts.TypeFlags.StringLike) !== 0);
}

function keyOf(
  context: Context,
  call: TSESTree.CallExpression,
  loop: LoopCall,
): TSESTree.Expression | undefined {
  const [key] = call.arguments;
  if (
    call.arguments.length !== 1 ||
    key === undefined ||
    key.type === AST_NODE_TYPES.SpreadElement
  ) {
    return undefined;
  }
  const repeated = { range: loop.range, body: loop.body, target: call };
  const stable = isInvariant(context.sourceCode, key, repeated, loop.item.name);
  return stable && isAlwaysReached(context, loop) && isStringKey(context, key) ? key : undefined;
}

function valueType(site: Site): string | undefined {
  const services = typeServices(site.context);
  const node = services?.esTreeNodeToTSNodeMap.get(site.declarator.id);
  if (services === undefined || node === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  return printedType(checker, checker.getTypeAtLocation(node), node);
}

function blockLines(site: Site, names: Names): string[] {
  const { sourceCode, filename } = site.context;
  const method = site.orm.orm === 'ioredis' ? 'mget' : 'mGet';
  const iterable = sourceCode.getText(site.loop.iterable);
  const item = site.loop.item.name;
  const key = sourceCode.getText(site.key);
  const direct = key === item;
  const typed = isTypeScriptFile(filename) ? valueType(site) : undefined;
  const generic = typed === undefined ? '' : `<string, ${typed}>`;
  const { map, keys, index, part, values, offset, key: keyName } = names;
  const step = String(CHUNK);
  return [
    ...(direct ? [] : [`const ${keys} = ${iterable}.map((${item}) => ${key});`]),
    `const ${map} = new Map${generic}();`,
    `for (let ${index} = 0; ${index} < ${direct ? iterable : keys}.length; ${index} += ${step}) {`,
    `  const ${part} = ${direct ? iterable : keys}.slice(${index}, ${index} + ${step});`,
    `  const ${values} = await ${sourceCode.getText(site.orm.receiver)}.${method}(${part});`,
    `  for (const [${offset}, ${keyName}] of ${part}.entries()) {`,
    `    ${map}.set(${keyName}, ${values}[${offset}] ?? null);`,
    '  }',
    '}',
  ];
}

function freeNames(site: Site, mapBase: string): Names | undefined {
  const { sourceCode } = site.context;
  const at = site.loop.hoistBefore;
  const [map, keys, index, part, values, offset, key] = [
    mapBase,
    'keys',
    'index',
    'part',
    'values',
    'offset',
    'key',
  ].map((base) => freeName(sourceCode, { sites: [at], within: at, base }));
  if (
    map === undefined ||
    keys === undefined ||
    index === undefined ||
    part === undefined ||
    values === undefined ||
    offset === undefined ||
    key === undefined
  ) {
    return undefined;
  }
  return { map, keys, index, part, values, offset, key };
}

export function mgetSuggestion(
  context: Context,
  call: TSESTree.CallExpression,
  { orm, loop }: { readonly orm: OrmCall; readonly loop: LoopCall },
): MgetSuggestion | undefined {
  const declarator = resultDeclarator(loop, call);
  const key = keyOf(context, call, loop);
  const repeated = { range: loop.range, body: loop.body, target: call };
  const awaited = declarator?.init;
  if (
    orm.method !== 'get' ||
    declarator === undefined ||
    key === undefined ||
    awaited === null ||
    awaited === undefined ||
    !isInvariant(context.sourceCode, orm.receiver, repeated) ||
    hasCommentIn(context.sourceCode, awaited.range)
  ) {
    return undefined;
  }
  const site: Site = { context, call, loop, orm, declarator, key };
  const base = declarator.id.type === AST_NODE_TYPES.Identifier ? declarator.id.name : 'value';
  const names = freeNames(site, `${base}ByKey`);
  if (names === undefined) {
    return undefined;
  }
  const indent = indentOf(context.sourceCode, loop.hoistBefore);
  const block = `${blockLines(site, names).join(`\n${indent}`)}\n${indent}`;
  const plan = allOf([
    inserting(loop.hoistBefore.range[0], block),
    replacing(awaited.range, `${names.map}.get(${context.sourceCode.getText(key)}) ?? null`),
  ]);
  return plan === undefined ? undefined : { messageId: 'batchMget', plan };
}
