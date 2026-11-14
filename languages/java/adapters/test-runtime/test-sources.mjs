export function isAbstract(text, simple, { kotlinOpen = false } = {}) {
  const name = simple.replaceAll('$', String.raw`\$`);
  const modifiers = kotlinOpen ? 'abstract|open|sealed' : 'abstract';
  return new RegExp(
    String.raw`\b(?:(?:${modifiers})\s+(?:\w+\s+)*class|interface|@interface)\s+${name}\b`,
    'u',
  ).test(text);
}
