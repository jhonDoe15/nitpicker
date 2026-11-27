import type { Placed } from '../spotbugs-placed.mts';

const WARNING = 'warning';
const LEVELS = { 1: WARNING, 2: WARNING };

export const TLS_PATTERNS: readonly string[] = [
  'WEAK_TRUST_MANAGER',
  'WEAK_HOSTNAME_VERIFIER',
  'SSL_CONTEXT',
  'DEFAULT_HTTP_CLIENT',
  'UNENCRYPTED_SOCKET',
  'UNENCRYPTED_SERVER_SOCKET',
  'INSECURE_SMTP_SSL',
  'LDAP_ENTRY_POISONING',
];

export const TLS_PLACED: Readonly<Record<string, Placed>> = {
  WEAK_TRUST_MANAGER: { text: 'TrustManager that accept any certificates', levels: LEVELS },
  WEAK_HOSTNAME_VERIFIER: { text: 'HostnameVerifier that accept any signed certificates', levels: LEVELS },
  SSL_CONTEXT: { text: 'Weak SSLContext', levels: LEVELS },
  DEFAULT_HTTP_CLIENT: {
    text: 'DefaultHttpClient with default constructor is not compatible with TLS 1.2',
    levels: LEVELS,
  },
  UNENCRYPTED_SOCKET: { text: 'Unencrypted Socket', levels: LEVELS },
  UNENCRYPTED_SERVER_SOCKET: { text: 'Unencrypted Server Socket', levels: LEVELS },
  INSECURE_SMTP_SSL: { text: 'Insecure SMTP SSL connection', levels: LEVELS },
  LDAP_ENTRY_POISONING: { text: 'LDAP Entry Poisoning', levels: LEVELS },
};
