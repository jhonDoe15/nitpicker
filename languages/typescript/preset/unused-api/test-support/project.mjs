import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withHeadPolicyFile, headPolicyEnvironment } from '../../head-policy.mjs';
import { resolveLayoutFor } from '../../layout.mjs';
import { layoutTransformFor } from '../../tool-configs.mjs';
import { analyzeUnusedApi } from '../analyze.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const TYPESCRIPT_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';
const PRIVATE_APP = { name: 'app', private: true, dependencies: { react: '19.2.0' } };

function writeFiles(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), typeof text === 'string' ? text : JSON.stringify(text));
  }
}

export function createProject(files, { manifest = PRIVATE_APP } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-unused-api-'));
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  writeFiles(root, { 'package.json': manifest, ...files });
  return root;
}

export function removeProject(root) {
  rmSync(root, { recursive: true, force: true });
}

export function analyzeProject(root, policy = {}, { configSource } = {}) {
  const fullPolicy = {
    exclude: [],
    layout: {},
    exceptions: [],
    thresholds: {},
    react: { enabled: true },
    ...policy,
  };
  return withHeadPolicyFile(fullPolicy, (policyFile) => {
    const environment = headPolicyEnvironment(policyFile);
    const configPath = path.join(root, '.nitpicker-test-tsconfig.json');
    const transform = layoutTransformFor(TYPESCRIPT_CONFIG, resolveLayoutFor(fullPolicy));
    const source = readFileSync(path.join(packageRoot, TYPESCRIPT_CONFIG), 'utf8');
    writeFileSync(configPath, configSource ?? transform?.(source, configPath) ?? source);
    return analyzeUnusedApi({
      projectRoot: root,
      configPath,
      analyzerName: 'structure',
      environment,
    });
  });
}

export function summarize(findings) {
  return findings.map(({ rule, path: file, symbol }) => `${rule} ${file} ${symbol}`);
}

/** Analyzes a throwaway project once; integration tests share the result across their cases. */
export function analyzeFiles(files, { manifest, policy } = {}) {
  const root = createProject(files, { manifest });
  try {
    return analyzeProject(root, policy);
  } finally {
    removeProject(root);
  }
}

/** The summarized findings of one case folder (`src/<case>/`). */
export function findingsIn(findings, folder) {
  return summarize(findings.filter(({ path: file }) => file.startsWith(`${folder}/`)));
}
