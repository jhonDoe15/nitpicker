import { indentOf, parentLine } from './yaml-locate.mjs';

function subtree(table, index) {
  const { indent } = indentOf(table[index]);
  const found = [];
  for (const [offset, line] of table.slice(index + 1).entries()) {
    const info = indentOf(line);
    if (info.structural && (info.indent <= indent || /^---/.test(line.text))) {
      break;
    }
    if (info.structural) {
      found.push(index + 1 + offset);
    }
  }
  return found;
}

function emptied(table, index, deleted) {
  const parent = parentLine(table, index);
  if (parent === undefined || deleted.has(parent) || !indentOf(table[parent]).bare) {
    return undefined;
  }
  const children = subtree(table, parent);
  return children.every((child) => deleted.has(child))
    ? { parent, owner: deleted.get(Math.max(...children)) }
    : undefined;
}

export function withEmptiedParents(table, removed) {
  const deleted = new Map(removed);
  for (const index of deleted.keys()) {
    const found = emptied(table, index, deleted);
    if (found !== undefined) {
      deleted.set(found.parent, found.owner);
    }
  }
  return deleted;
}
