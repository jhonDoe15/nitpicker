const PATH_SEPARATOR = ' > ';
const FIELD_SEPARATOR = '|';
const STRUCTURED_RULES = new Set([
  'io-in-loop',
  'accumulator-copy',
  'lazy-relation-in-loop',
  'remote-call-in-transaction',
  'remote-call-under-lock',
  'retry-without-idempotency',
  'dual-write-without-outbox',
]);

export function parseEffect(subject = '') {
  const [route = '', ...fields] = subject.split(FIELD_SEPARATOR);
  return { path: route.split(PATH_SEPARATOR), fields };
}

export function identitySubject(rule, subject) {
  if (!STRUCTURED_RULES.has(rule)) {
    return subject;
  }
  return subject.split(FIELD_SEPARATOR)[0].split(PATH_SEPARATOR)[0];
}

export function pathPhrase(path) {
  const [first, ...rest] = path;
  if (rest.length === 0) {
    return `\`${first}\``;
  }
  const steps = rest.map((step) => `which calls \`${step}\``).join(', ');
  return `\`${first}\` (${steps})`;
}
