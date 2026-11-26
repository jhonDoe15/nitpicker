const cache = new Map<string, number>();
const names = new Map<string, string>();
const flags = new WeakMap<object, boolean>();
const lists: ReadonlyMap<string, string[]> = new Map();

export function emptyZero(key: string) {
  let value = cache.get(key);
  if (!value) {
    value = 0;
    cache.set(key, value);
  }
  return value;
}

export function undefinedTest(map: Map<string, number | undefined>, key: string) {
  let value = map.get(key);
  if (value === undefined) {
    value = undefined;
    map.set(key, value);
  }
  return value;
}

export function nonEmptyText(key: string) {
  let value = names.get(key);
  if (!value) {
    value = `synth_${key}`;
    names.set(key, value);
  }
  return value;
}

export function emptyText(key: string) {
  const value = names.get(key);
  if (!value) {
    names.set(key, key.trim());
  }
  return value;
}

export function fallbackOr(key: string) {
  const value = cache.get(key) || 5;
  cache.set(key, value - 5);
  return value;
}

export function fallbackNullish(map: Map<string, number | null>, key: string) {
  const value = map.get(key) ?? 7;
  map.set(key, value);
  return value;
}

export function fallbackNone(key: string) {
  const value = cache.get(key) || 0;
  cache.set(key, value + 1);
  return value;
}

export function early(key: string) {
  if (cache.get(key)) {
    return 1;
  }
  cache.set(key, 0);
  return 2;
}

export function negated(key: string) {
  const hit = cache.get(key);
  if (hit == null) {
    cache.set(key, 0);
  }
  return hit;
}

export function weak(key: object) {
  return flags.get(key) ? 1 : (flags.set(key, false), 2);
}

export function readonly(key: string) {
  const list = lists.get(key);
  if (!list) {
    return [];
  }
  return list;
}

export function optional(map: Map<string, number> | undefined, key: string) {
  const value = map?.get(key);
  if (!value) {
    map!.set(key, 0);
  }
  return value;
}

export function records(record: Record<string, unknown>, key: string) {
  return record[key] === undefined ? 1 : 2;
}

export function recordsChecked(record: Record<string, unknown>, key: string) {
  if (key in record && record[key] !== undefined) {
    return 1;
  }
  return record[key] !== undefined;
}

export function recordsMissing(record: Record<string, unknown>, key: string) {
  if (record[key] === undefined) {
    throw new Error('x');
  }
  return null;
}

export function recordsReport(record: Record<string, unknown>, key: string) {
  if (record[key] === undefined) {
    return `Missing ${key}`;
  }
  return 1;
}

export function recordsValue(record: Record<string, unknown>, key: string) {
  const value = record[key] !== undefined;
  return value;
}

export function recordsLiteral(record: Record<string, unknown>) {
  return record.name !== undefined && record['id'] !== undefined;
}
