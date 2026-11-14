import { createRequire } from 'node:module';

const load = createRequire(import.meta.url);

export function yamlDocuments(text) {
  return load('yaml')
    .parseAllDocuments(text)
    .filter((document) => document.errors.length === 0)
    .map((document) => document.toJS());
}

export function parseYaml(text) {
  return load('yaml').parse(text);
}
