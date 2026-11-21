const CAMEL_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/u;

function sentence(words: string): string {
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function wordsOfCamelCase(name: string): string {
  return sentence(name.split(CAMEL_BOUNDARY).join(' ').toLowerCase());
}

export function wordsOfConstant(name: string): string {
  return sentence(name.replaceAll('_', ' ').toLowerCase());
}

export function wordsOfKebab(name: string): string {
  return sentence(name.replaceAll('-', ' '));
}
