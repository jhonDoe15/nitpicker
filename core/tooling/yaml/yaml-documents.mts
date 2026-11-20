import { createRequire } from 'node:module';
import { fieldOf, listOf } from '../../../shared/values/readers.mts';

const load = createRequire(import.meta.url);

function callMethod(target: unknown, name: string, ...args: unknown[]): unknown {
  const method = fieldOf(target, name);
  if (typeof method !== 'function') {
    throw new TypeError(`yaml has no ${name}`);
  }
  const result: unknown = Reflect.apply(method, target, args);
  return result;
}

function yamlModule(): unknown {
  const yaml: unknown = load('yaml');
  return yaml;
}

export function yamlDocuments(text: string): unknown[] {
  return listOf(callMethod(yamlModule(), 'parseAllDocuments', text))
    .filter((document) => listOf(fieldOf(document, 'errors')).length === 0)
    .map((document) => callMethod(document, 'toJS'));
}

export function parseYaml(text: string): unknown {
  return callMethod(yamlModule(), 'parse', text);
}
