import type { ConfigEntry, ProfiledDocument } from '../typed/config-types.mts';

const TRUE_SPELLINGS = new Set(['true', 'on', 'yes', '1']);

export function isTest(document: Pick<ProfiledDocument, 'testOnly'>): boolean {
  return document.testOnly;
}

export function isTestOrLocal(document: Pick<ProfiledDocument, 'testOrLocalOnly'>): boolean {
  return document.testOrLocalOnly;
}

export function isTrue(entry: Pick<ConfigEntry, 'value'>): boolean {
  return TRUE_SPELLINGS.has(entry.value.toLowerCase());
}

export function isPlaceholder(entry: Pick<ConfigEntry, 'value'>): boolean {
  return entry.value.startsWith('${');
}
