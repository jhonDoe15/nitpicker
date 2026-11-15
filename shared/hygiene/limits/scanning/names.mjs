const PREFIXES = 'create|update|new|patch|edit|add';
const SUFFIXES =
  'dto|request|response|input|form|payload|fields|body|schema|entity|model|create|update|patch|read|public';
const AFFIXES = new RegExp(`^(?:${PREFIXES})|(?:${SUFFIXES})$`, 'u');
const MIN_NAME = 3;

export function fieldKey(name) {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');
}

function stripPlural(name) {
  return name.endsWith('s') && !name.endsWith('ss') && name.length > MIN_NAME
    ? name.slice(0, -1)
    : name;
}

function stripAffixes(name) {
  const stripped = name.replace(AFFIXES, '');
  return stripped.length < MIN_NAME ? name : stripped;
}

export function entityKey(name) {
  return stripPlural(stripAffixes(stripAffixes(stripAffixes(fieldKey(name)))));
}

export function entityKeys(...names) {
  return [...new Set(names.filter((name) => name !== undefined && name !== '').map(entityKey))];
}
