import { existsSync, readFileSync } from 'node:fs';
import { containedPath } from '../../../shared/paths/contained-path.mjs';
import { policyDigest, policyFindings } from '../../diff/reporting/review/policy-findings.mts';
import { runGit } from '../../diff/git/repository/command.mjs';
import { captureWorkingTree } from '../../diff/git/repository/git.mjs';
import { gitBlobId } from '../../policy-changes/policy-scope.mts';
import { isInside } from '../discovery/repository-files.mjs';
import { DECLARATION_FILES } from '../plan/enclosing.mts';
import { byText } from '../../../shared/text-order/by-text.mjs';
import type { MonorepoPlan, RepositoryPolicy } from '../project-types.mts';
import type { ReportEntry } from '../../../shared/values/findings.mts';

export type Loosening = {
  readonly text: string;
  readonly key: string;
  readonly files: readonly string[];
};
export type ProjectLoosening = Loosening & { readonly evidence: readonly (readonly string[])[] };
type SetQuery = {
  readonly basePlan: MonorepoPlan | undefined;
  readonly headPlan: MonorepoPlan | undefined;
  readonly root: string;
  readonly headFiles: readonly string[];
  readonly reappeared?: ReadonlySet<string>;
};
type PolicyQuery = {
  readonly loosenings: readonly Loosening[];
  readonly root: string;
  readonly acceptedDigest: string | undefined;
  readonly toolErrors?: readonly ReportEntry[];
};

const digestOf: (input: {
  readonly loosenings: readonly string[];
  readonly files: readonly (readonly string[])[];
}) => string = policyDigest;
const findingsOf: (
  loosenings: readonly string[],
  digest: string,
  options: { readonly acceptedDigest: string | undefined; readonly headSha: string | undefined },
) => readonly ReportEntry[] = policyFindings;
const blobIdOf: (content: Buffer) => string = gitBlobId;
const capturedTree: (root: string, headSha: string) => string = captureWorkingTree;

const containedIn: (
  root: string,
  relative: string,
  options: { readonly outside: (file: string) => string },
) => string = containedPath;

function inside(root: string, file: string): string {
  return containedIn(root, file, { outside: (relative) => `${relative} is outside ${root}` });
}

function declarationFiles(root: string): string[] {
  const files: readonly string[] = DECLARATION_FILES;
  return files.filter((file) => existsSync(inside(root, file)));
}

function splitLoosening(basePlan: MonorepoPlan, files: readonly string[]): Loosening[] {
  const listed = basePlan.projects.filter(({ path: folder }) => folder !== '.');
  if (listed.length === 0) {
    return [];
  }
  const names = listed.map(({ path: folder }) => folder).join(', ');
  return [
    {
      text:
        `the repository is no longer split into projects: ${names} were gated as projects of ` +
        'their own and are now part of one project',
      key: `projects: one project instead of ${names}`,
      files,
    },
  ];
}

export function projectSetLoosenings({
  basePlan,
  headPlan,
  root,
  headFiles,
  reappeared = new Set(),
}: SetQuery): Loosening[] {
  if (basePlan === undefined) {
    return [];
  }
  const files = declarationFiles(root);
  if (headPlan === undefined) {
    return splitLoosening(basePlan, files);
  }
  const current = new Set(headPlan.projects.map(({ path: folder }) => folder));
  return basePlan.projects
    .filter(({ path: folder }) => !current.has(folder))
    .filter(
      ({ path: folder }) =>
        reappeared.has(folder) || headFiles.some((file) => isInside(file, folder)),
    )
    .map(({ path: folder }) => ({
      text:
        `project ${folder} is no longer one of the projects of the monorepo, ` +
        'so nothing gates it with its own config',
      key: `projects: removed ${folder}`,
      files,
    }));
}

export function projectsToolError(error: unknown): ReportEntry {
  const message = error instanceof Error ? error.message : String(error);
  return {
    tool: 'nitpicker-projects',
    snapshot: 'base',
    message: `the projects of the base could not be read, so a change to them is not checked: ${message}`,
  };
}

export function asProjectLoosenings(
  loosenings: readonly Loosening[],
  root: string,
): ProjectLoosening[] {
  return loosenings.map(({ text, key, files }) => ({
    text,
    key,
    files: [],
    evidence: files.map((file) => [
      `repository:${file}`,
      blobIdOf(readFileSync(inside(root, file))),
    ]),
  }));
}

function gatedHead(root: string, acceptedDigest: string | undefined): string | undefined {
  if (acceptedDigest === undefined) {
    return undefined;
  }
  return capturedTree(root, runGit(root, ['rev-parse', 'HEAD^{commit}']).trim());
}

function checkedPolicy({ loosenings, root, acceptedDigest }: PolicyQuery): RepositoryPolicy {
  const files = [...new Set(loosenings.flatMap((entry) => entry.files))].toSorted(byText);
  const digest = digestOf({
    loosenings: loosenings.map(({ key }) => key),
    files: files.map((file) => [file, blobIdOf(readFileSync(inside(root, file)))]),
  });
  const texts = loosenings.map(({ text }) => text);
  const headSha = gatedHead(root, acceptedDigest);
  const findings = findingsOf(texts, digest, { acceptedDigest, headSha });
  return {
    policyLoosenings: texts,
    policyDigest: digest,
    accepted: findings.length === 0,
    findings,
  };
}

export function repositoryPolicy({
  loosenings,
  root,
  acceptedDigest,
  toolErrors = [],
}: PolicyQuery): RepositoryPolicy | undefined {
  if (loosenings.length === 0 && toolErrors.length === 0) {
    return undefined;
  }
  const checked: RepositoryPolicy =
    loosenings.length === 0
      ? { policyLoosenings: [], accepted: true, findings: [] }
      : checkedPolicy({ loosenings, root, acceptedDigest });
  return toolErrors.length === 0 ? checked : { ...checked, toolErrors };
}
