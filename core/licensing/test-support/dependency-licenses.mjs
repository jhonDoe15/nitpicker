import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
  palantirJavaFormat: 'Apache-2.0',
  jacoco: 'EPL-2.0',
  checkstyle: 'LGPL-2.1',
  lizard: 'MIT',
  pitest: 'Apache-2.0',
  pitestJunit5: 'Apache-2.0',
  pitestTestng: 'Apache-2.0',
  archunit: 'Apache-2.0',
  detekt: 'Apache-2.0',
  detektKotlin: 'Apache-2.0',
  ktlint: 'MIT',
  ktfmt: 'Apache-2.0',
  kotlinCompiler: 'Apache-2.0',
  errorProne: 'Apache-2.0',
  nullAway: 'MIT',
};

const JAVA_ONLY_PERMISSIVE = new Set(['BSD-style']);
const LICENSE_FILE = /^(?:licen[cs]es?|copying)(?:[.-].*)?$/i;
const LESSER_COPYLEFT = /\bLGPL/i;
const EXACT_VERSION = /^\d+(?:\.\d+)*$/;

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

function within(base, name) {
  const root = path.resolve(base);
  const full = path.resolve(root, name);
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${name} is outside ${root}`);
  }
  return full;
}

function licenseFiles(directory) {
  return readdirSync(directory)
    .filter((entry) => LICENSE_FILE.test(entry))
    .flatMap((entry) => {
      const full = within(directory, entry);
      return statSync(full).isDirectory()
        ? readdirSync(full).map((inner) => within(full, inner))
        : [full];
    })
    .filter((file) => statSync(file).isFile());
}

function textProblems(directory, label, declared) {
  if (!existsSync(directory) || (declared !== undefined && offersChoice(declared))) {
    return [];
  }
  const allowGpl = declared !== undefined && LESSER_COPYLEFT.test(declared);
  return licenseFiles(directory).flatMap((file) => {
    const found = forbiddenLicenseText(readFileSync(file, 'utf8'), { allowGpl });
    const entry = path.relative(directory, file);
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
    return [...declaredProblem, ...textProblems(within(root, key), label, declared)];
  });
}

export function javaToolLicenseViolations(pinned) {
  return Object.entries(pinned).flatMap(([tool, version]) => {
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
