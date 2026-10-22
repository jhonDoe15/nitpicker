const LOCAL_WORDS = new Set(['local', 'dev', 'development']);
const TEST_WORDS = new Set(['test', 'tests', 'it', 'integration']);
const PRODUCTION_WORDS = new Set([
  'prod',
  'prd',
  'production',
  'live',
  'preprod',
  'staging',
  'stage',
  'stg',
  'uat',
]);
const KNOWN_WORDS = new Set([...LOCAL_WORDS, ...TEST_WORDS, ...PRODUCTION_WORDS, 'non']);
const REGION_LENGTH = 2;

function tokensOf(profile) {
  return profile
    .toLowerCase()
    .split(/[-_.]/)
    .map((token) => token.replace(/\d+$/, ''))
    .filter((token) => token !== '');
}

function hasProductionAffix(token) {
  return [...PRODUCTION_WORDS].some((word) => {
    const rest = token.startsWith(word) ? token.slice(word.length) : undefined;
    const head = token.endsWith(word) ? token.slice(0, -word.length) : undefined;
    return (
      (rest !== undefined && (rest.length === REGION_LENGTH || KNOWN_WORDS.has(rest))) ||
      (head !== undefined && KNOWN_WORDS.has(head))
    );
  });
}

export function isProductionLike(profile) {
  return tokensOf(profile).some(
    (token) => PRODUCTION_WORDS.has(token) || hasProductionAffix(token),
  );
}

export function hasTestWord(profile) {
  return (
    profile.toLowerCase().startsWith('test') || tokensOf(profile).some((t) => TEST_WORDS.has(t))
  );
}

export function hasLocalWord(profile) {
  return tokensOf(profile).some((token) => LOCAL_WORDS.has(token));
}
