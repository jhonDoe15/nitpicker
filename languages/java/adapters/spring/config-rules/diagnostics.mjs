import { relaxKey } from '../spring-config-parser.mjs';
import { placeholderDefault } from '../spring-secrets.mjs';
import { isTestOrLocal, isTrue } from './profiles.mjs';

const CLIENT_DETAIL_MODES = new Set(['always', 'on-param', 'on_param']);
const BIND_LOGGERS = [
  'logging.level.org.hibernate.orm.jdbc.bind',
  'logging.level.org.hibernate.orm.jdbc.extract',
  'logging.level.org.hibernate.type.descriptor.sql',
].map(relaxKey);
const ROOT_LOGGER = relaxKey('logging.level.root');
const SHOW_SQL = ['spring.jpa.show-sql', 'spring.jpa.properties.hibernate.show_sql'].map(relaxKey);
const ALWAYS_VALUES = [
  'management.endpoint.env.show-values',
  'management.endpoint.configprops.show-values',
  'management.endpoint.health.show-details',
  'management.endpoint.health.show-components',
].map(relaxKey);
const H2_CONSOLE = ['spring.h2.console.enabled', 'spring.h2.console.settings.web-allow-others'].map(
  relaxKey,
);
const PROFILE_ADVICE = new Map([
  [
    relaxKey('spring.profiles.active'),
    'Set SPRING_PROFILES_ACTIVE in each deployment instead, or spring.profiles.default for a fallback that a deployment can override.',
  ],
  [
    relaxKey('spring.profiles.include'),
    'Name them in a spring.profiles.group entry instead, and activate that group with SPRING_PROFILES_ACTIVE in each deployment.',
  ],
]);
const FROM_ENVIRONMENT = /^(?:@[^@\s]+@|\$\{[^}:]*:?\})?$/;
const ERROR_DETAILS = [
  {
    key: relaxKey('server.error.include-stacktrace'),
    sensitive: (value) => CLIENT_DETAIL_MODES.has(value),
    message: 'server.error.include-stacktrace sends stack traces to clients. Use never.',
  },
  {
    key: relaxKey('server.error.include-message'),
    sensitive: (value) => CLIENT_DETAIL_MODES.has(value),
    message:
      'server.error.include-message sends exception messages to clients. Use never, and return a fixed ProblemDetail from a @RestControllerAdvice.',
  },
  {
    key: relaxKey('server.error.include-binding-errors'),
    sensitive: (value) => CLIENT_DETAIL_MODES.has(value),
    message:
      'server.error.include-binding-errors sends rejected values to clients. Use never, and report field errors from a @RestControllerAdvice.',
  },
  {
    key: relaxKey('server.error.include-exception'),
    sensitive: (value) => value === 'true',
    message: 'server.error.include-exception sends exception class names to clients. Use false.',
  },
];

function effective(entry) {
  return placeholderDefault(entry.value.trim()).toLowerCase();
}

function logsBoundValues(key) {
  return (
    key === ROOT_LOGGER ||
    BIND_LOGGERS.some((logger) => key.startsWith(logger) || logger.startsWith(`${key}.`))
  );
}

function errorDetailsProblem(entry, key) {
  const value = effective(entry);
  return ERROR_DETAILS.find((detail) => detail.key === key && detail.sensitive(value))?.message;
}

function diagnosticsProblem(entry, key) {
  const value = effective(entry);
  const enabled = isTrue({ value });
  if (SHOW_SQL.includes(key) && enabled) {
    return `${entry.key}=true prints SQL to standard output, outside logging. Remove it, and use the logging.level.org.hibernate.SQL logger in a local profile.`;
  }
  if (
    key.startsWith('logging.level.') &&
    logsBoundValues(key) &&
    ['trace', 'all'].includes(value)
  ) {
    return `${entry.key}=${entry.value} logs bound SQL values, including passwords and personal data. Leave the level at its default.`;
  }
  if (ALWAYS_VALUES.includes(key) && value === 'always') {
    return `${entry.key}=always serves internals to every caller. Use when-authorized, or never.`;
  }
  return H2_CONSOLE.includes(key) && enabled
    ? `${entry.key}=true opens the H2 web console. Enable it only in a local profile.`
    : undefined;
}

function activeProfileProblem(entry, key) {
  return PROFILE_ADVICE.has(key) && !FROM_ENVIRONMENT.test(entry.value.trim())
    ? `${entry.key.replace(/\[\d+\]$/, '')} in the packaged main file turns those profiles on in every environment. ${PROFILE_ADVICE.get(key)}`
    : undefined;
}

export const DIAGNOSTIC_RULES = [
  { rule: 'error-details', exempt: isTestOrLocal, problem: errorDetailsProblem },
  { rule: 'unsafe-diagnostics', exempt: isTestOrLocal, problem: diagnosticsProblem },
  {
    rule: 'active-profile',
    exempt: (document) => !document.main || document.profiles.length > 0,
    lists: true,
    problem: activeProfileProblem,
  },
];
