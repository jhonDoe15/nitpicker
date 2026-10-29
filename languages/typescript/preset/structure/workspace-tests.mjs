import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ts } from '../../typescript-api/typescript-api.mjs';
import { firstFileIn, pathInside } from '../../../../shared/filesystem.mjs';
import { exceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';
import { exceptionMatcher } from '../../../../shared/rules/exceptions.mjs';
import { propertyName } from '../syntax/property-names.mjs';

const RULE = 'nitpicker/no-uncollected-tests';
const TEST_FILES = '**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const SKIPPED = /(?:^|\/)(?:node_modules|dist|build|coverage)(?:\/|$)/u;
const ROOT_CONFIGS = ['vitest', 'vite', 'jest'].flatMap((name) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${name}.config.${extension}`),
);
const DIRECT_RUNNER = /\b(?:vitest|jest)\b/u;
const WORKSPACE_RUNNER = /--workspaces?\b|\s-r\b|--recursive\b|\b(?:turbo|nx|lerna)\b/u;
const NPM_DEFAULT_TEST = /no test specified/u;
const YAML_ITEM = /^\s*-\s*['"]?([^'"#\s]+)['"]?\s*$/u;

function isSkipped(entry) {
  return SKIPPED.test(String(entry).replaceAll('\\', '/'));
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { kind: 'unreadable-json', reason: String(error) };
  }
}

function pnpmPatterns(root) {
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

function workspacePatterns(root, manifest) {
  const declared = manifest?.workspaces;
  const npm = Array.isArray(declared) ? declared : (declared?.packages ?? []);
  return [...npm, ...pnpmPatterns(root)].filter((pattern) => typeof pattern === 'string');
}

function isPackageDirectory(directory) {
  return (
    directory !== undefined &&
    existsSync(path.join(directory, 'package.json')) &&
    statSync(directory).isDirectory()
  );
}

function packageDirectories(root, patterns) {
  const negated = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));
  const found = patterns
    .filter((pattern) => !pattern.startsWith('!'))
    .flatMap((pattern) =>
      globSync(pattern.replace(/^\.\//u, '').replace(/\/$/u, ''), { cwd: root }),
    )
    .map((match) => match.replaceAll('\\', '/'))
    .filter((match) => !SKIPPED.test(match) && isPackageDirectory(pathInside(root, match)))
    .filter((match) => !negated.some((pattern) => path.matchesGlob(match, pattern)));
  return [...new Set(found)].sort();
}

function stringElements(node) {
  return node.elements.filter(ts.isStringLiteralLike).map((element) => element.text);
}

function ownerName(node) {
  const owner = node.parent?.parent;
  return owner === undefined ? undefined : propertyName(owner);
}

function arrayProperty(nodes, name, owner) {
  const found = nodes.find(
    (node) => propertyName(node) === name && (owner === undefined || ownerName(node) === owner),
  );
  if (found === undefined) {
    return undefined;
  }
  if (!ts.isArrayLiteralExpression(found.initializer)) {
    return 'unknown';
  }
  const values = stringElements(found.initializer);
  return values.length === found.initializer.elements.length ? values : 'unknown';
}

function configSelection(configPath) {
  const text = readFileSync(configPath, 'utf8');
  const source = ts.createSourceFile(configPath, text, ts.ScriptTarget.Latest, true);
  const nodes = [source];
  for (const node of nodes) {
    nodes.push(...node.getChildren(source));
  }
  const owner = path.basename(configPath).startsWith('jest.') ? undefined : 'test';
  return {
    projects: arrayProperty(nodes, 'projects', owner),
    include: owner === undefined ? undefined : arrayProperty(nodes, 'include', owner),
  };
}

function rootSelection(root, manifest) {
  const config = firstFileIn(root, ROOT_CONFIGS);
  if (config !== undefined) {
    return configSelection(config);
  }
  if (manifest?.jest !== undefined) {
    const { projects } = manifest.jest;
    return { projects: Array.isArray(projects) ? projects : undefined };
  }
  const script = manifest?.scripts?.test ?? '';
  return DIRECT_RUNNER.test(script) && !WORKSPACE_RUNNER.test(script) ? {} : undefined;
}

function projectMatches(packageDirectory, entry) {
  const pattern = entry
    .replace(/^<rootDir>\//u, '')
    .replace(/^\.\//u, '')
    .replace(/\/$/u, '');
  const directory = /\.config\.[cm]?[jt]s$/u.test(pattern) ? path.posix.dirname(pattern) : pattern;
  return path.matchesGlob(packageDirectory, directory);
}

function isCollectedByRoot(selection, packageDirectory, testFiles) {
  if (selection === undefined) {
    return false;
  }
  const { projects, include } = selection;
  if (projects === 'unknown' || include === 'unknown') {
    return true;
  }
  if (Array.isArray(projects)) {
    return projects.some(
      (entry) => !entry.startsWith('!') && projectMatches(packageDirectory, entry),
    );
  }
  if (!Array.isArray(include)) {
    return true;
  }
  return testFiles.some((file) =>
    include.some((pattern) => path.matchesGlob(file, pattern.replace(/^\.\//u, ''))),
  );
}

function hasTestScript(manifest) {
  const script = manifest?.scripts?.test;
  return typeof script === 'string' && script.trim().length > 0 && !NPM_DEFAULT_TEST.test(script);
}

function uncollectedFinding(analyzerName, packageDirectory, count) {
  const files = `${String(count)} test file${count === 1 ? '' : 's'}`;
  const fix = `Add a \`test\` script to its package.json, or add the package to the root test config's \`projects\`. ${exceptionRoute({ rule: RULE, path: `${packageDirectory}/package.json` })}`;
  return {
    tool: analyzerName,
    rule: RULE,
    path: `${packageDirectory}/package.json`,
    identity: `uncollected-workspace-tests:${String(count)}`,
    message: `Nothing runs the ${files} of this workspace package: it has no \`test\` script and the root test config does not include it. ${fix}`,
    classification: 'enforceable',
    ratchet: {
      key: 'uncollected-workspace-tests',
      value: count,
      worseMessage: `The test files of this workspace package that nothing runs grew from {base} to ${String(count)}: it has no \`test\` script and the root test config does not include it. ${fix}`,
      heldMessage: `Workspace package: ${files} that nothing runs, allowed because base had {base}; any new one fails.`,
    },
  };
}

export function uncollectedWorkspaceTestFindings(projectRoot, { analyzerName, exceptions = [] }) {
  const manifest = readJson(path.join(projectRoot, 'package.json'));
  const directories = packageDirectories(projectRoot, workspacePatterns(projectRoot, manifest));
  if (directories.length === 0) {
    return [];
  }
  const selection = rootSelection(projectRoot, manifest);
  const isExcepted = exceptionMatcher(exceptions);
  return directories.flatMap((directory) => {
    if (hasTestScript(readJson(path.join(projectRoot, directory, 'package.json')))) {
      return [];
    }
    const testFiles = globSync(`${directory}/${TEST_FILES}`, {
      cwd: projectRoot,
      exclude: isSkipped,
    }).map((file) => file.replaceAll('\\', '/'));
    if (testFiles.length === 0 || isCollectedByRoot(selection, directory, testFiles)) {
      return [];
    }
    if (isExcepted(RULE, `${directory}/package.json`, directory)) {
      return [];
    }
    return [uncollectedFinding(analyzerName, directory, testFiles.length)];
  });
}
