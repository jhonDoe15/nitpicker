import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { selectTypeScriptApi } from '../../typescript-api/api-selection.mjs';
import { contextOf, isBuiltin, located, packageFacts } from './config-paths.mjs';

export const ESLINT_PROJECT_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
];
const MODULE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.json'];
const SCRIPT_SPECIFIER = /\.([cm]?)js$/u;
const LOCAL_SPECIFIER = /^\.\.?\//u;
const PATH_LITERAL = /^[\w@.\-/]+$/u;
const PATH_SEPARATOR = /[./]/u;
const UNTRACKED_DATA = /(?:^|\/)(?:package\.json|tsconfig[\w.-]*\.json)$/u;

function typescript() {
  return createRequire(import.meta.url)(selectTypeScriptApi().file);
}

export function projectEslintConfig(root) {
  const context = contextOf(root);
  return ESLINT_PROJECT_FILES.find((name) => located(context, name).kind !== 'absent');
}

export function readEslintConfigFile(root, relative) {
  const found = located(contextOf(root), relative);
  return found.kind === 'file' ? readFileSync(found.full) : undefined;
}

function moduleCandidates(relative) {
  return [
    relative,
    relative.replace(SCRIPT_SPECIFIER, '.$1ts'),
    ...MODULE_EXTENSIONS.map((extension) => `${relative}${extension}`),
    ...MODULE_EXTENSIONS.map((extension) => `${relative}/index${extension}`),
  ];
}

function stringLiterals(ts, file, text) {
  const literals = [];
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      literals.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  return literals.filter(
    (literal) =>
      PATH_LITERAL.test(literal) && PATH_SEPARATOR.test(literal) && !literal.startsWith('/'),
  );
}

function scanned(file, full) {
  const text = readFileSync(full, 'utf8');
  if (path.posix.extname(file) === '.json') {
    return { modules: [], data: [], packages: [] };
  }
  const ts = typescript();
  const specifiers = ts
    .preProcessFile(text, true, true)
    .importedFiles.map(({ fileName }) => fileName);
  const local = specifiers.filter((specifier) => LOCAL_SPECIFIER.test(specifier));
  const bare = specifiers.filter(
    (specifier) => !LOCAL_SPECIFIER.test(specifier) && !path.isAbsolute(specifier),
  );
  return {
    modules: local.map((specifier) => path.posix.join(path.posix.dirname(file), specifier)),
    data: stringLiterals(ts, file, text).flatMap((literal) => [
      path.posix.join(path.posix.dirname(file), literal),
      path.posix.normalize(literal),
    ]),
    packages: bare.filter((specifier) => !isBuiltin(specifier)),
  };
}

function firstFound(context, candidates) {
  const found = candidates.map((candidate) => ({ candidate, ...located(context, candidate) }));
  return found.find(({ kind }) => kind === 'file') ?? found.find(({ kind }) => kind === 'outside');
}

function unreachable(file, found) {
  return found.kind === 'outside'
    ? `${file} resolves to ${found.target}, outside the repository`
    : `${file} is a link to a missing file`;
}

function enqueue(walk, file) {
  if (!walk.tree.modules.has(file) && !walk.queue.includes(file)) {
    walk.queue.push(file);
  }
}

function addImports(walk, file, modules) {
  for (const candidates of modules.map(moduleCandidates)) {
    const next = firstFound(walk.context, candidates);
    if (next?.kind === 'file') {
      enqueue(walk, next.candidate);
    }
    if (next?.kind === 'outside') {
      walk.tree.outside.push(`${file} imports ${next.candidate}, outside the repository`);
    }
  }
}

function addData(walk, data) {
  for (const literal of data.filter((candidate) => !UNTRACKED_DATA.test(candidate))) {
    if (located(walk.context, literal).kind === 'file') {
      walk.tree.data.add(literal);
    }
  }
}

function addPackages(walk, full, packages) {
  for (const facts of packages.map((specifier) => packageFacts(walk.context, full, specifier))) {
    if (facts.version !== undefined) {
      walk.tree.packages.add(facts.version);
    }
    for (const file of facts.workspace ?? []) {
      addWorkspaceFile(walk, file);
    }
  }
}

function addWorkspaceFile(walk, file) {
  if (file.endsWith('.json')) {
    walk.tree.data.add(file);
  } else {
    enqueue(walk, file);
  }
}

function visit(walk, file) {
  const found = located(walk.context, file);
  if (found.kind !== 'file') {
    walk.tree.outside.push(unreachable(file, found));
    return;
  }
  walk.tree.modules.add(file);
  const { modules, data, packages } = scanned(file, found.full);
  addImports(walk, file, modules);
  addData(walk, data);
  addPackages(walk, found.full, packages);
}

function eslintConfigTree(root) {
  const config = projectEslintConfig(root);
  const tree = { config, modules: new Set(), data: new Set(), packages: new Set(), outside: [] };
  const walk = { context: contextOf(root), tree, queue: config === undefined ? [] : [config] };
  for (const file of walk.queue) {
    visit(walk, file);
  }
  return tree;
}

export function eslintConfigFiles(root) {
  const tree = eslintConfigTree(root);
  if (tree.config === undefined) {
    return [];
  }
  const others = [...new Set([...tree.modules, ...tree.data])].filter(
    (file) => file !== tree.config,
  );
  return [tree.config, ...others.toSorted()];
}

export function eslintProjectFacts(root) {
  const tree = eslintConfigTree(root);
  if (tree.config === undefined) {
    return { projectConfigMissing: true };
  }
  if (tree.outside.length > 0) {
    throw new Error(
      `The ESLint config cannot be layered: ${tree.outside.join('; ')}. Keep the config and the files it imports inside the repository.`,
    );
  }
  const hash = createHash('sha256');
  for (const file of eslintConfigFiles(root)) {
    hash.update(`${file}\0${readEslintConfigFile(root, file).toString('utf8')}\0`);
  }
  for (const version of [...tree.packages].toSorted()) {
    hash.update(`package\0${version}\0`);
  }
  return { projectConfigFile: tree.config, projectConfigDigest: hash.digest('hex') };
}
