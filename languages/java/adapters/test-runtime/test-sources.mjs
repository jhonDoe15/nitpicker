const OUT_OF_SCOPE_FOLDERS = new Set([
  'e2e',
  'end_to_end',
  'endtoend',
  'contract',
  'contracts',
  'e2etest',
  'endtoendtest',
  'contracttest',
]);

function escaped(name) {
  return name.replaceAll('$', String.raw`\$`);
}

export function isAbstract(text, simple, { kotlinOpen = false } = {}) {
  const name = escaped(simple);
  const modifiers = kotlinOpen ? 'abstract|open|sealed' : 'abstract';
  return new RegExp(
    String.raw`\b(?:(?:${modifiers})\s+(?:\w+\s+)*class|interface|@interface)\s+${name}\b`,
    'u',
  ).test(text);
}

export function isEndToEndPath(file) {
  return file
    .split('/')
    .slice(0, -1)
    .some((segment) => OUT_OF_SCOPE_FOLDERS.has(segment.toLowerCase()));
}
