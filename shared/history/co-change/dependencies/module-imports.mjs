import path from 'node:path';

export const MODULE_IMPORTS = 'moduleImports';

function folderOf(file) {
  const folder = path.posix.dirname(file);
  return folder === '.' ? undefined : folder;
}

function compareImports(left, right) {
  return left.from.localeCompare(right.from) || left.to.localeCompare(right.to);
}

export function folderImports(imports) {
  const importers = new Map();
  for (const { from, to } of imports) {
    const source = folderOf(from);
    const target = folderOf(to);
    if (source !== undefined && target !== undefined && source !== target) {
      const key = `${source}\0${target}`;
      const files = importers.get(key) ?? new Set();
      files.add(from);
      importers.set(key, files);
    }
  }
  return [...importers]
    .map(([key, files]) => {
      const [from, to] = key.split('\0');
      return { from, to, files: files.size };
    })
    .sort(compareImports);
}

export function moduleImportsSection(imports, history) {
  return imports !== undefined && history?.coChange === true
    ? { [MODULE_IMPORTS]: folderImports(imports) }
    : {};
}
