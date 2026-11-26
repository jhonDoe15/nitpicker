type Form = { targetUID?: string; name: string };
type Wide = { [key: string]: number | undefined };
type Open = { [key: string]: string };

export function absent(data: Form) {
  return 'targetUID' in data ? 1 : 2;
}

export function guarded(data: Form) {
  if ('targetUID' in data && data.targetUID !== undefined) {
    return 1;
  }
  return 2;
}

export function required(data: Form) {
  return 'name' in data ? 1 : 2;
}

export function viaWide(data: Wide) {
  return 'x' in data ? 1 : 2;
}

export function viaOpen(data: Open) {
  return 'x' in data ? 1 : 2;
}

export function unionCase(data: Form | { targetUID: string }) {
  if (!('targetUID' in data)) {
    return 0;
  }
  return 1;
}

export function throwing(data: Form) {
  if (!('targetUID' in data)) {
    throw new Error('missing');
  }
  return data.targetUID;
}

export function validated(data: Form) {
  if ('targetUID' in data) {
    const uid = data.targetUID;
    if (!uid) {
      return 0;
    }
  }
  return 1;
}

export function chained(data?: Form | null) {
  return data && 'targetUID' in data ? data.targetUID : undefined;
}

export function filtered(items: Form[]) {
  return items.filter((item) => 'targetUID' in item);
}

export function asBoolean(data: Form) {
  return Boolean('targetUID' in data);
}

export function generic<T extends Form>(data: T) {
  return !('targetUID' in data);
}

export function fallback(data: Form) {
  return 'targetUID' in data ? undefined : 1;
}

export function nested(data: { inner?: Form }) {
  if ('targetUID' in data.inner!) {
    return 1;
  }
  return 2;
}
