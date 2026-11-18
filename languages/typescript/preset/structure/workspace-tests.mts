import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import type { Finding } from '../../adapters/static-checks/shared.mts';
import { parentOf, typescriptApi } from '../../adapters/typed/typescript-program.mts';
import { fieldOf, listOf, parseJson, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { propertyName } from '../syntax/property-names.mts';
import {
  exceptionMatcher,
  exceptionRoute,
  firstFileIn,
  projectFilePaths,
} from './typed/rule-views.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';

const ts = typescriptApi();

type UncollectedFinding = Finding & {
  readonly allowedForm: string;
  readonly ratchet: Readonly<Record<string, unknown>>;
};

type Selection = {
  readonly projects?: readonly string[] | typeof UNKNOWN | undefined;
  readonly include?: readonly string[] | typeof UNKNOWN | undefined;
};

const UNKNOWN = 'unknown';
const MANIFEST = 'package.json';
const RULE = 'nitpicker/no-uncollected-tests';
const TEST_FILES = '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const SKIPPED = /(?:^|\/)(?:node_modules|dist|build|coverage)(?:\/|$)/u;
const ROOT_CONFIGS = ['vitest', 'vite', 'jest'].flatMap((name) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${name}.config.${extension}`),
);
const DIRECT_RUNNER = /\b(?:vitest|jest)\b/u;
const WORKSPACE_RUNNER = /--workspaces?\b|\s-r\b|--recursive\b|\b(?:turbo|nx|lerna)\b/u;
const NPM_DEFAULT_TEST = 'no test specified';
const YAML_ITEM = /^\s*-\s*['"]?([^'"#\s]+)['"]?\s*$/u;

function isSkipped(entry: string): boolean {
  return SKIPPED.test(entry.replaceAll('\\', '/'));
}

function readJson(file: string): unknown {
  try {
    return parseJson(readFileSync(file, 'utf8'));
  } catch (error) {
    return { kind: 'unreadable-json', reason: String(error) };
  }
}

function pnpmPatterns(root: string): string[] {
  const file = path.join(root, 'pnpm-workspace.yaml');
  if (!existsSync(file)) {
    return [];
  }
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((line) => /^packages\s*:/u.test(line));
  if (start === -1) {
    return [];
  }
  const block = lines.slice(start + 1);
  const end = block.findIndex((line) => /^\S/u.test(line));
  return block
    .slice(0, end === -1 ? block.length : end)
    .map((line) => YAML_ITEM.exec(line)?.[1])
    .filter((pattern) => pattern !== undefined);
}

function workspacePatterns(root: string, manifest: unknown): string[] {
  const declared = fieldOf(manifest, 'workspaces');
  const npm = Array.isArray(declared) ? listOf(declared) : listOf(fieldOf(declared, 'packages'));
  return [...npm, ...pnpmPatterns(root)].filter((pattern) => typeof pattern === 'string');
}

function manifestDirectories(files: readonly string[]): string[] {
  return [
    ...new Set(
      files
        .filter((file) => path.posix.basename(file) === MANIFEST)
        .map((file) => path.posix.dirname(file)),
    ),
  ];
}

function packageDirectories(files: readonly string[], patterns: readonly string[]): string[] {
  const normalized = patterns.map((pattern) =>
    pattern.replace(/^(!?)\.\//u, '$1').replace(/\/$/u, ''),
  );
  const negated = normalized
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));
  const included = normalized.filter((pattern) => !pattern.startsWith('!'));
  const found = manifestDirectories(files)
    .filter((directory) => included.some((pattern) => path.matchesGlob(directory, pattern)))
    .filter((directory) => !negated.some((pattern) => path.matchesGlob(directory, pattern)));
  return found.sort();
}

function stringElements(node: TypeScript.ArrayLiteralExpression): string[] {
  return node.elements.filter(ts.isStringLiteralLike).map((element) => element.text);
}

function ownerName(node: TypeScript.Node): string | undefined {
  const parent = parentOf(node);
  const owner = parent === undefined ? undefined : parentOf(parent);
  return owner === undefined ? undefined : propertyName(owner);
}

function arrayProperty(
  nodes: readonly TypeScript.Node[],
  name: string,
  owner: string | undefined,
): string[] | typeof UNKNOWN | undefined {
  const found = nodes.find(
    (node) => propertyName(node) === name && (owner === undefined || ownerName(node) === owner),
  );
  if (found === undefined || !ts.isPropertyAssignment(found)) {
    return undefined;
  }
  if (!ts.isArrayLiteralExpression(found.initializer)) {
    return UNKNOWN;
  }
  const values = stringElements(found.initializer);
  return values.length === found.initializer.elements.length ? values : UNKNOWN;
}

function configSelection(configPath: string): Selection {
  const text = readFileSync(configPath, 'utf8');
  const source = ts.createSourceFile(configPath, text, ts.ScriptTarget.Latest, true);
  const nodes: TypeScript.Node[] = [source];
  for (const node of nodes) {
    appendAll(nodes, node.getChildren(source));
  }
  const owner = path.basename(configPath).startsWith('jest.') ? undefined : 'test';
  return {
    projects: arrayProperty(nodes, 'projects', owner),
    include: owner === undefined ? undefined : arrayProperty(nodes, 'include', owner),
  };
}

function rootSelection(root: string, manifest: unknown): Selection | undefined {
  const config = firstFileIn(root, ROOT_CONFIGS);
  if (config !== undefined) {
    return configSelection(config);
  }
  const jest = fieldOf(manifest, 'jest');
  if (jest !== undefined) {
    const projects = fieldOf(jest, 'projects');
    return { projects: Array.isArray(projects) ? textsOf(projects) : undefined };
  }
  const script = textOf(fieldOf(fieldOf(manifest, 'scripts'), 'test') ?? '');
  return DIRECT_RUNNER.test(script) && !WORKSPACE_RUNNER.test(script) ? {} : undefined;
}

function projectMatches(packageDirectory: string, entry: string): boolean {
  const pattern = entry
    .replace(/^<rootDir>\//u, '')
    .replace(/^\.\//u, '')
    .replace(/\/$/u, '');
  const directory = /\.config\.[cm]?[jt]s$/u.test(pattern) ? path.posix.dirname(pattern) : pattern;
  return path.matchesGlob(packageDirectory, directory);
}

function isCollectedByRoot(
  selection: Selection | undefined,
  packageDirectory: string,
  testFiles: readonly string[],
): boolean {
  if (selection === undefined) {
    return false;
  }
  const { projects, include } = selection;
  if (projects === UNKNOWN || include === UNKNOWN) {
    return true;
  }
  if (projects !== undefined) {
    return projects.some(
      (entry) => !entry.startsWith('!') && projectMatches(packageDirectory, entry),
    );
  }
  if (include === undefined) {
    return true;
  }
  return testFiles.some((file) =>
    include.some((pattern) => path.matchesGlob(file, pattern.replace(/^\.\//u, ''))),
  );
}

function hasTestScript(manifest: unknown): boolean {
  const script = fieldOf(fieldOf(manifest, 'scripts'), 'test');
  return (
    typeof script === 'string' && script.trim().length > 0 && !script.includes(NPM_DEFAULT_TEST)
  );
}

function uncollectedFinding(
  analyzerName: string,
  packageDirectory: string,
  count: number,
): UncollectedFinding {
  const files = `${String(count)} test file${count === 1 ? '' : 's'}`;
  const allowedForm =
    "Add a `test` script to its package.json, or add the package to the root test config's `projects`.";
  const route = exceptionRoute({
    rule: RULE,
    path: `${packageDirectory}/${MANIFEST}`,
    function: undefined,
    name: undefined,
    key: undefined,
  });
  const fix = `${allowedForm} ${route ?? ''}`;
  return {
    tool: analyzerName,
    rule: RULE,
    path: `${packageDirectory}/${MANIFEST}`,
    identity: `uncollected-workspace-tests:${String(count)}`,
    message: `Nothing runs the ${files} of this workspace package: it has no \`test\` script and the root test config does not include it. ${fix}`,
    allowedForm,
    classification: 'enforceable',
    ratchet: {
      key: 'uncollected-workspace-tests',
      value: count,
      worseAllowedForm: allowedForm,
      worseMessage: `The test files of this workspace package that nothing runs grew from {base} to ${String(count)}: it has no \`test\` script and the root test config does not include it. ${fix}`,
      heldMessage: `Workspace package: ${files} that nothing runs, allowed because base had {base}; any new one fails.`,
    },
  };
}

export function uncollectedWorkspaceTestFindings(
  projectRoot: string,
  { analyzerName, exceptions = [] }: { analyzerName: string; exceptions?: unknown[] },
): Finding[] {
  const manifest = readJson(path.join(projectRoot, MANIFEST));
  const files = projectFilePaths(projectRoot, {
    skipDirectory: (absolute) =>
      isSkipped(path.relative(projectRoot, absolute).split(path.sep).join('/')),
  });
  const directories = packageDirectories(files, workspacePatterns(projectRoot, manifest));
  if (directories.length === 0) {
    return [];
  }
  const selection = rootSelection(projectRoot, manifest);
  const isExcepted = exceptionMatcher(exceptions);
  return directories.flatMap((directory) => {
    if (hasTestScript(readJson(path.join(projectRoot, directory, MANIFEST)))) {
      return [];
    }
    const testFiles = files.filter((file) => path.matchesGlob(file, `${directory}/${TEST_FILES}`));
    if (testFiles.length === 0 || isCollectedByRoot(selection, directory, testFiles)) {
      return [];
    }
    if (isExcepted(RULE, `${directory}/${MANIFEST}`, directory)) {
      return [];
    }
    return [uncollectedFinding(analyzerName, directory, testFiles.length)];
  });
}
