import { createHash } from 'node:crypto';
import { fieldsOf } from '../../../scripts/json/fields.mts';
import { depthFirst } from '../model/traversal.mts';
import type { ModelNode } from '../model/syntax-types.mts';

function sortedKeys(_key: string, value: unknown): unknown {
  const fields = fieldsOf(value);
  if (fields === undefined) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(fields)
      .sort()
      .map((key) => [key, fields[key]]),
  );
}

export function canonicalJson(value: unknown, indent?: number): string {
  return JSON.stringify(value, sortedKeys, indent);
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function isLocation(key: string): boolean {
  return key === 'loc' || key.endsWith('Loc');
}

function locationsDropped(key: string, value: unknown): unknown {
  return isLocation(key) ? undefined : value;
}

export function withoutLocations(value: unknown): unknown {
  const stripped: unknown = JSON.parse(JSON.stringify(value, locationsDropped));
  return stripped;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function structuralChildren(value: object): object[] {
  const items: readonly unknown[] = Array.isArray(value)
    ? value
    : Object.entries(value)
        .filter(([key]) => !isLocation(key))
        .map(([, child]) => child);
  return items.filter(isObject);
}

function isModelNode(node: object): node is ModelNode {
  return typeof fieldsOf(node)?.['kind'] === 'string';
}

export function nodesOf(value: object): ModelNode[] {
  return depthFirst<object>(value, structuralChildren).filter(isModelNode);
}
