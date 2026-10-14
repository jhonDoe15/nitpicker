const DEAD_CODE_DECLARATIONS = new Map([
  ['exports', 'Export'],
  ['types', 'Exported type'],
]);

export function deadCodeMessage(category, name, entry) {
  if (category === 'files') {
    return `Unused file: ${name}. Nothing imports it: delete it, or import it where it is needed.`;
  }
  const kind = DEAD_CODE_DECLARATIONS.get(category);
  if (kind === undefined) {
    return `${category}: ${name}`;
  }
  return entry?.usedInFile === true
    ? `${kind} ${name} is only used in its own file. Remove \`export\`.`
    : `${kind} ${name} is never imported. Remove \`export\`, or the ${category === 'types' ? 'type' : 'declaration'} if nothing uses it.`;
}
