export function appendAll(target, items) {
  for (const item of items) {
    target.push(item);
  }
  return target;
}

export function addToGroup(groups, key, value) {
  const members = groups.get(key);
  if (members === undefined) {
    groups.set(key, [value]);
  } else {
    members.push(value);
  }
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

export function sharedPrefixLength(left, right) {
  const differing = left.findIndex((item, index) => item !== right[index]);
  return differing === -1 ? left.length : differing;
}

export function cumulativeJoins(text, separator) {
  const parts = text.split(separator);
  return parts.map((_, index) => parts.slice(0, index + 1).join(separator));
}
