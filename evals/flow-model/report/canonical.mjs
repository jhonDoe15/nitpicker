import { createHash } from 'node:crypto';

function sorted(value) {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, sorted(value[key])]),
  );
}

export function canonicalJson(value, indent) {
  return JSON.stringify(sorted(value), null, indent);
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function isLocation(key) {
  return key === 'loc' || key.endsWith('Loc');
}

export function withoutLocations(value) {
  if (Array.isArray(value)) {
    return value.map(withoutLocations);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const entries = Object.entries(value).filter(([key]) => !isLocation(key));
  return Object.fromEntries(entries.map(([key, child]) => [key, withoutLocations(child)]));
}

export function nodesOf(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      nodesOf(item, found);
    }
    return found;
  }
  if (value === null || typeof value !== 'object') {
    return found;
  }
  if (typeof value.kind === 'string') {
    found.push(value);
  }
  for (const [, child] of Object.entries(value).filter(([key]) => !isLocation(key))) {
    nodesOf(child, found);
  }
  return found;
}
