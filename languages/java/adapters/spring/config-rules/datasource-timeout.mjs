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
    'spring.datasource.hikari.data-source-properties.oracle.jdbc.ReadTimeout',
    'spring.datasource.dbcp2.default-query-timeout',
  ].map(relaxKey),
);
const TEXT_KEYS = new Set(
  [
    'spring.datasource.hikari.data-source-properties.options',
    'spring.datasource.hikari.connection-init-sql',
    'spring.datasource.tomcat.connection-properties',
    'spring.datasource.tomcat.init-sql',
  ].map(relaxKey),
);
const TEXT_TIMEOUTS = ['statement_timeout', 'max_execution_time', 'sockettimeout', 'querytimeout'];
const NO_TIME = /^(?:-1[a-z]*|0+(?:\.0+)?[a-z]*|PT0+S)?$/iu;
const EMBEDDED_URL = /^jdbc:(?:h2:|hsqldb:|derby:|sqlite:|tc:)/iu;

export const DATASOURCE_TIMEOUT_MESSAGE =
  'Set a deadline for database queries, such as spring.jpa.properties.jakarta.persistence.query.timeout=30000 or socketTimeout in the JDBC URL; without one a stuck query holds its request and pool connection for good.';

function valueOf(entry) {
  return placeholderDefault(entry.value.trim());
}

const LEADING_SEPARATORS = /^[ \t=:'"]*/u;
const SETTING_VALUE = /^[\w.]*/u;

function valueAfter(rest) {
  const value = rest.replace(LEADING_SEPARATORS, '');
  return SETTING_VALUE.exec(value)?.[0] ?? '';
}

function carriesTimeout(value) {
  const text = value.toLowerCase().replaceAll('%3d', '=').replaceAll('%20', ' ');
  return TEXT_TIMEOUTS.some((key) =>
    text
      .split(key)
      .slice(1)
      .some((rest) => !NO_TIME.test(valueAfter(rest))),
  );
}

function setsTimeout(entry) {
  const key = relaxKey(entry.key);
  if (TIMEOUT_KEYS.has(key)) {
    return entry.value.trim().startsWith('${') || !NO_TIME.test(valueOf(entry));
  }
  return (TEXT_KEYS.has(key) || URL_KEYS.has(key)) && carriesTimeout(valueOf(entry));
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
