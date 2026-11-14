export const REVIEW_CODES = Object.freeze([
  'ASYNC105',
  'ASYNC116',
  'B006',
  'B011',
  'B028',
  'E711',
  'E712',
  'E731',
  'FLY002',
  'LOG001',
  'N804',
  'N805',
  'PIE810',
  'PLE1519',
  'PLE1520',
  'PLR1714',
  'PLW0133',
  'PT014',
  'PT022',
  'RUF005',
  'RUF015',
  'RUF024',
  'RUF032',
  'SIM109',
  'SIM112',
  'SIM118',
  'T201',
  'T203',
  'TRY201',
  'TRY400',
]);

const KNOWN = new Set(REVIEW_CODES);
const PREFIX = 'ruff/';

export function selectedRuffCodes(selectedRules = []) {
  return selectedRules
    .filter((name) => name.startsWith(PREFIX))
    .map((name) => name.slice(PREFIX.length));
}

export function reviewCodesSelected(selectedRules = []) {
  return [...new Set(selectedRuffCodes(selectedRules).filter((code) => KNOWN.has(code)))].toSorted(
    (left, right) => left.localeCompare(right),
  );
}
