import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { headPolicyEnvironment, withHeadPolicyFile } from '../../head-policy.mjs';
import { resolveLayoutFor } from '../../layout.mjs';
import { layoutTransformFor } from '../../tool-configs.mjs';
import { analyzeDesignSignals, projectDesignFacts } from '../analyze.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const fixtureRoot = path.resolve(import.meta.dirname, '../../fixtures');
const TYPESCRIPT_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';
const PRIVATE_PACKAGE = { name: 'fixture', private: true };

function insideRoot(root, name) {
  const full = path.resolve(root, name);
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${name} leaves the project`);
  }
  return full;
}

function writeFiles(root, files) {
  for (const [name, text] of Object.entries(files)) {
    const full = insideRoot(root, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, typeof text === 'string' ? text : JSON.stringify(text));
  }
}

export function createProject({ fixture, files = {}, manifest = PRIVATE_PACKAGE }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-'));
  if (fixture !== undefined) {
    cpSync(insideRoot(fixtureRoot, `design-${fixture}`), root, { recursive: true });
  }
  writeFiles(root, { 'package.json': manifest, ...files });
  return root;
}

export function removeProject(root) {
  rmSync(root, { recursive: true, force: true });
}

function withProject(root, policy, run) {
  const fullPolicy = { exclude: [], layout: {}, exceptions: [], thresholds: {}, ...policy };
  return withHeadPolicyFile(fullPolicy, (policyFile) => {
    const configPath = path.join(root, '.nitpicker-test-tsconfig.json');
    const transform = layoutTransformFor(TYPESCRIPT_CONFIG, resolveLayoutFor(fullPolicy));
    const source = readFileSync(path.join(packageRoot, TYPESCRIPT_CONFIG), 'utf8');
    writeFileSync(configPath, transform?.(source, configPath) ?? source);
    return run({ projectRoot: root, configPath, environment: headPolicyEnvironment(policyFile) });
  });
}

export function factsOf(root, policy = {}) {
  return withProject(root, policy, projectDesignFacts);
}

export function findingsOf(root, policy = {}) {
  return withProject(root, policy, (options) =>
    analyzeDesignSignals({ ...options, analyzerName: 'structure' }),
  );
}

export function factsOfFixture(fixture, options = {}) {
  const root = createProject({ fixture, ...options });
  try {
    return factsOf(root, options.policy);
  } finally {
    removeProject(root);
  }
}

export function factsOfFiles(files, options = {}) {
  const root = createProject({ files, manifest: options.manifest });
  try {
    return factsOf(root, options.policy);
  } finally {
    removeProject(root);
  }
}

export function findingsOfFiles(files, policy = {}) {
  const root = createProject({ files });
  try {
    return findingsOf(root, policy);
  } finally {
    removeProject(root);
  }
}

export function byId(items, id) {
  return items.find((item) => item.id === id);
}
