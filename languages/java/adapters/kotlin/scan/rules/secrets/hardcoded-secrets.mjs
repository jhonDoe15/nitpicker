import { fallbackLiterals } from './secret-values.mjs';
import { isSecretName, looksSecret } from './secret-names.mjs';

const ASSIGNED = /(?<!\w)([A-Za-z_]\w*)(?:\s*:\s*[\w.<>?]+)?\s*=(?![=>])/g;
const KEYED = /"\s*(?:,|\bto\b)\s*/g;
const INDEXED = /"\s*\]\s*=(?![=>])\s*/g;
const CREDENTIAL = [
  /AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
  /[rs]k_(?:live|test)_[A-Za-z0-9]{20,}|sk-(?:proj|ant|live|test)-[A-Za-z0-9_-]{20,}/,
  /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@${}]{6,}@/i,
  /[?&;]password=[^&;\s${}]{6,}/i,
  /^(?:Bearer|Basic) [A-Za-z0-9._~+/=-]{16,}$/,
];

function secretFindings(scanned, from, name) {
  return fallbackLiterals(scanned, from)
    .filter(({ text }) => looksSecret(text, name))
    .map(({ start }) => ({ rule: 'HardcodedSecret', offset: start, subject: name }));
}

function keyBefore(scanned, quoteIndex) {
  return scanned.literals.find(({ end }) => end === quoteIndex + 1);
}

function keyedFindings(scanned, pattern) {
  return [...scanned.code.matchAll(pattern)].flatMap(({ index, 0: text }) => {
    const key = keyBefore(scanned, index);
    return key !== undefined && isSecretName(key.text)
      ? secretFindings(scanned, index + text.length, key.text)
      : [];
  });
}

export function hardcodedSecrets(scanned) {
  const assigned = [...scanned.code.matchAll(ASSIGNED)].flatMap((match) =>
    isSecretName(match[1]) ? secretFindings(scanned, match.index + match[0].length, match[1]) : [],
  );
  const all = [...assigned, ...keyedFindings(scanned, KEYED), ...keyedFindings(scanned, INDEXED)];
  return all.filter(
    (item, index) => all.findIndex(({ offset }) => offset === item.offset) === index,
  );
}

export function credentialLiterals(scanned) {
  return scanned.literals
    .filter(({ text }) => CREDENTIAL.some((pattern) => pattern.test(text)))
    .map(({ start }) => ({ rule: 'CredentialLiteral', offset: start }));
}
