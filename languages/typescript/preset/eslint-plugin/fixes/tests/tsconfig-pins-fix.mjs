import { addingProperty, isPlainObject, keyName } from '../support/objects.mjs';

export function pinsFix(sourceCode, compilerOptions) {
  const object = compilerOptions.value;
  if (!isPlainObject(object)) {
    return undefined;
  }
  const keys = new Set(object.properties.map(keyName));
  const missing = [
    ...(keys.has('types') ? [] : ['types: []']),
    ...(keys.has('lib') || keys.has('noLib') ? [] : ["lib: ['ES2022']"]),
  ];
  return missing.length === 0 ? undefined : addingProperty(sourceCode, object, missing.join(', '));
}
