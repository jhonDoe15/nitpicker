import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../../filesystem.mjs';
import {
  hasGeneratorAnnotation,
  hasGeneratorHeader,
  readFileHead,
} from '../../../conventions/generator-marker.mjs';
import { DEFAULT_FEATURE_LAYOUT, featureRoles } from '../../../rules/features/feature-roles.mjs';

const CODE_FILE = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs|py|java|kts?)$/u;
const DECLARATION_FILE = /\.d\.ts$/u;
const TEST_FOLDERS = [
  'tests?',
  '__tests__',
  'e2e',
  'testing',
  'testdata',
  'fixtures?',
  '__fixtures__',
  '__mocks__',
  'androidTest',
  'integrationTest',
  'testFixtures',
];
const TEST_FOLDER = new RegExp(String.raw`(?:^|/)(?:${TEST_FOLDERS.join('|')})(?:/|$)`, 'u');
const TEST_NAME = new RegExp(
  [
    String.raw`\.(?:test|spec)\.[^/]+$`,
    String.raw`(?:^|/)(?:test_[^/]+\.py|[^/]+_test\.py|conftest\.py)$`,
    String.raw`(?:^|/)[^/]+(?:Tests?|IT|Spec)\.(?:java|kts?)$`,
  ].join('|'),
  'u',
);
const OUTPUT_FOLDERS = [
  'dist',
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
const OUTPUT_FOLDER = new RegExp(
  String.raw`(?:^|/)(?:${OUTPUT_FOLDERS.join('|')})(?:/|$)|^(?:build|out)/`,
  'u',
);
const GENERATED_NAME = new RegExp(
  [
    String.raw`\.(?:generated|gen|pb)\.[^/]+$`,
    String.raw`_pb2(?:_grpc)?\.pyi?$`,
    String.raw`_pb\.[^/]+$`,
  ].join('|'),
  'u',
);

function isUnderRoot(file, roots) {
  return roots.some((root) => file.startsWith(`${root.replace(/\/+$/u, '')}/`));
}

function isTestFile(file, testRoots = []) {
  return TEST_FOLDER.test(file) || TEST_NAME.test(file) || isUnderRoot(file, testRoots);
}

function isGeneratedPath(file) {
  return OUTPUT_FOLDER.test(file) || GENERATED_NAME.test(file);
}

function hasGeneratedHead(projectRoot, file) {
  const absolute = pathInside(projectRoot, file);
  if (absolute === undefined || !existsSync(absolute)) {
    return true;
  }
  const head = readFileHead(absolute);
  return hasGeneratorHeader(head) || hasGeneratorAnnotation(head);
}

function moduleFolder(file, roleOf) {
  const role = roleOf(file);
  if (role.kind === 'feature') {
    return role.directory;
  }
  const folder = path.posix.dirname(file);
  return folder === '.' ? undefined : folder;
}

export function moduleResolver({ projectRoot, files, policy = {} }) {
  const tracked = new Set(files);
  const generated = new Set(policy.generatedFiles ?? []);
  const testRoots = policy.layout?.testRoots ?? [];
  const roleOf = featureRoles({
    sharedRoots: [],
    featureRoots: policy.layout?.featureRoots ?? DEFAULT_FEATURE_LAYOUT.featureRoots,
  });
  const resolved = new Map();
  function resolve(file) {
    const production =
      tracked.has(file) &&
      CODE_FILE.test(file) &&
      !DECLARATION_FILE.test(file) &&
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
