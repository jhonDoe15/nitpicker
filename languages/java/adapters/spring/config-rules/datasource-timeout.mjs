import { relaxKey } from '../spring-config-parser.mjs';
import { placeholderDefault } from '../spring-secrets.mjs';
import { isTestOrLocal } from './profiles.mjs';

const URL_KEYS = new Set(
  ['spring.datasource.url', 'spring.datasource.hikari.jdbc-url'].map(relaxKey),
);
const TIMEOUT_KEYS = new Set(
  [
    'spring.jpa.properties.jakarta.persistence.query.timeout',
    'spring.jpa.properties.javax.persistence.query.timeout',
    'spring.transaction.default-timeout',
    'spring.jdbc.template.query-timeout',
    'spring.datasource.hikari.data-source-properties.socketTimeout',
  ].map(relaxKey),
);
const TEXT_KEYS = new Set(
  [
    'spring.datasource.hikari.data-source-properties.options',
    'spring.datasource.hikari.connection-init-sql',
  ].map(relaxKey),
);
const TIMEOUT_TEXT = /statement_timeout|max_execution_time/iu;
const URL_TIMEOUT = /[?&;](?:socketTimeout|queryTimeout|statement_timeout)=|statement_timeout/iu;
const NO_TIME = /^(?:0+(?:\.0+)?[a-z]*|-1)?$/iu;
const EMBEDDED_URL = /^jdbc:(?:h2:mem|hsqldb:mem|derby:memory|sqlite):/iu;

export const DATASOURCE_TIMEOUT_MESSAGE =
  'Set a deadline for database queries: spring.jpa.properties.jakarta.persistence.query.timeout (milliseconds), spring.transaction.default-timeout, spring.jdbc.template.query-timeout, or a driver socket timeout in the JDBC URL (socketTimeout=30 for PostgreSQL, socketTimeout=30000 for MySQL); without one a stuck query holds its request and pool connection for good.';

function valueOf(entry) {
  return placeholderDefault(entry.value.trim());
}

function setsTimeout(entry) {
  const key = relaxKey(entry.key);
  const value = valueOf(entry);
  if (TIMEOUT_KEYS.has(key)) {
    return entry.value.trim().startsWith('${') || !NO_TIME.test(value);
  }
  if (TEXT_KEYS.has(key)) {
    return TIMEOUT_TEXT.test(value);
  }
  return URL_KEYS.has(key) && URL_TIMEOUT.test(value);
}

function isServerUrl(entry) {
  return (
    URL_KEYS.has(relaxKey(entry.key)) &&
    entry.value.trim() !== '' &&
    !EMBEDDED_URL.test(valueOf(entry))
  );
}

export function datasourceTimeoutSites(documents) {
  const live = documents.filter((document) => !isTestOrLocal(document));
  const entries = live.flatMap((document) =>
    document.entries.filter((entry) => !entry.list).map((entry) => ({ document, entry })),
  );
  if (entries.some(({ entry }) => setsTimeout(entry))) {
    return [];
  }
  return entries.filter(({ entry }) => isServerUrl(entry));
}
