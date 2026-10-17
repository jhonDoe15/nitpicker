import path from 'node:path';
import globals from 'globals';
import picomatch from 'picomatch';
import { restrictedBrowserGlobals } from '../../eslint-config/react/react-rules.mjs';
import { productionScope } from '../../eslint-config/scope-support.mjs';
import { domainGlobsFor } from '../../eslint-config/strict/strict-domain.mjs';
import { escapedGlob } from '../../test-runner/test-files/test-file-patterns.mjs';
import { isDomEnvironment } from '../environments.mjs';
import { hasDomDirective, projectText } from './dom-tests.mjs';

const RELATIVE_IMPORT = /\b(?:from|import|require)[\s(]*['"](?<specifier>\.{1,2}\/[^'"\n]*)['"]/gu;
const SCRIPT_EXTENSION = /\.(?:[cm]?js|jsx)$/u;
const RESOLVED_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

function resolvedImport(known, from, specifier) {
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const stem = target.replace(SCRIPT_EXTENSION, '');
  const candidates = [
    target,
    ...RESOLVED_EXTENSIONS.map((extension) => `${stem}.${extension}`),
    ...RESOLVED_EXTENSIONS.map((extension) => `${target}/index.${extension}`),
  ];
  return candidates.find((candidate) => known.has(candidate));
}

function importedFiles(projectRoot, file, known) {
  const specifiers = [...projectText(projectRoot, file).matchAll(RELATIVE_IMPORT)].map(
    ({ groups }) => groups.specifier,
  );
  return specifiers
    .map((specifier) => resolvedImport(known, file, specifier))
    .filter((imported) => imported !== undefined);
}

function importClosure(projectRoot, starts, known) {
  const seen = new Set(starts);
  const pending = [...starts];
  for (const file of pending) {
    const fresh = importedFiles(projectRoot, file, known).filter((imported) => !seen.has(imported));
    for (const imported of fresh) {
      seen.add(imported);
      pending.push(imported);
    }
  }
  return [...seen];
}

function domScopeMatchers(scopes) {
  return scopes
    .filter((scope) => isDomEnvironment(scope.environment))
    .map((scope) => picomatch(scope.files, { dot: true, ignore: scope.ignores ?? [] }));
}

function domTestFiles(layout, { environment, scopes }, { projectRoot, files }) {
  const tests = files.filter((file) => layout.isRunnableTestFile(file));
  if (isDomEnvironment(environment)) {
    return tests;
  }
  const matchers = domScopeMatchers(scopes);
  return tests.filter(
    (file) => matchers.some((matches) => matches(file)) || hasDomDirective(projectRoot, file),
  );
}

export function domTestedProductionFiles(layout, environments, projectRoot) {
  const files = layout.projectCodeFiles(projectRoot);
  const tests = domTestFiles(layout, environments, { projectRoot, files });
  if (tests.length === 0) {
    return [];
  }
  const reached = importClosure(projectRoot, tests, new Set(files));
  return reached.filter((file) => layout.isSourceFile(file));
}

export function domProductionConfigFor(layout, environments, projectRoot) {
  const production = domTestedProductionFiles(layout, environments, projectRoot).map(escapedGlob);
  if (production.length === 0) {
    return [];
  }
  return [
    { files: production, languageOptions: { globals: globals.browser } },
    {
      files: [...production, ...productionScope(layout).ignores],
      ignores: [...layout.excludedGlobs, ...domainGlobsFor(layout.sourceRoots)],
      rules: { 'no-restricted-globals': restrictedBrowserGlobals },
    },
  ];
}
