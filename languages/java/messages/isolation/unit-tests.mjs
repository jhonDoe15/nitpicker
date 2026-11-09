import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  blankLiterals,
  pathInside,
  readJavaSource,
} from '../../adapters/review-rules/java-sources.mjs';
import {
  isIntegrationTest,
  isSpringBootTest,
} from '../../adapters/test-times/integration-tests.mjs';

export const NETWORK_RULE = 'NetworkInTest';
const PACKAGE = /^\s*package\s+([\w.]+)/mu;
const DECLARED_CLASS = /\bclass\s+([A-Z]\w*)/gu;
const SOURCE_SET = /(?:^|[\\/])src[\\/]([^\\/]+)[\\/]/u;
const TEST_SOURCE_SET = /^test$|Test$/u;
const INTEGRATION_SOURCE_SET =
  /^(?:integration|intTest|it|e2e|functional|acceptance|system|smoke)/iu;

function classNamesOf(file, text) {
  const owner = PACKAGE.exec(text)?.[1];
  const simple = path.posix.basename(file).replace(/\.(?:java|kt)$/u, '');
  const declared = [...blankLiterals(text).matchAll(DECLARED_CLASS)].map((match) => match[1]);
  return [...new Set([simple, ...declared])].map((name) => [owner, name].filter(Boolean).join('.'));
}

function isUnitSource(file) {
  const set = SOURCE_SET.exec(file)?.[1];
  return set === undefined || (TEST_SOURCE_SET.test(set) && !INTEGRATION_SOURCE_SET.test(set));
}

function isIntegrationTestFile({ file, text, projectRoot, locate }) {
  const unitSource = isUnitSource(file);
  return (
    classNamesOf(file, text).some((className) => isIntegrationTest({ className, unitSource })) ||
    isSpringBootTest(text, { locate, projectRoot })
  );
}

function sourceLocator(projectRoot, roots) {
  return (directory, fileName) =>
    roots
      .map((root) => [root, directory, fileName].filter(Boolean).join('/'))
      .find((candidate) => existsSync(pathInside(projectRoot, candidate)));
}

export function integrationTestFiles(projectRoot, testRoots) {
  const locate = sourceLocator(projectRoot, testRoots);
  const known = new Map();
  return (file) => {
    if (!known.has(file)) {
      const outside = path.isAbsolute(file) || file.split(/[\\/]/u).includes('..');
      const text = outside ? undefined : readJavaSource(pathInside(projectRoot, file));
      known.set(
        file,
        text !== undefined && isIntegrationTestFile({ file, text, projectRoot, locate }),
      );
    }
    return known.get(file);
  };
}

export function dropNetworkInIntegrationTests(findings, { projectRoot, testRoots = [] }) {
  if (projectRoot === undefined || !findings.some((finding) => finding.rule === NETWORK_RULE)) {
    return findings;
  }
  const isIntegration = integrationTestFiles(projectRoot, testRoots);
  return findings.filter(
    (finding) =>
      finding.tool !== 'pmd' || finding.rule !== NETWORK_RULE || !isIntegration(finding.path),
  );
}
