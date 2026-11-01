const NO_RETRIES = /^(?:0|null)\s*(?:[,)}\]]|$)/u;
const CONSTANT_NAME = /^([A-Za-z_]\w*)\s*(?:[,)}\]]|$)/u;
const VALUE_DECLARATION =
  /(?:^|[\s;])(?:const\s+)?val\s+([A-Za-z_]\w*)(?:\s*:\s*Int\??)?\s*=\s*([^\n;]*)/gu;

export function zeroConstants(scanned) {
  const zero = new Set();
  const other = new Set();
  for (const match of scanned.code.matchAll(VALUE_DECLARATION)) {
    (NO_RETRIES.test(match[2].trim()) ? zero : other).add(match[1]);
  }
  return new Set([...zero].filter((name) => !other.has(name)));
}

export function retriesOn(value, zeros) {
  if (value === undefined) {
    return false;
  }
  const trimmed = value.trim();
  const name = CONSTANT_NAME.exec(trimmed)?.[1];
  return !NO_RETRIES.test(trimmed) && !(name !== undefined && zeros.has(name));
}
