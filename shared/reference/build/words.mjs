const CAMEL_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/u;

function sentence(words) {
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** `UnusedPrivateField` as "Unused private field". */
export function wordsOfCamelCase(name) {
  return sentence(name.split(CAMEL_BOUNDARY).join(' ').toLowerCase());
}

/** `AA_ASSERTION_OF_ARGUMENTS` as "Aa assertion of arguments". */
export function wordsOfConstant(name) {
  return sentence(name.replaceAll('_', ' ').toLowerCase());
}

/** `domain-does-not-import-adapters` as "Domain does not import adapters". */
export function wordsOfKebab(name) {
  return sentence(name.replaceAll('-', ' '));
}
