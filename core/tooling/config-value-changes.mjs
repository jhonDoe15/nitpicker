export function shownValue(value) {
  return value === undefined ? 'not set' : JSON.stringify(value);
}

export function addedEntries(base = [], head = []) {
  return head.some((entry) => !base.includes(entry));
}
