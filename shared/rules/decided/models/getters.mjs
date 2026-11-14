const LABEL = /^(?<owner>[\w$]+)\.(?<name>[\w$]+)\(/u;

function returnedField(tree) {
  const body = tree.children[2];
  const [only, ...rest] = body?.kind === 'block' ? body.children : [];
  const value = only?.kind === 'return' ? only.children[0] : undefined;
  const isField =
    (value?.kind === 'name' && value.binding === 'free') ||
    (value?.kind === 'member' && value.children[0].kind === 'this');
  return rest.length === 0 && isField;
}

/**
 * The same-file getters that cannot be overridden and only return a field, as
 * `file|Owner#name`.
 */
export function getterTable(units) {
  const getters = new Set();
  for (const unit of units) {
    const groups = LABEL.exec(unit.name)?.groups;
    const isGetter =
      groups !== undefined &&
      unit.final === true &&
      unit.tree?.kind === 'function' &&
      unit.tree.children[1].children.length === 0 &&
      returnedField(unit.tree);
    if (isGetter) {
      getters.add(`${unit.file}|${groups.owner}#${groups.name}`);
    }
  }
  return getters;
}

export function gettersOfFile(table, file) {
  const prefix = `${file}|`;
  return new Set(
    [...table]
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length)),
  );
}
