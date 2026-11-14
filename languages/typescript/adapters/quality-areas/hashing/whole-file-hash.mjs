import path from 'node:path';
import { hash } from '../../../../../shared/rules/finding-helpers.mjs';
import { scriptStem } from '../../../../../shared/paths/script-stem.mjs';

const MODULE_SPECIFIER =
  /(\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)(['"`])(\.{1,2}(?:\/[^'"`\r\n]*)?)\2/gu;

export function withoutRelativeSpecifiers(text, filePath) {
  const directory = path.posix.dirname(filePath);
  return text.replace(MODULE_SPECIFIER, (...match) => {
    const [, lead, quote, specifier] = match;
    const resolved = path.posix.normalize(path.posix.join(directory, specifier));
    return `${lead}${quote}${scriptStem(resolved)}${quote}`;
  });
}

export function wholeFileHash(text, filePath) {
  return hash(withoutRelativeSpecifiers(text, filePath));
}
