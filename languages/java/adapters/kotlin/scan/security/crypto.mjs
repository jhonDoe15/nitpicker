import { inImport, literalAt, splitArguments } from '../kotlin-source.mjs';

const ALGORITHM_CALL =
  /\b(MessageDigest|Mac|Signature|KeyGenerator)\s*\.\s*getInstance\s*\(|\bDigestUtils\s*\(/g;
const WEAK_ALGORITHMS = {
  MessageDigest: /^(?:MD[245]|SHA-?1?)$/i,
  DigestUtils: /^(?:MD[245]|SHA-?1?)$/i,
  Mac: /^HmacMD5$/i,
  KeyGenerator: /^HmacMD5$/i,
  Signature: /^(?:MD[25]|SHA1?)with/i,
};
const ALGORITHM_CONSTANT =
  /^(?:MessageDigestAlgorithms|HmacAlgorithms)\s*\.\s*(MD[245]|SHA_1|HMAC_MD5)$/;
const CODEC_HELPERS =
  'md[25](?:Hex)?|sha1?(?:Hex)?|get(?:Md[25]|Sha1?)Digest|md5Digest(?:AsHex)?|appendMd5DigestAsHex';
const WEAK_HELPER = new RegExp(
  [
    String.raw`\b(?:DigestUtils\s*\.\s*(?:${CODEC_HELPERS})|Hashing\s*\.\s*(?:md5|sha1)`,
    String.raw`|HmacUtils\s*\.\s*hmacMd5\w*)\s*\(|\.\s*(?:md5|sha1)\s*\(\s*\)`,
  ].join(''),
  'g',
);
const VERIFIER_OWNERS = [
  'HostnameVerifier',
  'TrustStrategy',
  'hostnameVerifier',
  'setDefaultHostnameVerifier',
  'setHostnameVerifier',
  String.raw`loadTrustMaterial\s*\([^()]*\)`,
];
const INSECURE_TYPES = [
  'NoopHostnameVerifier',
  'AllowAllHostnameVerifier',
  'ALLOW_ALL_HOSTNAME_VERIFIER',
  'TrustAllStrategy',
  'TrustSelfSignedStrategy',
  'InsecureTrustManagerFactory',
];
const TRUE_LAMBDA = String.raw`\{\s*[\w_]+\s*,\s*[\w_]+\s*->\s*true\s*\}`;
const TRUST_ALL = [
  /\boverride\s+fun\s+checkServerTrusted\s*\([^)]*\)\s*(?::\s*Unit\s*)?(?:=\s*Unit\b|\{\s*\})/g,
  new RegExp(
    String.raw`\bfun\s+verify\s*\([^)]*SSLSession[^)]*\)\s*(?::\s*Boolean\s*)?(?:=\s*true\b|\{\s*return\s+true\s*\})`,
    'g',
  ),
  new RegExp(String.raw`\b(?:${VERIFIER_OWNERS.join('|')})\s*(?:\(\s*)?${TRUE_LAMBDA}`, 'g'),
  new RegExp(String.raw`\b(?:${INSECURE_TYPES.join('|')})\b`, 'g'),
];

export const CRYPTO_MESSAGES = {
  WeakHash:
    'Hash with `MessageDigest.getInstance("SHA-256")` (or SHA-384, SHA-512, SHA3-256), sign with `Mac.getInstance("HmacSHA256")`, and hash passwords with Argon2 or bcrypt (`Argon2PasswordEncoder`, `BCryptPasswordEncoder`): MD5 and SHA-1 are broken hashes, collisions are cheap and brute force is fast. A protocol you do not control that requires one (a legacy signature, an ETag, a WebSocket accept key) is the exception.',
  TlsVerificationOff:
    'Keep certificate and host-name verification on and trust the certificate authority instead: load it into a `KeyStore` and build the `SSLContext` from `TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(keyStore) }`, use OkHttp `HandshakeCertificates.Builder().addTrustedCertificate(certificate)`, or set `-Djavax.net.ssl.trustStore` for a private CA. This trusts any certificate or host name, so anyone on the network can pose as the server, and turning it off by environment ships the switch to production.',
};

export const WEAK_HMAC_MESSAGE =
  'Sign with `Mac.getInstance("HmacSHA256")`: HMAC-MD5 rests on MD5, which is broken and no longer approved for message authentication. HMAC-SHA1 is accepted where a protocol fixes it (TOTP, OAuth 1.0a).';

function constantValue(scanned, name) {
  const declared = new RegExp(
    String.raw`\b(?:const\s+)?val\s+${name}\s*(?::\s*String\s*)?=\s*`,
    'g',
  );
  const values = [...scanned.code.matchAll(declared)].map(
    (match) => literalAt(scanned, match.index + match[0].length)?.text,
  );
  return values.length === 1 ? values[0] : undefined;
}

function algorithmOf(scanned, part) {
  const text = scanned.code.slice(part.start, part.end);
  const offset = part.start + text.length - text.trimStart().length;
  const literal = literalAt(scanned, offset);
  if (literal !== undefined) {
    return literal.template ? undefined : literal.text;
  }
  const source = scanned.source.slice(part.start, part.end).trim();
  const constant = ALGORITHM_CONSTANT.exec(source);
  if (constant !== null) {
    return constant[1].replace('_', '-').replace('HMAC-MD5', 'HmacMD5');
  }
  return /^[A-Za-z_]\w*$/.test(source) ? constantValue(scanned, source) : undefined;
}

function algorithmCalls(scanned) {
  return [...scanned.code.matchAll(ALGORITHM_CALL)].flatMap((match) => {
    const owner = match[1] ?? 'DigestUtils';
    const [first] = splitArguments(scanned.code, match.index + match[0].length - 1).parts;
    const algorithm = first === undefined ? undefined : algorithmOf(scanned, first);
    if (algorithm === undefined || !WEAK_ALGORITHMS[owner].test(algorithm)) {
      return [];
    }
    const hmac = /^HmacMD5$/i.test(algorithm);
    return [{ offset: match.index, subject: algorithm, hmac }];
  });
}

function helperCalls(scanned) {
  return [...scanned.code.matchAll(WEAK_HELPER)].map((match) => ({
    offset: match.index + match[0].search(/\S/),
    subject: match[0].replaceAll(/\s+/g, ''),
    hmac: /HmacUtils/.test(match[0]),
  }));
}

export function weakHashes(scanned) {
  return [...algorithmCalls(scanned), ...helperCalls(scanned)].map(({ offset, subject, hmac }) => ({
    rule: 'WeakHash',
    offset,
    subject,
    ...(hmac ? { message: WEAK_HMAC_MESSAGE } : {}),
  }));
}

export function disabledTlsVerification(scanned) {
  const offsets = TRUST_ALL.flatMap((pattern) =>
    [...scanned.code.matchAll(pattern)]
      .map(({ index }) => index)
      .filter((index) => !inImport(scanned.code, index)),
  );
  return [...new Set(offsets)]
    .toSorted((left, right) => left - right)
    .map((offset) => ({ rule: 'TlsVerificationOff', offset }));
}
