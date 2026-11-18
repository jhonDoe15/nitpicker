export function appendAll(target, items) {
  for (const item of items) {
    target.push(item);
  }
  return target;
}

export function largest(values) {
  let found = -Infinity;
  for (const value of values) {
    found = Math.max(found, value);
  }
  return found;
}

export function smallest(values) {
  let found = Infinity;
  for (const value of values) {
    found = Math.min(found, value);
  }
  return found;
}
