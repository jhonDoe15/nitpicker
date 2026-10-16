import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  headPolicyEnvironment,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from '../../head-policy.mjs';
import { reuseFindings } from '../reuse/reuse-findings.mjs';

export const WORKSPACE_POLICY = { layout: { sourceRoots: ['packages'] } };

export function workspaceFiles(files) {
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

export function reactFiles(files, dependencies = { '@acme/ui': '1.0.0' }) {
  const manifest = JSON.stringify({ dependencies: { react: '19.0.0', ...dependencies } });
  return { 'package.json': manifest, ...files };
}

function withFiles(files, operation) {
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

function withProject(files, policy, operation) {
  return withFiles(files, (root) =>
    withHeadPolicyFile(policy, (policyFile) =>
      operation({ root, environment: headPolicyEnvironment(policyFile) }),
    ),
  );
}

export function findingsOf(files, policy = {}) {
  return withProject(files, policy, ({ root, environment }) =>
    reuseFindings(root, 'structure', environment),
  );
}

export function ruleFindings(rule) {
  return (files, policy) => findingsOf(files, policy).filter((finding) => finding.rule === rule);
}

export function bothSides(baseFiles, headFiles, config = {}) {
  return withFiles(headFiles, (headRoot) => {
    const policy = resolveHeadPolicy(config, headRoot);
    function run(root) {
      return withHeadPolicyFile(policy, (policyFile) =>
        reuseFindings(root, 'structure', headPolicyEnvironment(policyFile)),
      );
    }
    return { head: run(headRoot), base: withFiles(baseFiles, run) };
  });
}

export function newFindings({ base, head }) {
  const known = new Set(base.map(identityOf));
  return head.filter((finding) => !known.has(identityOf(finding)));
}

function identityOf({ rule, path: findingPath, identity }) {
  return `${rule}\0${findingPath}\0${identity}`;
}

export function rows(findings) {
  return findings.map(({ rule, path: findingPath, identity }) => [rule, findingPath, identity]);
}

export function exceptionFor(rule, file) {
  return JSON.stringify({ rule, paths: [file], reason: '<why this is intended>' });
}

export function usesValues(...names) {
  return `void [${names.join(', ')}];\n`;
}

export function usesTypes(...names) {
  return `declare const typeProbe: [${names.join(', ')}];\n`;
}

export function source(...lines) {
  return `${lines.join('\n')}\n`;
}
