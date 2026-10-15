const LOCAL_PROFILES = new Set(['local', 'dev', 'development']);
const TEST_PROFILES = new Set(['it', 'integration-test']);
const TRUE_SPELLINGS = new Set(['true', 'on', 'yes', '1']);

function isTestProfile(profile) {
  return profile.startsWith('test') || TEST_PROFILES.has(profile);
}

function isLocalProfile(profile) {
  return LOCAL_PROFILES.has(profile);
}

function exemptWhenEvery(matches) {
  return (document) =>
    !document.negated && document.profiles.length > 0 && document.profiles.every(matches);
}

export const isTest = exemptWhenEvery(isTestProfile);
export const isTestOrLocal = exemptWhenEvery(
  (profile) => isTestProfile(profile) || isLocalProfile(profile),
);

export function isTrue(entry) {
  return TRUE_SPELLINGS.has(entry.value.toLowerCase());
}

export function isPlaceholder(entry) {
  return entry.value.startsWith('${');
}
