import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanImports } from '../../../adapters/analysis/python-coupling.mjs';
import { testFileMatcher } from '../../../adapters/analysis/python-sources.mjs';
import {
  readDependencyFindings,
  scanDependencies,
} from '../../../adapters/dependencies/dependency-findings.mjs';
import { run } from '../../../adapters/execution/python-process.mjs';

const RULES = new Set([
  'unused-dependency',
  'unlisted-dependency',
  'no-dev-dependency-in-production',
]);
const VERSIONS_SCRIPT = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  'distribution_versions.py',
);
const VERSIONS_REQUEST = 'distribution-versions-request.json';
const UNLISTED = 'unlisted:';
const REQUIRES_PYTHON = /^requires-python\s*=\s*["']([^"']+)["']/mu;

function requiresPython(projectRoot) {
  const manifest = path.join(projectRoot, 'pyproject.toml');
  return existsSync(manifest)
    ? REQUIRES_PYTHON.exec(readFileSync(manifest, 'utf8'))?.[1]
    : undefined;
}

export function installedVersions(context, findings) {
  const names = [
    ...new Set(
      findings
        .filter(({ identity }) => identity.startsWith(UNLISTED))
        .map(({ identity }) => identity.slice(UNLISTED.length)),
    ),
  ];
  if (names.length === 0) {
    return {};
  }
  const request = path.join(context.reportRoot, VERSIONS_REQUEST);
  writeFileSync(
    request,
    JSON.stringify({ names, requiresPython: requiresPython(context.projectRoot) }),
  );
  const result = run(context, ['python', '-I', VERSIONS_SCRIPT, request], {
    rule: 'dependency-versions-failed',
  });
  return JSON.parse(result.stdout);
}

export function dependencyInputs(context) {
  const { projectRoot, reportRoot } = context;
  scanImports(context, run);
  scanDependencies(context, run);
  const isTest = testFileMatcher(projectRoot);
  const findings = readDependencyFindings({ reportRoot, projectRoot, snapshot: 'head' })
    .filter(({ rule }) => RULES.has(rule))
    .map((finding) => ({ ...finding, test: isTest(finding.path) }));
  return { findings, versions: installedVersions(context, findings) };
}
