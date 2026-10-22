const TRUE_SPELLINGS = new Set(['true', 'on', 'yes', '1']);

export function isTest(document) {
  return document.testOnly;
}

export function isTestOrLocal(document) {
  return document.testOrLocalOnly;
}

export function isTrue(entry) {
  return TRUE_SPELLINGS.has(entry.value.toLowerCase());
}

export function isPlaceholder(entry) {
  return entry.value.startsWith('${');
}
