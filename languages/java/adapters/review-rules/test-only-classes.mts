import { existsSync, readFileSync } from 'node:fs';
import { outerClass as untypedOuterClass } from '../../ingest/class-names.mjs';
import { parseJdeps } from '../metrics/java-coupling.mts';
import type { CouplingEdge } from '../metrics/java-coupling-types.mts';
import { exceptionText as untypedExceptionText } from '../../../../shared/rules/exceptions.mjs';
import {
  EXCEPTION_HINT,
  allowedForm as untypedAllowedForm,
  messageFields as untypedMessageFields,
} from '../../../../shared/policy.mjs';
import { pathInside as untypedPathInside } from './java-sources.mjs';
import { isNamedElsewhere, readProjectTexts, type TextProject } from './project-texts.mts';
import { readDeclarations } from './source-declarations.mts';
import { mainUsages, type Resolve, type UsageProject } from './test-only-usage.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import type { JavaFinding } from '../typed/java-values.mts';
import { completeProjects } from '../typed/complete-projects.mts';

type ReportProject = {
  readonly reportRoot: string;
  readonly qualifier: string;
  readonly sourceRoots: readonly string[];
  readonly kotlinSourceRoots?: readonly string[] | undefined;
  readonly resourceRoots?: readonly string[] | undefined;
};

type ReadProject = ReportProject &
  TextProject &
  UsageProject & {
    readonly publishes: boolean;
    readonly testEdges: readonly CouplingEdge[];
  };

type DeclaredProject = ReadProject & {
  readonly declarations: ReturnType<typeof readDeclarations>;
  readonly hasEntryPoint: boolean;
};

type Candidate = {
  readonly file: string;
  readonly className: string;
  readonly line: number;
};

type TestOnlyFinding = JavaFinding & { readonly location: { readonly line: number } };

const outerClass: (className: string) => string = untypedOuterClass;
const exceptionText: (rule: string, file: string) => string = untypedExceptionText;
const allowedForm: (text: string) => string = untypedAllowedForm;
const messageFields: (
  message: string,
  values: Readonly<Record<string, string>>,
) => Readonly<Record<string, unknown>> = untypedMessageFields;
const pathInside: (base: string, relative: string) => string = untypedPathInside;

const TEST_ONLY_TOOL = 'coupling';
const TEST_ONLY_RULE = 'test-only-export';
export const TEST_ONLY_EXCEPTION_RULE = `${TEST_ONLY_TOOL}/${TEST_ONLY_RULE}`;
const REPORTS = ['jdeps.txt', 'jdeps-classes.txt', 'jdeps-test.txt'];
const MESSAGE = `Class {name} is only used by tests. ${allowedForm('Move it to the test sources, or use it from production code.')} ${EXCEPTION_HINT}`;

function readProject(project: ReportProject): ReadProject {
  function report(name: string): string {
    return readFileSync(pathInside(project.reportRoot, name), 'utf8');
  }
  const manifestFile = pathInside(project.reportRoot, 'manifest.json');
  const manifest: unknown = existsSync(manifestFile)
    ? JSON.parse(readFileSync(manifestFile, 'utf8'))
    : {};
  return {
    ...project,
    kotlinSourceRoots: project.kotlinSourceRoots ?? [],
    resourceRoots: project.resourceRoots ?? [],
    publishes: fieldOf(manifest, 'published') === true,
    classes: report('jdeps-classes.txt').split(/\r?\n/u).filter(Boolean),
    mainEdges: parseJdeps(report('jdeps.txt')),
    testEdges: parseJdeps(report('jdeps-test.txt')),
  };
}

export function ownersOf(projects: readonly UsageProject[]): Map<string, string[]> {
  const declared = projects.flatMap(({ classes, qualifier }) =>
    [...new Set(classes.map(outerClass))].map((name) => ({ name, qualifier })),
  );
  return new Map(
    [...Map.groupBy(declared, ({ name }) => name)].map(([name, entries]) => [
      name,
      entries.map(({ qualifier }) => qualifier),
    ]),
  );
}

export function resolver(owners: ReadonlyMap<string, readonly string[]>): Resolve {
  return (target, qualifier) => {
    const found = owners.get(outerClass(target)) ?? [];
    if (found.includes(qualifier)) {
      return `${qualifier}\0${outerClass(target)}`;
    }
    return found.length === 1 ? `${String(found[0])}\0${outerClass(target)}` : undefined;
  };
}

function testUsages(projects: readonly ReadProject[], resolve: Resolve): Set<string> {
  return new Set(
    projects
      .flatMap((project) =>
        project.testEdges.map(({ target }) => resolve(target, project.qualifier)),
      )
      .filter((resolved) => resolved !== undefined),
  );
}

function withDeclarations(projectRoot: string, project: ReadProject): DeclaredProject {
  const declarations = readDeclarations(projectRoot, [
    ...project.sourceRoots,
    ...project.kotlinSourceRoots,
  ]);
  return {
    ...project,
    declarations,
    hasEntryPoint: [...declarations.values()].some(({ entryPoint }) => entryPoint),
  };
}

function finding({ file, className, line }: Candidate): TestOnlyFinding {
  const exception = exceptionText(TEST_ONLY_EXCEPTION_RULE, file);
  return {
    tool: TEST_ONLY_TOOL,
    rule: TEST_ONLY_RULE,
    path: file,
    identity: `class:${className}`,
    symbol: className,
    location: { line },
    ...messageFields(MESSAGE, { name: className, exception }),
    classification: 'enforceable',
  };
}

function candidates(projectRoot: string, read: readonly ReadProject[]): Candidate[] {
  const resolve = resolver(ownersOf(read));
  const { production, wired, applications } = mainUsages(read, resolve);
  const keys = [...testUsages(read, resolve)].filter(
    (key) => !(production.has(key) || wired.has(key)),
  );
  const involved = new Set(keys.map((key) => key.split('\0')[0]));
  const byQualifier = new Map(
    read
      .filter((project) => involved.has(project.qualifier))
      .map((project): [string, DeclaredProject] => [
        project.qualifier,
        withDeclarations(projectRoot, project),
      ]),
  );
  function isLibrary(project: DeclaredProject): boolean {
    return project.publishes && !project.hasEntryPoint && !applications.has(project.qualifier);
  }
  return keys
    .map((key) => ({
      project: byQualifier.get(key.split('\0')[0] ?? ''),
      className: key.split('\0')[1] ?? '',
    }))
    .filter(({ project }) => project === undefined || !isLibrary(project))
    .flatMap(({ project, className }) => {
      const declared = project?.declarations.get(className);
      return declared === undefined || declared.entryPoint
        ? []
        : [{ file: declared.file, className, line: declared.line }];
    });
}

export function readTestOnlyClassFindings(
  projectRoot: string,
  { projects }: { readonly projects: readonly ReportProject[] },
): TestOnlyFinding[] {
  const complete = completeProjects(projects, REPORTS);
  if (complete.length === 0) {
    return [];
  }
  const read = complete.map(readProject);
  const found = candidates(projectRoot, read);
  if (found.length === 0) {
    return [];
  }
  const texts = readProjectTexts(projectRoot, read);
  return found
    .filter((candidate) => !isNamedElsewhere(texts, candidate))
    .map(finding)
    .toSorted(
      (left, right) =>
        left.path.localeCompare(right.path) || left.location.line - right.location.line,
    );
}
