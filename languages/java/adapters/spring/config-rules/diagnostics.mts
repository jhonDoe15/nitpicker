import { relaxKey } from '../spring-config-parser.mts';
import { placeholderDefault } from '../spring-secrets.mts';
import { isTestOrLocal, isTrue } from './profiles.mts';
import type {
  ConfigEntry,
  ConfigRule,
  ErrorDetail,
  ProfiledDocument,
} from '../typed/config-types.mts';

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
const ERROR_DETAILS: ErrorDetail[] = [
  {
    key: relaxKey('server.error.include-stacktrace'),
    sensitive: (value: string) => CLIENT_DETAIL_MODES.has(value),
    message:
      'Set server.error.include-stacktrace=never; other values send stack traces to clients.',
  },
  {
    key: relaxKey('server.error.include-message'),
    sensitive: (value: string) => CLIENT_DETAIL_MODES.has(value),
    message:
      'Set server.error.include-message=never and return a fixed ProblemDetail from a @RestControllerAdvice; other values send exception messages to clients.',
  },
  {
    key: relaxKey('server.error.include-binding-errors'),
    sensitive: (value: string) => CLIENT_DETAIL_MODES.has(value),
    message:
      'Set server.error.include-binding-errors=never and report field errors from a @RestControllerAdvice; other values send rejected values to clients.',
  },
  {
    key: relaxKey('server.error.include-exception'),
    sensitive: (value: string) => value === 'true',
    message:
      'Set server.error.include-exception=false; true sends exception class names to clients.',
  },
];

function effective(entry: ConfigEntry): string {
  return placeholderDefault(entry.value.trim()).toLowerCase();
}

function logsBoundValues(key: string): boolean {
  return (
    key === ROOT_LOGGER ||
    BIND_LOGGERS.some((logger) => key.startsWith(logger) || logger.startsWith(`${key}.`))
  );
}

function errorDetailsProblem(entry: ConfigEntry, key: string): string | undefined {
  const value = effective(entry);
  return ERROR_DETAILS.find((detail) => detail.key === key && detail.sensitive(value))?.message;
}

function diagnosticsProblem(entry: ConfigEntry, key: string): string | undefined {
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

function activeProfileProblem(entry: ConfigEntry, key: string): string | undefined {
  const advice = PROFILE_ADVICE.get(key);
  return advice !== undefined && !FROM_ENVIRONMENT.test(entry.value.trim())
    ? `${advice} ${entry.key.replace(/\[\d+\]$/, '')} in the packaged main file turns those profiles on in every environment.`
    : undefined;
}

export const DIAGNOSTIC_RULES: ConfigRule[] = [
  { rule: 'error-details', exempt: isTestOrLocal, problem: errorDetailsProblem },
  { rule: 'unsafe-diagnostics', exempt: isTestOrLocal, problem: diagnosticsProblem },
  {
    rule: 'active-profile',
    exempt: (document: ProfiledDocument) => !document.main || document.profiles.length > 0,
    lists: true,
    problem: activeProfileProblem,
  },
];
