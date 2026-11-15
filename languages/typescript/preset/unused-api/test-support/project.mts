import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Finding } from '../../../../../shared/values/findings.mts';
import {
  withHeadPolicyFile as untypedWithHeadPolicyFile,
  headPolicyEnvironment as untypedHeadPolicyEnvironment,
} from '../../head-policy.mjs';
import { resolveLayoutFor as untypedResolveLayoutFor } from '../../layout.mjs';
import { layoutTransformFor as untypedLayoutTransformFor } from '../../tool-configs.mjs';
import { analyzeUnusedApi } from '../analyze.mts';

type Files = Readonly<Record<string, unknown>>;
type Policy = Readonly<Record<string, unknown>>;
type Transform = (text: string, targetPath: string) => string;

const withHeadPolicyFile: <T>(policy: Policy, operation: (policyFile: string) => T) => T =
  untypedWithHeadPolicyFile;
const headPolicyEnvironment: (policyFile: string) => NodeJS.ProcessEnv =
  untypedHeadPolicyEnvironment;
const resolveLayoutFor: (policy: Policy) => unknown = untypedResolveLayoutFor;
const layoutTransformFor: (policyFileName: string, layout: unknown) => Transform | undefined =
  untypedLayoutTransformFor;

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const TYPESCRIPT_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';
const PRIVATE_APP = { name: 'app', private: true, dependencies: { react: '19.2.0' } };

function writeFiles(root: string, files: Files): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), typeof text === 'string' ? text : JSON.stringify(text));
  }
}

export function createProject(
  files: Files,
  { manifest = PRIVATE_APP }: { manifest?: unknown } = {},
): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-unused-api-'));
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  writeFiles(root, { 'package.json': manifest, ...files });
  return root;
}

export function removeProject(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

export function analyzeProject(
  root: string,
  policy: Policy = {},
  { configSource }: { configSource?: string } = {},
): Finding[] {
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

export function summarize(findings: readonly Finding[]): string[] {
  return findings.map(({ rule, path: file, symbol }) => `${rule} ${file} ${String(symbol)}`);
}

export function analyzeFiles(
  files: Files,
  { manifest, policy }: { manifest?: unknown; policy?: Policy } = {},
): Finding[] {
  const root = createProject(files, { manifest });
  try {
    return analyzeProject(root, policy);
  } finally {
    removeProject(root);
  }
}

export function findingsIn(findings: readonly Finding[], folder: string): string[] {
  return summarize(findings.filter(({ path: file }) => file.startsWith(`${folder}/`)));
}
