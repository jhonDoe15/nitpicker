import { JAVA_CONVENTIONS } from '../../languages/java/conventions/java-conventions.mjs';
import { FILE_NAME_CONVENTION } from '../../languages/typescript/conventions/file-name-casing.mjs';
import { PRETTIER_CONVENTIONS } from '../../languages/typescript/conventions/prettier-conventions.mjs';
import { TYPE_IMPORT_CONVENTION } from '../../languages/typescript/conventions/type-import-style.mjs';

const TYPESCRIPT_CONVENTIONS = [
  ...PRETTIER_CONVENTIONS,
  TYPE_IMPORT_CONVENTION,
  FILE_NAME_CONVENTION,
];

const BY_PRESET = new Map([
  ['typescript', TYPESCRIPT_CONVENTIONS],
  ['javascript', TYPESCRIPT_CONVENTIONS],
  ['java', JAVA_CONVENTIONS],
  ['kotlin', JAVA_CONVENTIONS],
]);

export function conventionDefinitions(preset = 'typescript') {
  return BY_PRESET.get(preset) ?? [];
}
