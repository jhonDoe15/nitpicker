import { JAVA_CONVENTIONS } from '../../languages/java/conventions/java-conventions.mjs';

const BY_PRESET = new Map([
  ['java', JAVA_CONVENTIONS],
  ['kotlin', JAVA_CONVENTIONS],
]);

export function conventionDefinitions(preset) {
  return BY_PRESET.get(preset) ?? [];
}
