import { JAVA_CONVENTIONS } from '../../languages/java/conventions/java-conventions.mjs';
import {
  JAVASCRIPT_CONVENTIONS,
  TYPESCRIPT_CONVENTIONS,
} from '../../languages/typescript/conventions/typescript-conventions.mjs';

const BY_PRESET = new Map([
  ['typescript', TYPESCRIPT_CONVENTIONS],
  ['javascript', JAVASCRIPT_CONVENTIONS],
  ['java', JAVA_CONVENTIONS],
  ['kotlin', JAVA_CONVENTIONS],
]);

export function conventionDefinitions(preset = 'typescript') {
  return BY_PRESET.get(preset) ?? [];
}
