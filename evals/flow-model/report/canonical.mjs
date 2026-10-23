import { createHash } from 'node:crypto';
import { depthFirst } from '../../../shared/traversal.mjs';

export function isRecord(value) {
  return typeof value === 'object' && Boolean(value) && !Array.isArray(value);
}

function sortedKeys(_key, value) {
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]]),
  );
}

export function canonicalJson(value, indent) {
  return JSON.stringify(value, sortedKeys, indent);
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function isLocation(key) {
  return key === 'loc' || key.endsWith('Loc');
}

function locationsDropped(key, value) {
  return isLocation(key) ? undefined : value;
}

export function withoutLocations(value) {
  return JSON.parse(JSON.stringify(value, locationsDropped));
}

function structuralChildren(value) {
  const items = Array.isArray(value)
    ? value
    : Object.entries(value)
        .filter(([key]) => !isLocation(key))
        .map(([, child]) => child);
  return items.filter((item) => typeof item === 'object' && Boolean(item));
}

export function nodesOf(value) {
  return [...depthFirst(value, structuralChildren)].filter(
    (node) => isRecord(node) && typeof node.kind === 'string',
  );
}
