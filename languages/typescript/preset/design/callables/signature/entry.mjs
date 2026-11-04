import { ts } from '../../../../typescript-api/typescript-api.mjs';

const OBJECT_MEMBERS = new Set(['toString', 'toJSON', 'valueOf', 'equals']);

function hasDecorators(node) {
  return ts.canHaveDecorators(node) && (ts.getDecorators(node) ?? []).length > 0;
}

function inheritsMember({ checker }, site) {
  const clauses = site.classEntry.node.heritageClauses ?? [];
  return clauses
    .flatMap(({ types }) => types)
    .some((type) => checker.getTypeAtLocation(type).getProperty(site.name) !== undefined);
}

function isLanguageHook(site) {
  return site.name.startsWith('[Symbol.');
}

function isMemberEntry(state, site) {
  const { member } = site;
  if (ts.getEffectiveModifierFlags(member) & ts.ModifierFlags.Override) {
    return true;
  }
  if (hasDecorators(member) || isLanguageHook(site)) {
    return true;
  }
  if (ts.isConstructorDeclaration(member)) {
    return hasDecorators(site.classEntry.node);
  }
  return !site.isStatic && !OBJECT_MEMBERS.has(site.name) && inheritsMember(state, site);
}

function isDefaultExport(declaration) {
  return (
    ts.isExportAssignment(declaration) ||
    (ts.getEffectiveModifierFlags(declaration) & ts.ModifierFlags.Default) !== 0
  );
}

function isFrameworkDefault(state, site) {
  return (
    isDefaultExport(site.declaration) &&
    state.frameworkDefaults.some((matcher) => matcher.test(site.file.path))
  );
}

export function isEntry(state, site) {
  if (site.callback === true) {
    return true;
  }
  if (site.member !== undefined) {
    return isMemberEntry(state, site);
  }
  return site.name === 'main' || isFrameworkDefault(state, site);
}
