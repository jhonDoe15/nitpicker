import { parseAllDocuments } from 'yaml';

export function yamlDocuments(text) {
  return parseAllDocuments(text)
    .filter((document) => document.errors.length === 0)
    .map((document) => document.toJS());
}
