import type TypeScript from 'typescript';
import { ts } from '../../syntax/typed.mts';
import { heritageClausesOf } from '../../syntax/nodes.mts';
import type { Site, State } from '../../design-types.mts';

const OBJECT_MEMBERS = new Set(['toString', 'toJSON', 'valueOf', 'equals']);

function hasDecorators(node: TypeScript.Node): boolean {
  return ts.canHaveDecorators(node) && (ts.getDecorators(node) ?? []).length > 0;
}

function inheritsMember({ checker }: Pick<State, 'checker'>, site: Site): boolean {
  const clauses = site.classEntry === undefined ? [] : heritageClausesOf(site.classEntry.node);
  return clauses
    .flatMap(({ types }) => types)
    .some((type) => checker.getTypeAtLocation(type).getProperty(site.name) !== undefined);
}

function isLanguageHook(site: Site): boolean {
  return site.name.startsWith('[Symbol.');
}

function isMemberEntry(state: State, site: Site): boolean {
  const { member } = site;
  if (member === undefined) {
    return false;
  }
  if (ts.getEffectiveModifierFlags(member) & ts.ModifierFlags.Override) {
    return true;
  }
  if (hasDecorators(member) || isLanguageHook(site)) {
    return true;
  }
  if (ts.isConstructorDeclaration(member)) {
    return site.classEntry !== undefined && hasDecorators(site.classEntry.node);
  }
  return !site.isStatic && !OBJECT_MEMBERS.has(site.name) && inheritsMember(state, site);
}

function isDefaultExport(declaration: TypeScript.Node): boolean {
  return (
    ts.isExportAssignment(declaration) ||
    (ts.getEffectiveModifierFlags(declaration) & ts.ModifierFlags.Default) !== 0
  );
}

function isFrameworkDefault(state: State, site: Site): boolean {
  return (
    isDefaultExport(site.declaration) &&
    state.frameworkDefaults.some((matcher) => matcher.test(site.file.path))
  );
}

export function isEntry(state: State, site: Site): boolean {
  if (site.callback === true) {
    return true;
  }
  if (site.member !== undefined) {
    return isMemberEntry(state, site);
  }
  return site.name === 'main' || isFrameworkDefault(state, site);
}
