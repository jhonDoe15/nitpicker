import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Finding } from '../../../adapters/static-checks/shared.mts';
import { typescriptStructureProjectFindings } from '../project-findings.mts';
import { reuseFindings } from '../typed/rule-views.mts';
import {
  type PolicyInput,
  headPolicyEnvironment,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from './policy-views.mts';

export type ProjectFiles = Readonly<Record<string, string | { readonly link: string }>>;

type Environment = { readonly root: string; readonly environment: NodeJS.ProcessEnv };

export const WORKSPACE_POLICY = { layout: { sourceRoots: ['packages'] } };

export function workspaceFiles(files: ProjectFiles): ProjectFiles {
  return {
    'package.json': JSON.stringify({
      private: true,
      workspaces: ['packages/*'],
      dependencies: { react: '19.0.0', '@acme/ui': 'workspace:*' },
    }),
    'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', main: 'src/index.ts' }),
    'packages/web/package.json': JSON.stringify({ name: 'web' }),
    'node_modules/@acme/ui': { link: '../../packages/ui' },
    ...files,
  };
}

export function reactFiles(
  files: ProjectFiles,
  dependencies: Readonly<Record<string, string>> = { '@acme/ui': '1.0.0' },
): ProjectFiles {
  const manifest = JSON.stringify({ dependencies: { react: '19.0.0', ...dependencies } });
  return { 'package.json': manifest, ...files };
}

function withFiles<Result>(files: ProjectFiles, operation: (root: string) => Result): Result {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-reuse-'));
  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
      if (typeof text === 'string') writeFileSync(path.join(root, file), text);
      else symlinkSync(text.link, path.join(root, file));
    }
    return operation(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function withProject<Result>(
  files: ProjectFiles,
  policy: PolicyInput,
  operation: (environment: Environment) => Result,
): Result {
  return withFiles(files, (root) =>
    withHeadPolicyFile(policy, (policyFile) =>
      operation({ root, environment: headPolicyEnvironment(policyFile) }),
    ),
  );
}

export function findingsOf(files: ProjectFiles, policy: PolicyInput = {}): Finding[] {
  return withProject(files, policy, ({ root, environment }) =>
    reuseFindings({ projectRoot: root, analyzerName: 'structure' }, environment),
  );
}

export function ruleFindings(
  rule: string,
): (files: ProjectFiles, policy?: PolicyInput) => Finding[] {
  return (files, policy) => findingsOf(files, policy).filter((finding) => finding.rule === rule);
}

export function bothSides(
  baseFiles: ProjectFiles,
  headFiles: ProjectFiles,
  config: PolicyInput = {},
): { head: Finding[]; base: Finding[] } {
  return withFiles(headFiles, (headRoot) => {
    const policy = resolveHeadPolicy(config, headRoot);
    function run(root: string): Finding[] {
      return withHeadPolicyFile(policy, (policyFile) =>
        reuseFindings(
          { projectRoot: root, analyzerName: 'structure' },
          headPolicyEnvironment(policyFile),
        ),
      );
    }
    return { head: run(headRoot), base: withFiles(baseFiles, run) };
  });
}

export function changeFindings(
  baseFiles: ProjectFiles,
  headFiles: ProjectFiles,
  {
    config = {},
    baselinePaths,
  }: { config?: PolicyInput; baselinePaths?: Map<string, string> } = {},
): Finding[] {
  return withFiles(headFiles, (headRoot) =>
    withFiles(baseFiles, (baselineRoot) =>
      withHeadPolicyFile(resolveHeadPolicy(config, headRoot), (policyFile) =>
        reuseFindings(
          { projectRoot: headRoot, analyzerName: 'structure', baselineRoot, baselinePaths },
          headPolicyEnvironment(policyFile),
        ),
      ),
    ),
  );
}

export function projectChangeFindings(
  baseFiles: ProjectFiles,
  headFiles: ProjectFiles,
  snapshot: string,
): Finding[] {
  return withFiles(headFiles, (projectRoot) =>
    withFiles(baseFiles, (baselineRoot) =>
      withHeadPolicyFile(resolveHeadPolicy({}, projectRoot), (policyFile) =>
        typescriptStructureProjectFindings(
          { projectRoot, baselineRoot, analyzerName: 'structure', snapshot },
          headPolicyEnvironment(policyFile),
        ),
      ),
    ),
  );
}

export function newFindings({ base, head }: { base: Finding[]; head: Finding[] }): Finding[] {
  const known = new Set(base.map(identityOf));
  return head.filter((finding) => !known.has(identityOf(finding)));
}

function identityOf({ rule, path: findingPath, identity }: Finding): string {
  return `${rule}\0${findingPath}\0${identity}`;
}

export function rows(findings: readonly Finding[]): string[][] {
  return findings.map(({ rule, path: findingPath, identity }) => [rule, findingPath, identity]);
}

export function exceptionFor(rule: string, file: string): string {
  return JSON.stringify({ rule, paths: [file], reason: '...' });
}

export function usesValues(...names: string[]): string {
  return `void [${names.join(', ')}];\n`;
}

export function usesTypes(...names: string[]): string {
  return `declare const typeProbe: [${names.join(', ')}];\n`;
}

export function source(...lines: string[]): string {
  return `${lines.join('\n')}\n`;
}
