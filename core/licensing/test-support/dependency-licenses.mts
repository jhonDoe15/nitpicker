import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  classifyExpression,
  declaredExpression,
  forbiddenLicenseText,
  offersChoice,
  REJECTED,
} from './license-rule.mts';
import { jarLicenseViolations } from './pom-licenses.mts';
import { fieldOf, fieldsOf, textOf } from '../../../shared/values/readers.mts';

const APACHE = 'Apache-2.0';

export const JAVA_TOOL_LICENSES: Readonly<Record<string, string>> = {
  pmd: 'BSD-style',
  forbiddenapis: APACHE,
  spotbugs: 'LGPL-2.1',
  findSecBugs: 'LGPL-3.0',
  googleJavaFormat: APACHE,
  palantirJavaFormat: APACHE,
  jacoco: 'EPL-2.0',
  checkstyle: 'LGPL-2.1',
  lizard: 'MIT',
  pitest: APACHE,
  pitestJunit5: APACHE,
  pitestTestng: APACHE,
  archunit: APACHE,
  asm: 'BSD-3-Clause',
  detekt: APACHE,
  detektKotlin: APACHE,
  ktlint: 'MIT',
  ktfmt: APACHE,
  kotlinCompiler: APACHE,
  errorProne: APACHE,
  nullAway: 'MIT',
};

const JAVA_ONLY_PERMISSIVE = new Set(['BSD-style']);
const NPM_LICENSE_EXCEPTIONS = new Map([['jsonify@0.0.1', 'Public Domain']]);
const LICENSE_FILE = /^(?:licen[cs]es?|copying)(?:[.-].*)?$/i;
const LESSER_COPYLEFT = /\bLGPL/i;
const EXACT_VERSION = /^\d+(?:\.\d+)*$/;

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function lockedPackages(
  root: string,
): { key: string; label: string; manifest: { license: unknown; licenses: unknown } }[] {
  const lock = readJson(path.join(root, 'package-lock.json'));
  return Object.entries(fieldsOf(fieldOf(lock, 'packages')))
    .filter(([key, entry]) => key !== '' && fieldOf(entry, 'dev') !== true)
    .map(([key, entry]) => ({
      key,
      label: `${textOf(fieldOf(entry, 'name') ?? key.split('node_modules/').at(-1))}@${textOf(fieldOf(entry, 'version'))}`,
      manifest: { license: fieldOf(entry, 'license'), licenses: fieldOf(entry, 'licenses') },
    }));
}

function within(base: string, name: string): string {
  const root = path.resolve(base);
  const full = path.resolve(root, name);
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${name} is outside ${root}`);
  }
  return full;
}

function licenseFiles(directory: string): string[] {
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

function textProblems(directory: string, label: string, declared: string | undefined): string[] {
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

export function npmLicenseViolations(root: string): string[] {
  return lockedPackages(root).flatMap(({ key, label, manifest }) => {
    const declared = declaredExpression(manifest);
    const excepted = declared !== undefined && NPM_LICENSE_EXCEPTIONS.get(label) === declared;
    const declaredProblem =
      !excepted && (declared === undefined || classifyExpression(declared) === REJECTED)
        ? [`${label}: license "${String(declared)}" is not on the allowlist`]
        : [];
    return [...declaredProblem, ...textProblems(within(root, key), label, declared)];
  });
}

export function javaToolLicenseViolations(pinned: Readonly<Record<string, string>>): string[] {
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

export function javaJarLicenseViolations(jars: readonly string[]): string[] {
  return jarLicenseViolations(jars, { extraPermissive: JAVA_ONLY_PERMISSIVE });
}
