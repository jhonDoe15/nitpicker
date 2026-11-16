import path from 'node:path';

export const MODULE_IMPORTS = 'moduleImports';

function folderOf(file) {
  const folder = path.posix.dirname(file);
  return folder === '.' ? undefined : folder;
}

function targetOf(entry) {
  return entry.to ?? `package:${entry.package}`;
}

function compareImports(left, right) {
  return left.from.localeCompare(right.from) || targetOf(left).localeCompare(targetOf(right));
}

function folderImport({ from, to, package: unresolved }) {
  const source = folderOf(from);
  if (source === undefined) {
    return undefined;
  }
  if (unresolved !== undefined) {
    return { from, package: unresolved };
  }
  const target = folderOf(to);
  return target === undefined || target === source ? undefined : { from, to: target };
}

export function folderImports(imports) {
  const pairs = new Map();
  for (const entry of imports) {
    const folded = folderImport(entry);
    if (folded !== undefined) {
      pairs.set(`${folded.from}\0${targetOf(folded)}`, folded);
    }
  }
  return [...pairs.values()].sort(compareImports);
}

export function wantsModuleImports(history) {
  return history?.coChange === true;
}

export function moduleImportsSection(imports, history) {
  return imports !== undefined && wantsModuleImports(history)
    ? { [MODULE_IMPORTS]: folderImports(imports) }
    : {};
}
