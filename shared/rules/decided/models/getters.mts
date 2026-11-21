import { present } from '../../../near-duplicates/tree/nodes.mts';
import type { DecidedUnit, FlowNode } from '../typed/decided-types.mts';

const LABEL = /^(?<owner>[\w$]+)\.(?<name>[\w$]+)\(/u;

function returnedField(tree: FlowNode): boolean {
  const body = tree.children[2];
  const [only, ...rest] = body?.kind === 'block' ? body.children : [];
  const value = only?.kind === 'return' ? only.children[0] : undefined;
  const isField =
    (value?.kind === 'name' && value.binding === 'free') ||
    (value?.kind === 'member' && value.children[0]?.kind === 'this');
  return rest.length === 0 && isField && value.unstable !== true;
}

export function getterTable(units: readonly DecidedUnit[]): Set<string> {
  const getters = new Set<string>();
  for (const unit of units) {
    const groups = LABEL.exec(unit.name)?.groups;
    const owner = groups?.['owner'];
    const name = groups?.['name'];
    const isGetter =
      owner !== undefined &&
      name !== undefined &&
      unit.final &&
      unit.tree.kind === 'function' &&
      present(unit.tree.children[1]).children.length === 0 &&
      returnedField(unit.tree);
    if (isGetter) {
      getters.add(`${unit.file}|${owner}#${name}`);
    }
  }
  return getters;
}

export function gettersOfFile(table: ReadonlySet<string>, file: string): Set<string> {
  const prefix = `${file}|`;
  return new Set(
    [...table]
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length)),
  );
}
