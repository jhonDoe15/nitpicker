import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../filesystem.mts';
import {
  hasGeneratorAnnotation,
  hasGeneratorHeader,
  readFileHead,
} from '../../../conventions/generated/generator-marker.mts';
import { featureLayout, featureRoles } from '../../../rules/features/feature-roles.mts';
import type { HistoryPolicy, ModuleOf } from '../../typed/history-types.mts';

type RoleOf = (file: string) => { readonly kind: string; readonly directory?: string };

const FOLDER_MEMBER = 'module';
const CODE_FILE = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs|py|java|kts?|go)$/u;
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const BUILD_FILE = new RegExp(
  [
    String.raw`(?:^|/)[^/]+\.gradle(?:\.kts)?$`,
    String.raw`(?:^|/)[^/]+\.config\.[cm]?[jt]s$`,
    String.raw`(?:^|/)\.[^/]*rc\.[cm]?js$`,
    String.raw`(?:^|/)(?:setup|conftest)\.py$`,
  ].join('|'),
  'u',
);
const TEST_FOLDERS = [
  'tests?',
  '__tests__',
  'e2e',
  'testdata',
  '__fixtures__',
  '__mocks__',
  'androidTest',
  'integrationTest',
  'testFixtures',
];
const TEST_FOLDER = new RegExp(String.raw`(?:^|/)(?:${TEST_FOLDERS.join('|')})(?:/|$)`, 'u');
const TEST_SOURCE_SET = /(?:^|\/)src\/(?:tests?|[a-z]\w*Tests?|test[A-Z]\w*)\//u;
const ROOT_TEST_SUPPORT = /^(?:fixtures?|testing)\//u;
const JVM_MAIN_SOURCE_SET = /(?:^|\/)src\/main\//u;
const TEST_NAME = new RegExp(
  [
    String.raw`\.(?:test|spec)\.[^/]+$`,
    String.raw`(?:^|/)(?:test_[^/]+\.py|[^/]+_test\.py|tests\.py|conftest\.py)$`,
    String.raw`(?:^|/)[^/]+(?:Tests?|IT|Spec)\.(?:java|kts?)$`,
    String.raw`_test\.go$`,
  ].join('|'),
  'u',
);
const OUTPUT_FOLDERS = [
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'generated',
  '__generated__',
  'node_modules',
  'vendor',
  'site-packages',
  'venv',
  String.raw`\.venv`,
  String.raw`\.gradle`,
];
const OUTPUT_FOLDER = new RegExp(String.raw`(?:^|/)(?:${OUTPUT_FOLDERS.join('|')})(?:/|$)`, 'u');
const GENERATED_NAME = new RegExp(
  [
    String.raw`\.(?:generated|gen|pb)\.[^/]+$`,
    String.raw`_pb2(?:_grpc)?\.pyi?$`,
    String.raw`_pb\.[^/]+$`,
  ].join('|'),
  'u',
);

function isUnderRoot(file: string, roots: readonly string[]): boolean {
  return roots.some((root) => file.startsWith(`${root.replace(/\/+$/u, '')}/`));
}

function isInTestFolder(file: string): boolean {
  if (JVM_MAIN_SOURCE_SET.test(file)) {
    return false;
  }
  return TEST_FOLDER.test(file) || TEST_SOURCE_SET.test(file) || ROOT_TEST_SUPPORT.test(file);
}

function isTestFile(file: string, testRoots: readonly string[]): boolean {
  return isUnderRoot(file, testRoots) || TEST_NAME.test(file) || isInTestFolder(file);
}

function isGeneratedPath(file: string): boolean {
  return OUTPUT_FOLDER.test(file) || GENERATED_NAME.test(file);
}

function hasGeneratedHead(projectRoot: string, file: string): boolean {
  const absolute = pathInside(projectRoot, file);
  if (absolute === undefined || !existsSync(absolute)) {
    return false;
  }
  const head = readFileHead(absolute);
  return hasGeneratorHeader(head) || hasGeneratorAnnotation(head);
}

function moduleFolder(file: string, roleOf: RoleOf): string | undefined {
  const role = roleOf(file);
  if (role.kind === 'feature') {
    return role.directory;
  }
  const folder = path.posix.dirname(file);
  return folder === '.' ? undefined : folder;
}

function isProductionCode(file: string): boolean {
  return CODE_FILE.test(file) && !DECLARATION_FILE.test(file) && !BUILD_FILE.test(file);
}

function moduleRoles(policy: HistoryPolicy): RoleOf {
  return featureRoles({
    sharedRoots: [],
    featureRoots: featureLayout(policy.layout).featureRoots,
  });
}

export function folderModuleResolver(policy: HistoryPolicy = {}): ModuleOf {
  const roleOf = moduleRoles(policy);
  return (folder) => moduleFolder(`${folder}/${FOLDER_MEMBER}`, roleOf);
}

export function moduleResolver({
  projectRoot,
  files,
  policy = {},
}: {
  readonly projectRoot: string;
  readonly files: readonly string[];
  readonly policy?: HistoryPolicy;
}): ModuleOf {
  const tracked = new Set(files);
  const generated = new Set(policy.generatedFiles ?? []);
  const testRoots = policy.layout?.testRoots ?? [];
  const roleOf = moduleRoles(policy);
  const resolved = new Map<string, string | undefined>();
  function resolve(file: string): string | undefined {
    const production =
      tracked.has(file) &&
      isProductionCode(file) &&
      !isTestFile(file, testRoots) &&
      !isGeneratedPath(file) &&
      !generated.has(file) &&
      !hasGeneratedHead(projectRoot, file);
    return production ? moduleFolder(file, roleOf) : undefined;
  }
  return (file) => {
    if (!resolved.has(file)) {
      resolved.set(file, resolve(file));
    }
    return resolved.get(file);
  };
}
