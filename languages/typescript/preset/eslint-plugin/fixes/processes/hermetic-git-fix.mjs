import { addingProperty, isPlainObject, keyName } from '../support/objects.mjs';

const HERMETIC_VALUES = [
  ['GIT_CONFIG_GLOBAL', "'/dev/null'"],
  ['GIT_CONFIG_NOSYSTEM', "'1'"],
];

function assignments(keys) {
  return HERMETIC_VALUES.filter(([key]) => !keys.has(key)).map(
    ([key, value]) => `${key}: ${value}`,
  );
}

export function hermeticFix(sourceCode, options) {
  if (!isPlainObject(options)) {
    return undefined;
  }
  const environment = options.properties.find((property) => keyName(property) === 'env');
  if (environment === undefined) {
    const text = ['...process.env', ...assignments(new Set())].join(', ');
    return addingProperty(sourceCode, options, `env: { ${text} }`);
  }
  const value = environment.value;
  if (!isPlainObject(value, { allowSpread: true })) {
    return undefined;
  }
  const keys = new Set(value.properties.map(keyName));
  const missing = assignments(keys);
  return missing.length === 0 ? undefined : addingProperty(sourceCode, value, missing.join(', '));
}
