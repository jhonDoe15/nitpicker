import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { nextOccurrence } from '../../../shared/rules/finding-helpers.mjs';
import { isProfileKey, parseProperties, parseYaml, relaxKey } from './spring-config-parser.mjs';

const SPRING_TOOL = 'spring';
const DEFAULT_RESOURCE_ROOTS = ['src/main/resources'];
const CONFIG_FILE = /^application(?:-(.+))?\.(properties|ya?ml)$/;
const MAIN_FILES = ['application.properties', 'application.yml', 'application.yaml'];
const LOCAL_PROFILES = new Set(['local', 'dev']);
const PERSISTENCE_IMPORT = /^\s*import\s+(?:jakarta|javax)\.persistence\./m;
const SECRET_SEGMENTS = new Set(['apikey', 'privatekey', 'credentials']);
const SECRET_SUFFIXES = ['password', 'secret', 'token'];
const OPEN_IN_VIEW = 'spring.jpa.open-in-view';
const STARTUP_FLAG_NAMES = [
  'spring.main.allow-circular-references',
  'spring.main.allow-bean-definition-overriding',
  'spring.main.lazy-initialization',
];
const STARTUP_FLAGS = new Set(STARTUP_FLAG_NAMES.map(relaxKey));
const OPEN_IN_VIEW_MESSAGE =
  'Spring Boot enables open-in-view by default, which holds a database connection through view rendering and hides N+1 queries. Set spring.jpa.open-in-view=false.';

function isTest(document) {
  return document.profiles.some((profile) => profile.startsWith('test'));
}

function isLocal(document) {
  return isTest(document) || document.profiles.some((profile) => LOCAL_PROFILES.has(profile));
}

function isTrue(entry) {
  return entry.value.toLowerCase() === 'true';
}

function isPlaceholder(entry) {
  return entry.value.startsWith('${');
}

const ENTRY_RULES = [
  {
    rule: 'ddl-auto',
    exempt: isLocal,
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
    exempt: isLocal,
    lists: true,
    problem: (entry, key) =>
      key === relaxKey('management.endpoints.web.exposure.include') && exposesAll(entry.value)
        ? 'management.endpoints.web.exposure.include=* exposes every actuator endpoint. List the endpoints you need, for example health,info.'
        : undefined,
  },
  {
    rule: 'error-details',
    exempt: isLocal,
    problem: (entry, key) =>
      key === relaxKey('server.error.include-stacktrace') &&
      ['always', 'on-param', 'on_param'].includes(entry.value.toLowerCase())
        ? 'server.error.include-stacktrace sends stack traces to clients. Use never.'
        : undefined,
  },
  {
    rule: 'literal-secret',
    exempt: isLocal,
    problem: (entry) =>
      entry.value !== '' && !isPlaceholder(entry) && isSecretKey(entry.key)
        ? `${entry.key} holds a literal secret. Read it from an environment variable or a secret store, for example \${${secretVariable(entry.key)}}.`
        : undefined,
  },
];

function ddlProblem(entry, key) {
  if (isPlaceholder(entry)) {
    return undefined;
  }
  if (key === relaxKey('spring.jpa.hibernate.ddl-auto')) {
    const mode = entry.value.toLowerCase();
    return mode !== '' && mode !== 'none' && mode !== 'validate'
      ? 'spring.jpa.hibernate.ddl-auto lets Hibernate change the schema. Manage the schema with Flyway or Liquibase and use none or validate.'
      : undefined;
  }
  return key === relaxKey('spring.jpa.generate-ddl') && isTrue(entry)
    ? 'spring.jpa.generate-ddl lets Hibernate change the schema. Manage the schema with Flyway or Liquibase and keep it false.'
    : undefined;
}

function displayName(key, names) {
  return names.find((name) => relaxKey(name) === key) ?? key;
}

function exposesAll(value) {
  return value
    .replaceAll(/[[\]"']/g, '')
    .split(',')
    .some((item) => item.trim() === '*');
}

function isSecretKey(key) {
  const last = relaxKey(key.split('.').at(-1));
  return SECRET_SEGMENTS.has(last) || SECRET_SUFFIXES.some((suffix) => last.endsWith(suffix));
}

function secretVariable(key) {
  return key
    .split('.')
    .at(-1)
    .replaceAll(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase();
}

function allowance(rule) {
  return `To allow it here, add an exception for spring/${rule} in nitpicker.config.json.`;
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

function readSpringDocuments(projectRoot, resourceRoots) {
  return resourceRoots.flatMap((root) => {
    const directory = root.replaceAll('\\', '/').replace(/\/+$/, '');
    const absolute = path.join(projectRoot, directory);
    if (!existsSync(absolute)) {
      return [];
    }
    return readdirSync(absolute, { withFileTypes: true })
      .filter((entry) => entry.isFile() && CONFIG_FILE.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .flatMap((name) => fileDocuments(absolute, `${directory}/${name}`, name));
  });
}

function fileDocuments(absoluteDirectory, relativePath, name) {
  const [, fileProfile, extension] = CONFIG_FILE.exec(name);
  const text = readFileSync(path.join(absoluteDirectory, name), 'utf8');
  const parsed = extension === 'properties' ? parseProperties(text) : parseYaml(text);
  return parsed.map((document) => ({
    path: relativePath,
    main: MAIN_FILES.includes(name),
    profiles: documentProfiles(document.entries, fileProfile),
    entries: document.entries,
  }));
}

function documentProfiles(entries, fileProfile) {
  const declared = entries
    .filter((entry) => isProfileKey(entry.key))
    .flatMap((entry) => entry.value.replaceAll(/[[\]"']/g, '').split(','))
    .map((profile) => profile.trim().toLowerCase())
    .filter((profile) => profile !== '');
  if (declared.length > 0) {
    return declared;
  }
  return fileProfile === undefined ? [] : [fileProfile.toLowerCase()];
}

function usesJpa(projectRoot, sourceRoots) {
  return sourceRoots.some((root) => {
    const absolute = path.join(projectRoot, root);
    return (
      existsSync(absolute) &&
      readdirSync(absolute, { recursive: true }).some(
        (file) =>
          String(file).endsWith('.java') &&
          PERSISTENCE_IMPORT.test(readFileSync(path.join(absolute, String(file)), 'utf8')),
      )
    );
  });
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
      buildFinding({ rule: 'open-in-view', document, entry, key, occurrences }),
    );
  }
  if (entries.length > 0) {
    return [];
  }
  const anchor = documents.find((document) => document.main) ?? documents[0];
  return [
    buildFinding({ rule: 'open-in-view', document: anchor, key: `${key}:missing`, occurrences }),
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

function buildFinding({ rule, document, entry, key, message = OPEN_IN_VIEW_MESSAGE, occurrences }) {
  const occurrence = nextOccurrence(occurrences, `${document.path}\0${rule}\0${key}`);
  return {
    tool: SPRING_TOOL,
    rule,
    path: document.path,
    identity: occurrence === 1 ? key : `${key}#${String(occurrence)}`,
    message: `${message} ${allowance(rule)}`,
    classification: 'enforceable',
    ...(entry === undefined ? {} : { location: { line: entry.line } }),
  };
}
