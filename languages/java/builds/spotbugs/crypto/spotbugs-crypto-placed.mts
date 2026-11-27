import type { Placed } from '../spotbugs-placed.mts';

const WARNING = 'warning';
const LEVELS = { 1: WARNING, 2: WARNING };

export const CRYPTO_PATTERNS: readonly string[] = [
  'CIPHER_INTEGRITY',
  'ECB_MODE',
  'PADDING_ORACLE',
  'DES_USAGE',
  'RSA_NO_PADDING',
  'WEAK_MESSAGE_DIGEST_MD5',
  'WEAK_MESSAGE_DIGEST_SHA1',
  'CUSTOM_MESSAGE_DIGEST',
  'NULL_CIPHER',
  'HAZELCAST_SYMMETRIC_ENCRYPTION',
  'ESAPI_ENCRYPTOR',
  'BAD_HEXA_CONVERSION',
  'RSA_KEY_SIZE',
  'BLOWFISH_KEY_SIZE',
  'STATIC_IV',
];

export const CRYPTO_PLACED: Readonly<Record<string, Placed>> = {
  CIPHER_INTEGRITY: { text: 'Cipher with no integrity', levels: LEVELS },
  ECB_MODE: { text: 'ECB mode is insecure', levels: LEVELS },
  PADDING_ORACLE: { text: 'Cipher is susceptible to Padding Oracle', levels: LEVELS },
  DES_USAGE: { text: 'DES is insecure', levels: LEVELS },
  RSA_NO_PADDING: { text: 'RSA with no padding is insecure', levels: LEVELS },
  WEAK_MESSAGE_DIGEST_MD5: { text: 'MD2, MD4 and MD5 are weak hash functions', levels: LEVELS },
  WEAK_MESSAGE_DIGEST_SHA1: { text: 'SHA-1 is a weak hash function', levels: LEVELS },
  CUSTOM_MESSAGE_DIGEST: { text: 'Message digest is custom', levels: LEVELS },
  NULL_CIPHER: { text: 'NullCipher is insecure', levels: LEVELS },
  HAZELCAST_SYMMETRIC_ENCRYPTION: { text: 'Hazelcast symmetric encryption', levels: LEVELS },
  ESAPI_ENCRYPTOR: { text: 'Use of ESAPI Encryptor', levels: LEVELS },
  BAD_HEXA_CONVERSION: { text: 'Bad hexadecimal concatenation', levels: LEVELS },
  RSA_KEY_SIZE: { text: 'RSA usage with short key', levels: LEVELS },
  BLOWFISH_KEY_SIZE: { text: 'Blowfish usage with short key', levels: LEVELS },
  STATIC_IV: { text: 'Static IV', levels: LEVELS },
};
