import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { policyDigest, policyFindings } from '../../diff/reporting/review/policy-findings.mjs';
import { gitBlobId } from '../../policy-changes/policy-scope.mjs';
import { isInside } from '../discovery/repository-files.mjs';
import { DECLARATION_FILES } from '../plan/enclosing.mjs';

function inside(root, file) {
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`${file} is outside ${root}`);
  }
  return full;
}

function declarationFiles(root) {
  return DECLARATION_FILES.filter((file) => existsSync(inside(root, file)));
}

function splitLoosening(basePlan, files) {
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
}) {
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

export function projectsToolError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    tool: 'nitpicker-projects',
    snapshot: 'base',
    message: `the projects of the base could not be read, so a change to them is not checked: ${message}`,
  };
}

export function asProjectLoosenings(loosenings, root) {
  return loosenings.map(({ text, key, files }) => ({
    text,
    key,
    files: [],
    evidence: files.map((file) => [
      `repository:${file}`,
      gitBlobId(readFileSync(inside(root, file))),
    ]),
  }));
}

function checkedPolicy({ loosenings, root, acceptedDigest }) {
  const files = [...new Set(loosenings.flatMap((entry) => entry.files))].toSorted();
  const digest = policyDigest({
    loosenings: loosenings.map(({ key }) => key),
    files: files.map((file) => [file, gitBlobId(readFileSync(inside(root, file)))]),
  });
  const texts = loosenings.map(({ text }) => text);
  const findings = policyFindings(texts, digest, { acceptedDigest });
  return {
    policyLoosenings: texts,
    policyDigest: digest,
    accepted: findings.length === 0,
    findings,
  };
}

export function repositoryPolicy({ loosenings, root, acceptedDigest, toolErrors = [] }) {
  if (loosenings.length === 0 && toolErrors.length === 0) {
    return undefined;
  }
  const checked =
    loosenings.length === 0
      ? { policyLoosenings: [], accepted: true, findings: [] }
      : checkedPolicy({ loosenings, root, acceptedDigest });
  return toolErrors.length === 0 ? checked : { ...checked, toolErrors };
}
