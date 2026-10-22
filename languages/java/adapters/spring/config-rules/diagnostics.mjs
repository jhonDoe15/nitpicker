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
    message:
      'Set server.error.include-stacktrace=never; other values send stack traces to clients.',
  },
  {
    key: relaxKey('server.error.include-message'),
    sensitive: (value) => CLIENT_DETAIL_MODES.has(value),
    message:
      'Set server.error.include-message=never and return a fixed ProblemDetail from a @RestControllerAdvice; other values send exception messages to clients.',
  },
  {
    key: relaxKey('server.error.include-binding-errors'),
    sensitive: (value) => CLIENT_DETAIL_MODES.has(value),
    message:
      'Set server.error.include-binding-errors=never and report field errors from a @RestControllerAdvice; other values send rejected values to clients.',
  },
  {
    key: relaxKey('server.error.include-exception'),
    sensitive: (value) => value === 'true',
    message:
      'Set server.error.include-exception=false; true sends exception class names to clients.',
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
    return `Log SQL with the logging.level.org.hibernate.SQL logger in a local profile and remove ${entry.key}=true, which prints SQL to standard output, outside logging.`;
  }
  if (
    key.startsWith('logging.level.') &&
    logsBoundValues(key) &&
    ['trace', 'all'].includes(value)
  ) {
    return `Leave ${entry.key} at its default level; ${entry.value} logs bound SQL values, including passwords and personal data.`;
  }
  if (ALWAYS_VALUES.includes(key) && value === 'always') {
    return `Set ${entry.key} to when-authorized or never; always serves internals to every caller.`;
  }
  return H2_CONSOLE.includes(key) && enabled
    ? `Enable ${entry.key} only in a local profile; it opens the H2 web console.`
    : undefined;
}

function activeProfileProblem(entry, key) {
  return PROFILE_ADVICE.has(key) && !FROM_ENVIRONMENT.test(entry.value.trim())
    ? `${PROFILE_ADVICE.get(key)} ${entry.key.replace(/\[\d+\]$/, '')} in the packaged main file turns those profiles on in every environment.`
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
