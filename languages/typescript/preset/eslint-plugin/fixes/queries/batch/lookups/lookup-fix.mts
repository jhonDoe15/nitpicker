import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { allOf, type FixPlans } from '../../../edits/plans.mts';
import { importingName } from '../../../edits/imports.mts';
import { hasCommentIn, inserting, replacing, type FixPlan } from '../../../support/ranges.mts';
import { CHUNK, indentOf, isTypeScriptFile, pickNames, pluralOf, type Names } from '../text.mts';
import type { Lookup, Site } from './lookup-plan.mts';

function mapType(site: Site, lookup: Lookup): string {
  const typed = isTypeScriptFile(site.context.filename) && lookup.valueType !== undefined;
  return typed ? `<${lookup.keyType}, ${lookup.valueType}>` : '';
}

function keysLines(site: Site, lookup: Lookup, names: Names): { list: string; lines: string[] } {
  const { sourceCode } = site.context;
  const iterable = sourceCode.getText(site.loop.iterable);
  const item = site.loop.item.name;
  const identity = lookup.keyExpression.type === AST_NODE_TYPES.Identifier;
  const key = sourceCode.getText(lookup.keyExpression);
  const mapped = identity ? iterable : `${iterable}.map((${item}) => ${key})`;
  if (lookup.kind === 'row') {
    return identity
      ? { list: iterable, lines: [] }
      : { list: names.keys, lines: [`const ${names.keys} = ${mapped};`] };
  }
  return {
    list: names.keys,
    lines: [`const ${names.keys} = Array.from(new Set(${mapped}));`],
  };
}

function collectLines(lookup: Lookup, names: Names): string[] {
  const { row, group, map } = names;
  const at = `${row}.${lookup.keyName}`;
  if (lookup.kind === 'row') {
    return [`${map}.set(${at}, ${row});`];
  }
  return [
    `const ${group} = ${map}.get(${at});`,
    `if (${group} === undefined) {`,
    `  ${map}.set(${at}, [${row}]);`,
    '} else {',
    `  ${group}.push(${row});`,
    '}',
  ];
}

function blockLines(site: Site, lookup: Lookup, names: Names): string[] {
  const { list, lines } = keysLines(site, lookup, names);
  const { map, index, part, row } = names;
  return [
    ...lines,
    `const ${map} = new Map${mapType(site, lookup)}();`,
    `for (let ${index} = 0; ${index} < ${list}.length; ${index} += ${String(CHUNK)}) {`,
    `  const ${part} = ${list}.slice(${index}, ${index} + ${String(CHUNK)});`,
    `  for (const ${row} of await ${lookup.callText(part)}) {`,
    ...collectLines(lookup, names).map((line) => `    ${line}`),
    '  }',
    '}',
  ];
}

function importPlan(site: Site): { readonly plan: FixPlan | undefined } | undefined {
  if (site.orm.orm !== 'typeorm') {
    return { plan: undefined };
  }
  const { sourceCode } = site.context;
  const edit = importingName(sourceCode, sourceCode.ast, {
    sources: [site.orm.pkg],
    name: 'In',
    sites: [site.call],
  });
  if (edit === undefined) {
    return undefined;
  }
  return { plan: edit.present ? undefined : edit.plan };
}

export function lookupFix(site: Site, lookup: Lookup): FixPlans | undefined {
  const { sourceCode } = site.context;
  const awaited = site.declarator.init;
  const base = site.declarator.id.type === AST_NODE_TYPES.Identifier ? site.declarator.id.name : '';
  const column = `${lookup.keyName.charAt(0).toUpperCase()}${lookup.keyName.slice(1)}`;
  const names = pickNames(sourceCode, site.loop.hoistBefore, `${pluralOf(base)}By${column}`);
  const imported = importPlan(site);
  if (
    awaited === null ||
    names === undefined ||
    imported === undefined ||
    hasCommentIn(sourceCode, awaited.range)
  ) {
    return undefined;
  }
  const indent = indentOf(sourceCode, site.loop.hoistBefore);
  const block = `${blockLines(site, lookup, names).join(`\n${indent}`)}\n${indent}`;
  const fallback = lookup.kind === 'row' ? 'null' : '[]';
  const key = sourceCode.getText(lookup.keyExpression);
  return allOf(
    [
      imported.plan,
      inserting(site.loop.hoistBefore.range[0], block),
      replacing(awaited.range, `${names.map}.get(${key}) ?? ${fallback}`),
    ].filter((plan) => plan !== undefined),
  );
}
