const PREFIXES = 'create|update|new|patch|edit|add';
const SUFFIXES =
  'dto|request|response|input|form|payload|fields|body|schema|entity|model|create|update|patch|read|public';
const AFFIXES = new RegExp(`^(?:${PREFIXES})|(?:${SUFFIXES})$`, 'u');
const MIN_NAME = 3;

export function fieldKey(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');
}

function stripPlural(name: string): string {
  return name.endsWith('s') && !name.endsWith('ss') && name.length > MIN_NAME
    ? name.slice(0, -1)
    : name;
}

function stripAffixes(name: string): string {
  const stripped = name.replace(AFFIXES, '');
  return stripped.length < MIN_NAME ? name : stripped;
}

export function entityKey(name: string): string {
  return stripPlural(stripAffixes(stripAffixes(stripAffixes(fieldKey(name)))));
}

export function entityKeys(...names: readonly (string | undefined)[]): string[] {
  return [
    ...new Set(
      names.filter((name): name is string => name !== undefined && name !== '').map(entityKey),
    ),
  ];
}
