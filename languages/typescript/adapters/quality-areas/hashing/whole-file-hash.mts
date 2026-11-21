import path from 'node:path';
import { hash } from '../../../../../shared/rules/finding-parts.mts';
import { scriptStem as untypedScriptStem } from '../../../../../shared/paths/script-stem.mts';

const scriptStem: (file: string) => string = untypedScriptStem;

const MODULE_SPECIFIER =
  /(\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)(['"`])(\.{1,2}(?:\/[^'"`\r\n]*)?)\2/gu;

function stemmed(
  directory: string,
  [lead = '', quote = '', specifier = '']: readonly string[],
): string {
  const resolved = path.posix.normalize(path.posix.join(directory, specifier));
  return `${lead}${quote}${scriptStem(resolved)}${quote}`;
}

export function withoutRelativeSpecifiers(text: string, filePath: string): string {
  const directory = path.posix.dirname(filePath);
  return text.replace(MODULE_SPECIFIER, (_match, ...captures: string[]) =>
    stemmed(directory, captures),
  );
}

export function wholeFileHash(text: string, filePath: string): string {
  return hash(withoutRelativeSpecifiers(text, filePath));
}
