import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  classifyExpression,
  declaredExpression,
  forbiddenLicenseText,
  offersChoice,
  REJECTED,
} from './license-rule.mjs';

export const JAVA_TOOL_LICENSES = {
  pmd: 'BSD-style',
  spotbugs: 'LGPL-2.1',
  findSecBugs: 'LGPL-3.0',
  googleJavaFormat: 'Apache-2.0',
  jacoco: 'EPL-2.0',
  checkstyle: 'LGPL-2.1',
  lizard: 'MIT',
  pitest: 'Apache-2.0',
  pitestJunit5: 'Apache-2.0',
  detekt: 'Apache-2.0',
  detektKotlin: 'Apache-2.0',
  ktlint: 'MIT',
  ktfmt: 'Apache-2.0',
  kotlinCompiler: 'Apache-2.0',
};

const JAVA_ONLY_PERMISSIVE = new Set(['BSD-style']);
const LICENSE_FILE = /^(?:licen[cs]e|copying)(?:[.-].*)?$/i;
const EXACT_VERSION = /^\d+(?:\.\d+)*$/;
const PINNED_BLOCK = /def pinned = \[([\s\S]*?)\n\]/;
const PINNED_ENTRY = /^\s*(\w+)\s*:\s*'([^']*)'/gm;

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function lockedPackages(root) {
  const lock = readJson(path.join(root, 'package-lock.json'));
  return Object.entries(lock.packages ?? {})
    .filter(([key, entry]) => key !== '' && entry.dev !== true)
    .map(([key, entry]) => ({
      key,
      label: `${entry.name ?? key.split('node_modules/').at(-1)}@${entry.version}`,
      manifest: { license: entry.license, licenses: entry.licenses },
    }));
}

function textProblems(directory, label, declared) {
  if (!existsSync(directory) || (declared !== undefined && offersChoice(declared))) {
    return [];
  }
  return readdirSync(directory)
    .filter((entry) => LICENSE_FILE.test(entry))
    .flatMap((entry) => {
      const found = forbiddenLicenseText(readFileSync(path.join(directory, entry), 'utf8'));
      return found === undefined ? [] : [`${label}: ${entry} is ${found}, which is not allowed`];
    });
}

export function npmLicenseViolations(root) {
  return lockedPackages(root).flatMap(({ key, label, manifest }) => {
    const declared = declaredExpression(manifest);
    const declaredProblem =
      declared === undefined || classifyExpression(declared) === REJECTED
        ? [`${label}: license "${String(declared)}" is not on the allowlist`]
        : [];
    return [...declaredProblem, ...textProblems(path.join(root, key), label, declared)];
  });
}

export function pinnedJavaTools(initScript) {
  const block = PINNED_BLOCK.exec(initScript)?.[1] ?? '';
  return [...block.matchAll(PINNED_ENTRY)].map(([, tool, version]) => ({ tool, version }));
}

export function javaToolLicenseViolations(initScript) {
  const tools = pinnedJavaTools(initScript);
  if (tools.length === 0) {
    return ['the init script has no `def pinned = [...]` map'];
  }
  return tools.flatMap(({ tool, version }) => {
    const license = JAVA_TOOL_LICENSES[tool];
    const exact = EXACT_VERSION.test(version)
      ? []
      : [`${tool}: version "${version}" is not pinned exactly`];
    const allowed =
      license !== undefined &&
      classifyExpression(license, { extraPermissive: JAVA_ONLY_PERMISSIVE }) !== REJECTED
        ? []
        : [`${tool}: license ${String(license)} is not on the allowlist`];
    return [...exact, ...allowed];
  });
}
