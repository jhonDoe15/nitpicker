import { exceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';
import { nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';
import { readSpringDocuments, usesJpa } from './spring-config-files.mts';
import { ENTRY_RULES } from './config-rules/entry-rules.mts';
import {
  DATASOURCE_TIMEOUT_MESSAGE,
  datasourceTimeoutSites,
} from './config-rules/datasource-timeout.mts';
import { isTest, isTrue } from './config-rules/profiles.mts';
import { relaxKey } from './spring-config-parser.mts';
import { readTestProfiles, testSourceRootsOr, withProfileKinds } from './spring-profiles.mts';
import { unboundPropertyProblems } from './unbound-keys/unbound-keys.mts';
import { untrimmedRequestTextProblems } from './request-text/untrimmed-request-text.mts';
import { springWiringProblems } from './wiring/spring-wiring.mts';

import type { ConfigRule, ProfiledDocument } from './typed/config-types.mts';
import type {
  DocumentContext,
  FindingSpec,
  FlaggedEntry,
  LineKey,
  MaybeFlagged,
  Occurrences,
  OpenInView,
  SpringConfigOptions,
  SpringFinding,
  SpringProblem,
  UnboundContext,
} from './typed/spring-types.mts';

type RouteInput = {
  rule: string;
  path: string;
  function: undefined;
  name: undefined;
  key: undefined;
};

const routeSentence: (input: RouteInput) => string | undefined = exceptionRoute;
const nextCount: (occurrences: Occurrences, key: string) => number = nextOccurrence;

const SPRING_TOOL = 'spring';
const DEFAULT_RESOURCE_ROOTS = ['src/main/resources'];
const OPEN_IN_VIEW = 'spring.jpa.open-in-view';
const OPEN_IN_VIEW_RULE = 'open-in-view';
const OPEN_IN_VIEW_MESSAGE =
  'Set spring.jpa.open-in-view=false. Spring Boot enables open-in-view by default, which holds a database connection through view rendering and hides N+1 queries.';

export { ENTRY_RULES };

export const SPRING_CONFIG_RULES: string[] = [
  OPEN_IN_VIEW_RULE,
  'missing-enable',
  'datasource-without-timeout',
  'unbound-property',
  'untrimmed-request-text',
  ...ENTRY_RULES.map(({ rule }) => rule),
];

export const SPRING_CONFIG_RULE_IDS = SPRING_CONFIG_RULES.map((rule) => `${SPRING_TOOL}/${rule}`);

function allowance(rule: string, path: string): string {
  return (
    routeSentence({
      rule: `${SPRING_TOOL}/${rule}`,
      path,
      function: undefined,
      name: undefined,
      key: undefined,
    }) ?? ''
  );
}

function problemFindings(
  rule: string,
  problems: readonly SpringProblem[],
  occurrences: Occurrences,
): SpringFinding[] {
  return problems.map(({ path: file, line, key, message }) =>
    buildFinding({ rule, document: { path: file }, entry: { line }, key, message, occurrences }),
  );
}

function unboundFindings(
  projectRoot: string,
  { sourceRoots, resources, options, occurrences }: UnboundContext,
): SpringFinding[] {
  const testSourceRoots = [
    ...testSourceRootsOr(options.testSourceRoots),
    ...(options.kotlinTestSourceRoots ?? []),
  ];
  const problems = unboundPropertyProblems(projectRoot, {
    classpath: options.springClasspath ?? [],
    sourceRoots,
    testSourceRoots: [...new Set(testSourceRoots)],
    resourceRoots: resources,
  });
  return problemFindings('unbound-property', problems, occurrences);
}

export function readSpringConfigFindings(
  projectRoot: string,
  options: SpringConfigOptions = {},
): SpringFinding[] {
  const { sourceRoots = [], resourceRoots, testSourceRoots, baselineRoot } = options;
  const resources = Array.isArray(resourceRoots) ? resourceRoots : DEFAULT_RESOURCE_ROOTS;
  const read = readSpringDocuments(projectRoot, resources);
  const occurrences: Occurrences = new Map();
  return [
    ...problemFindings(
      'missing-enable',
      springWiringProblems(projectRoot, sourceRoots, resources),
      occurrences,
    ),
    ...problemFindings(
      'untrimmed-request-text',
      untrimmedRequestTextProblems(projectRoot, sourceRoots),
      occurrences,
    ),
    ...unboundFindings(projectRoot, { sourceRoots, resources, options, occurrences }),
    ...(read.length === 0
      ? []
      : documentFindings({
          projectRoot,
          sourceRoots,
          documents: withProfileKinds(
            read,
            readTestProfiles(baselineRoot ?? projectRoot, testSourceRoots),
          ),
          occurrences,
        })),
  ];
}

function documentFindings({
  projectRoot,
  sourceRoots,
  documents,
  occurrences,
}: DocumentContext): SpringFinding[] {
  return [
    ...(usesJpa(projectRoot, sourceRoots) ? openInViewFindings(documents, occurrences) : []),
    ...datasourceTimeoutSites(documents).map(({ document, entry }) =>
      buildFinding({
        rule: 'datasource-without-timeout',
        document,
        entry,
        key: relaxKey(entry.key),
        message: DATASOURCE_TIMEOUT_MESSAGE,
        occurrences,
      }),
    ),
    ...ENTRY_RULES.flatMap((rule) => entryFindings(documents, rule, occurrences)),
  ];
}

export function openInViewSites(documents: readonly ProfiledDocument[]): OpenInView {
  const key = relaxKey(OPEN_IN_VIEW);
  const entries = documents
    .filter((document) => !isTest(document))
    .flatMap((document) =>
      document.entries
        .filter((entry) => !entry.list && relaxKey(entry.key) === key && entry.value !== '')
        .map((entry) => ({ document, entry })),
    );
  const enabled = entries.filter(({ entry }) => isTrue(entry));
  return {
    enabled,
    missingIn: entries.length > 0 ? undefined : documents.find((document) => document.main),
  };
}

function openInViewFindings(
  documents: readonly ProfiledDocument[],
  occurrences: Occurrences,
): SpringFinding[] {
  const key = relaxKey(OPEN_IN_VIEW);
  const { enabled, missingIn } = openInViewSites(documents);
  if (enabled.length > 0) {
    return enabled.map(({ document, entry }) =>
      buildFinding({
        rule: OPEN_IN_VIEW_RULE,
        document,
        entry,
        key,
        message: OPEN_IN_VIEW_MESSAGE,
        occurrences,
      }),
    );
  }
  return missingIn === undefined
    ? []
    : [
        buildFinding({
          rule: OPEN_IN_VIEW_RULE,
          document: missingIn,
          key: `${key}:missing`,
          message: OPEN_IN_VIEW_MESSAGE,
          occurrences,
        }),
      ];
}

export function flaggedEntries(
  documents: readonly ProfiledDocument[],
  { exempt, problem, lists }: ConfigRule,
): FlaggedEntry[] {
  return documents
    .filter((document) => !exempt(document))
    .flatMap((document) =>
      document.entries
        .filter((entry) => lists || !entry.list)
        .map((entry): MaybeFlagged => ({
          document,
          entry,
          message: problem(entry, relaxKey(entry.key)),
        }))
        .filter((found): found is FlaggedEntry => found.message !== undefined)
        .filter(
          ({ entry }, index, found) =>
            found.findIndex((other) => sameLine(other.entry, entry)) === index,
        ),
    );
}

function entryFindings(
  documents: readonly ProfiledDocument[],
  spec: ConfigRule,
  occurrences: Occurrences,
): SpringFinding[] {
  return flaggedEntries(documents, spec).map(({ document, entry, message }) =>
    buildFinding({
      rule: spec.rule,
      document,
      entry,
      key: relaxKey(entry.key),
      message,
      occurrences,
    }),
  );
}

function sameLine(left: LineKey, right: LineKey): boolean {
  return left.line === right.line && relaxKey(left.key) === relaxKey(right.key);
}

function buildFinding({
  rule,
  document,
  entry,
  key,
  message,
  occurrences,
}: FindingSpec): SpringFinding {
  const occurrence = nextCount(occurrences, `${document.path}\0${rule}\0${key}`);
  return {
    tool: SPRING_TOOL,
    rule,
    path: document.path,
    identity: occurrence === 1 ? key : `${key}#${String(occurrence)}`,
    message: `${message} ${allowance(rule, document.path)}`,
    allowedForm: message,
    classification: 'enforceable',
    ...(entry === undefined ? {} : { location: { line: entry.line } }),
  };
}
