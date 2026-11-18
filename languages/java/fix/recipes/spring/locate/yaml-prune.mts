import { lineAt } from './lines.mts';
import type { LineTable } from './locate-types.mts';
import { indentOf, parentLine } from './yaml-locate.mts';
import { largest } from '../../../../../../shared/lists/lists.mts';

function subtree(table: LineTable, index: number): number[] {
  const { indent } = indentOf(lineAt(table, index));
  const found: number[] = [];
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

function emptied<T>(
  table: LineTable,
  index: number,
  deleted: ReadonlyMap<number, T>,
): { readonly parent: number; readonly owner: T } | undefined {
  const parent = parentLine(table, index);
  if (parent === undefined || deleted.has(parent) || !indentOf(lineAt(table, parent)).bare) {
    return undefined;
  }
  const children = subtree(table, parent);
  const owner = deleted.get(largest(children));
  return owner !== undefined && children.every((child) => deleted.has(child))
    ? { parent, owner }
    : undefined;
}

export function withEmptiedParents<T>(
  table: LineTable,
  removed: ReadonlyMap<number, T>,
): Map<number, T> {
  const deleted = new Map(removed);
  for (const index of deleted.keys()) {
    const found = emptied(table, index, deleted);
    if (found !== undefined) {
      deleted.set(found.parent, found.owner);
    }
  }
  return deleted;
}
