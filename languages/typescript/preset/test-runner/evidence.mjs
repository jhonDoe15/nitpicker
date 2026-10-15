import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG_FILES = new Map([
  ['vitest', /^vitest\.config\.[cm]?[jt]s$/u],
  ['jest', /^jest\.config\.(?:[cm]?[jt]s|json)$/u],
]);
const DEPENDENCIES = new Map([
  ['vitest', 'vitest'],
  ['jest', 'jest'],
]);
const SCRIPT_COMMANDS = new Map([
  ['vitest', /(?<![\w-])vitest(?![\w-])/u],
  ['jest', /(?<![\w-])jest(?![\w-])/u],
  ['node-test', /(?<![\w-])(?:node|tsx)\b[^&|;]*\s--test(?=\s|$)/u],
]);
const TEST_SCRIPT_NAME = /^test(?::|$)/u;
const NODE_TEST_IMPORT =
  /(?:^|\n)[ \t]*(?:import\b[^'";\n]*?\bfrom\s*|import\s*|(?:const|let|var)\b[^=;\n]*=\s*require\()\s*['"]node:test['"]/u;
const OTHER_RUNNER_IMPORT = /(?:from\s*|require\()\s*['"](?:vitest|@jest\/globals)['"]/u;
const MAX_SCANNED_BYTES = 200_000;

function parseManifest(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${manifestPath} is not valid JSON`, { cause: error });
  }
}

export function readManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, 'package.json');
  if (!existsSync(manifestPath)) {
    return {};
  }
  const manifest = parseManifest(manifestPath);
  return typeof manifest === 'object' && manifest !== null ? manifest : {};
}

function dependencyNames(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
}

export function testScripts(manifest) {
  return Object.entries(manifest.scripts ?? {}).filter(
    ([name, command]) => TEST_SCRIPT_NAME.test(name) && typeof command === 'string',
  );
}

function manifestEvidence(runner, manifest) {
  const reasons = [];
  if (DEPENDENCIES.has(runner) && dependencyNames(manifest).has(DEPENDENCIES.get(runner))) {
    reasons.push(`"${DEPENDENCIES.get(runner)}" in package.json dependencies`);
  }
  if (runner === 'jest' && manifest.jest !== undefined) {
    reasons.push('"jest" key in package.json');
  }
  return reasons;
}

function fileEvidence(runner, fileNames) {
  const pattern = CONFIG_FILES.get(runner);
  return pattern === undefined ? [] : fileNames.filter((name) => pattern.test(name));
}

export function scriptEvidence(runner, manifest) {
  return testScripts(manifest)
    .filter(([, command]) => SCRIPT_COMMANDS.get(runner).test(command))
    .map(([name]) => `script "${name}"`);
}

function readTestSource(projectRoot, file) {
  return readFileSync(path.join(projectRoot, file), 'utf8').slice(0, MAX_SCANNED_BYTES);
}

function importsNodeTest(source) {
  return NODE_TEST_IMPORT.test(source) && !OTHER_RUNNER_IMPORT.test(source);
}

function nodeTestImportEvidence(projectRoot, layout) {
  const files = layout
    .projectCodeFiles(projectRoot)
    .filter(layout.isRunnableTestFile)
    .filter((file) => importsNodeTest(readTestSource(projectRoot, file)));
  return files.slice(0, 1).map((file) => `${file} imports node:test`);
}

export function collectRunnerEvidence(projectRoot, layout) {
  const manifest = readManifest(projectRoot);
  const fileNames = readdirSync(projectRoot);
  const evidence = new Map();
  for (const runner of ['vitest', 'jest']) {
    evidence.set(runner, [
      ...manifestEvidence(runner, manifest),
      ...fileEvidence(runner, fileNames),
    ]);
  }
  evidence.set('node-test', nodeTestImportEvidence(projectRoot, layout));
  for (const [runner, reasons] of evidence) {
    reasons.push(...scriptEvidence(runner, manifest));
  }
  return { evidence, manifest };
}
