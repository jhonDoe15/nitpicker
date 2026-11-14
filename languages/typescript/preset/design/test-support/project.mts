import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Finding } from '../../../../../shared/values/findings.mts';
import {
  headPolicyEnvironment as untypedHeadPolicyEnvironment,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../../head-policy.mjs';
import { resolveLayoutFor as untypedResolveLayoutFor } from '../../layout.mjs';
import { layoutTransformFor as untypedLayoutTransformFor } from '../../tool-configs.mjs';
import { analyzeDesignSignals, projectDesignFacts } from '../analyze.mts';
import type { DesignFacts } from '../design-types.mts';

type Files = Readonly<Record<string, unknown>>;
type Policy = Readonly<Record<string, unknown>>;
type Transform = (text: string, targetPath: string) => string;
type ProjectOptions = {
  projectRoot: string;
  configPath: string;
  environment: NodeJS.ProcessEnv;
};

const withHeadPolicyFile: <T>(policy: Policy, operation: (policyFile: string) => T) => T =
  untypedWithHeadPolicyFile;
const headPolicyEnvironment: (policyFile: string) => NodeJS.ProcessEnv =
  untypedHeadPolicyEnvironment;
const resolveLayoutFor: (policy: Policy) => unknown = untypedResolveLayoutFor;
const layoutTransformFor: (policyFileName: string, layout: unknown) => Transform | undefined =
  untypedLayoutTransformFor;

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const fixtureRoot = path.resolve(import.meta.dirname, '../../fixtures');
const TYPESCRIPT_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';
const PRIVATE_PACKAGE = { name: 'fixture', private: true };

function insideRoot(root: string, name: string): string {
  const full = path.resolve(root, name);
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${name} leaves the project`);
  }
  return full;
}

function writeFiles(root: string, files: Files): void {
  for (const [name, text] of Object.entries(files)) {
    const full = insideRoot(root, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, typeof text === 'string' ? text : JSON.stringify(text));
  }
}

export function createProject({
  fixture,
  files = {},
  manifest = PRIVATE_PACKAGE,
}: {
  fixture?: string;
  files?: Files;
  manifest?: unknown;
}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-'));
  if (fixture !== undefined) {
    cpSync(insideRoot(fixtureRoot, `design-${fixture}`), root, { recursive: true });
  }
  writeFiles(root, { 'package.json': manifest, ...files });
  return root;
}

export type ProjectFacts = DesignFacts;

export function removeProject(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

function withProject<T>(root: string, policy: Policy, run: (options: ProjectOptions) => T): T {
  const fullPolicy = { exclude: [], layout: {}, exceptions: [], thresholds: {}, ...policy };
  return withHeadPolicyFile(fullPolicy, (policyFile) => {
    const configPath = path.join(root, '.nitpicker-test-tsconfig.json');
    const transform = layoutTransformFor(TYPESCRIPT_CONFIG, resolveLayoutFor(fullPolicy));
    const source = readFileSync(path.join(packageRoot, TYPESCRIPT_CONFIG), 'utf8');
    writeFileSync(configPath, transform?.(source, configPath) ?? source);
    return run({ projectRoot: root, configPath, environment: headPolicyEnvironment(policyFile) });
  });
}

export function factsOf(root: string, policy: Policy = {}): ProjectFacts {
  return withProject(root, policy, projectDesignFacts);
}

export function findingsOf(root: string, policy: Policy = {}): Finding[] {
  return withProject(root, policy, (options) =>
    analyzeDesignSignals({ ...options, analyzerName: 'structure' }),
  );
}

export function factsOfFixture(
  fixture: string,
  options: { files?: Files; manifest?: unknown; policy?: Policy } = {},
): ProjectFacts {
  const root = createProject({ fixture, ...options });
  try {
    return factsOf(root, options.policy);
  } finally {
    removeProject(root);
  }
}

export function factsOfFiles(
  files: Files,
  options: { manifest?: unknown; policy?: Policy } = {},
): ProjectFacts {
  const root = createProject({ files, manifest: options.manifest });
  try {
    return factsOf(root, options.policy);
  } finally {
    removeProject(root);
  }
}

export function findingsOfFiles(files: Files, policy: Policy = {}): Finding[] {
  const root = createProject({ files });
  try {
    return findingsOf(root, policy);
  } finally {
    removeProject(root);
  }
}

export function byId<T extends { readonly id: string }>(items: readonly T[], id: string): T {
  const found = items.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`no fact with id ${id}`);
  }
  return found;
}
