import { nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';
import { readSpringDocuments, stripBracketsAndQuotes, usesJpa } from './spring-config-files.mjs';
import { relaxKey } from './spring-config-parser.mjs';
import { isLiteralSecret, secretVariable } from './spring-secrets.mjs';

const SPRING_TOOL = 'spring';
const DEFAULT_RESOURCE_ROOTS = ['src/main/resources'];
const LOCAL_PROFILES = new Set(['local', 'dev', 'development']);
const TEST_PROFILES = new Set(['it', 'integration-test']);
const TRUE_SPELLINGS = new Set(['true', 'on', 'yes', '1']);
const OPEN_IN_VIEW = 'spring.jpa.open-in-view';
const DDL_MODE_NAMES = [
  'spring.jpa.hibernate.ddl-auto',
  'spring.jpa.properties.hibernate.hbm2ddl.auto',
];
const DDL_MODES = new Set(DDL_MODE_NAMES.map(relaxKey));
const GENERATE_DDL = relaxKey('spring.jpa.generate-ddl');
const STARTUP_FLAG_NAMES = [
  'spring.main.allow-circular-references',
  'spring.main.allow-bean-definition-overriding',
  'spring.main.lazy-initialization',
];
const STARTUP_FLAGS = new Set(STARTUP_FLAG_NAMES.map(relaxKey));
const OPEN_IN_VIEW_MESSAGE =
  'Spring Boot enables open-in-view by default, which holds a database connection through view rendering and hides N+1 queries. Set spring.jpa.open-in-view=false.';

function isTestProfile(profile) {
  return profile.startsWith('test') || TEST_PROFILES.has(profile);
}

function isLocalProfile(profile) {
  return LOCAL_PROFILES.has(profile);
}

function exemptWhenEvery(matches) {
  return (document) =>
    !document.negated && document.profiles.length > 0 && document.profiles.every(matches);
}

const isTest = exemptWhenEvery(isTestProfile);
const isTestOrLocal = exemptWhenEvery(
  (profile) => isTestProfile(profile) || isLocalProfile(profile),
);

function isTrue(entry) {
  return TRUE_SPELLINGS.has(entry.value.toLowerCase());
}

function isPlaceholder(entry) {
  return entry.value.startsWith('${');
}

const ENTRY_RULES = [
  {
    rule: 'ddl-auto',
    exempt: isTestOrLocal,
    problem: ddlProblem,
  },
  {
    rule: 'risky-startup-flags',
    exempt: isTest,
    problem: (entry, key) =>
      STARTUP_FLAGS.has(key) && isTrue(entry)
        ? `${displayName(key, STARTUP_FLAG_NAMES)}=true hides wiring problems instead of fixing them. Remove it, or restructure the beans.`
        : undefined,
  },
  {
    rule: 'actuator-exposure',
    exempt: isTestOrLocal,
    lists: true,
    problem: (entry, key) =>
      key === relaxKey('management.endpoints.web.exposure.include') && exposesAll(entry.value)
        ? 'management.endpoints.web.exposure.include=* exposes every actuator endpoint. List the endpoints you need, for example health,info.'
        : undefined,
  },
  {
    rule: 'error-details',
    exempt: isTestOrLocal,
    problem: (entry, key) =>
      key === relaxKey('server.error.include-stacktrace') &&
      ['always', 'on-param', 'on_param'].includes(entry.value.toLowerCase())
        ? 'server.error.include-stacktrace sends stack traces to clients. Use never.'
        : undefined,
  },
  {
    rule: 'literal-secret',
    exempt: isTestOrLocal,
    problem: (entry) =>
      isLiteralSecret(entry.key, entry.value) ? secretProblem(entry) : undefined,
  },
];

function secretProblem(entry) {
  return entry.value.trim().startsWith('${')
    ? `${entry.key} falls back to a literal secret. Drop the default from the placeholder.`
    : `${entry.key} holds a literal secret. Remove it and set ${secretVariable(entry.key)} in the environment, or read it from a secret store.`;
}

function ddlProblem(entry, key) {
  if (isPlaceholder(entry)) {
    return undefined;
  }
  if (DDL_MODES.has(key)) {
    const mode = entry.value.toLowerCase();
    return mode !== '' && mode !== 'none' && mode !== 'validate'
      ? `${displayName(key, DDL_MODE_NAMES)} lets Hibernate change the schema. Manage the schema with Flyway or Liquibase and use none or validate.`
      : undefined;
  }
  return key === GENERATE_DDL && isTrue(entry)
    ? 'spring.jpa.generate-ddl lets Hibernate change the schema. Manage the schema with Flyway or Liquibase and keep it false.'
    : undefined;
}

function displayName(key, names) {
  return names.find((name) => relaxKey(name) === key) ?? key;
}

function exposesAll(value) {
  return stripBracketsAndQuotes(value)
    .split(',')
    .some((item) => item.trim() === '*');
}

export function readSpringConfigFindings(projectRoot, { sourceRoots = [], resourceRoots } = {}) {
  const documents = readSpringDocuments(
    projectRoot,
    Array.isArray(resourceRoots) ? resourceRoots : DEFAULT_RESOURCE_ROOTS,
  );
  if (documents.length === 0) {
    return [];
  }
  const occurrences = new Map();
  return [
    ...(usesJpa(projectRoot, sourceRoots) ? openInViewFindings(documents, occurrences) : []),
    ...ENTRY_RULES.flatMap((rule) => entryFindings(documents, rule, occurrences)),
  ];
}

function openInViewFindings(documents, occurrences) {
  const key = relaxKey(OPEN_IN_VIEW);
  const entries = documents
    .filter((document) => !isTest(document))
    .flatMap((document) =>
      document.entries
        .filter((entry) => !entry.list && relaxKey(entry.key) === key && entry.value !== '')
        .map((entry) => ({ document, entry })),
    );
  const enabled = entries.filter(({ entry }) => isTrue(entry));
  if (enabled.length > 0) {
    return enabled.map(({ document, entry }) =>
      buildFinding({
        rule: 'open-in-view',
        document,
        entry,
        key,
        message: OPEN_IN_VIEW_MESSAGE,
        occurrences,
      }),
    );
  }
  if (entries.length > 0) {
    return [];
  }
  const anchor = documents.find((document) => document.main);
  return anchor === undefined
    ? []
    : [
        buildFinding({
          rule: 'open-in-view',
          document: anchor,
          key: `${key}:missing`,
          message: OPEN_IN_VIEW_MESSAGE,
          occurrences,
        }),
      ];
}

function entryFindings(documents, { rule, exempt, problem, lists = false }, occurrences) {
  return documents
    .filter((document) => !exempt(document))
    .flatMap((document) =>
      document.entries
        .filter((entry) => lists || !entry.list)
        .map((entry) => ({ entry, message: problem(entry, relaxKey(entry.key)) }))
        .filter(({ message }) => message !== undefined)
        .map(({ entry, message }) =>
          buildFinding({ rule, document, entry, key: relaxKey(entry.key), message, occurrences }),
        ),
    );
}

function buildFinding({ rule, document, entry, key, message, occurrences }) {
  const occurrence = nextOccurrence(occurrences, `${document.path}\0${rule}\0${key}`);
  return {
    tool: SPRING_TOOL,
    rule,
    path: document.path,
    identity: occurrence === 1 ? key : `${key}#${String(occurrence)}`,
    message,
    classification: 'enforceable',
    ...(entry === undefined ? {} : { location: { line: entry.line } }),
  };
}
