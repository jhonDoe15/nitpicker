import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  classifyExpression,
  declaredExpression,
  forbiddenLicenseText,
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

const LICENSE_FILE = /^(?:licen[cs]e|copying)(?:[.-].*)?$/i;
const EXACT_VERSION = /^\d+(?:\.\d+)*$/;
const PINNED_BLOCK = /def pinned = \[([\s\S]*?)\n\]/;
const PINNED_ENTRY = /^\s*(\w+)\s*:\s*'([^']*)'/gm;

function findManifest(name, fromDirectory) {
  const candidate = path.join(fromDirectory, 'node_modules', name, 'package.json');
  if (existsSync(candidate)) {
    return candidate;
  }
  const parent = path.dirname(fromDirectory);
  return parent === fromDirectory ? undefined : findManifest(name, parent);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function dependencyNames(manifest, { requiredOnly }) {
  const required = Object.keys(manifest.dependencies ?? {});
  return requiredOnly
    ? required
    : [
        ...required,
        ...Object.keys(manifest.optionalDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
      ];
}

export function collectShippedPackages(root) {
  const packages = new Map();
  const missing = [];
  const visit = (name, fromDirectory, requiredOnly) => {
    const file = findManifest(name, fromDirectory);
    if (file === undefined) {
      if (requiredOnly) {
        missing.push(name);
      }
      return;
    }
    if (packages.has(file)) {
      return;
    }
    const manifest = readJson(file);
    packages.set(file, manifest);
    for (const dependency of dependencyNames(manifest, { requiredOnly })) {
      visit(dependency, path.dirname(file), false);
    }
  };
  for (const name of dependencyNames(readJson(path.join(root, 'package.json')), {
    requiredOnly: true,
  })) {
    visit(name, root, true);
  }
  return { packages: [...packages.entries()], missing };
}

function npmViolations(file, manifest) {
  const label = `${manifest.name}@${manifest.version}`;
  const declared = declaredExpression(manifest);
  const declaredProblem =
    declared === undefined || classifyExpression(declared) === REJECTED
      ? [`${label}: license "${String(declared)}" is not on the allowlist`]
      : [];
  const directory = path.dirname(file);
  const textProblems = readdirSync(directory)
    .filter((entry) => LICENSE_FILE.test(entry))
    .flatMap((entry) => {
      const found = forbiddenLicenseText(readFileSync(path.join(directory, entry), 'utf8'));
      return found === undefined ? [] : [`${label}: ${entry} is ${found}, which is not allowed`];
    });
  return [...declaredProblem, ...textProblems];
}

export function npmLicenseViolations(root) {
  const { packages, missing } = collectShippedPackages(root);
  return [
    ...missing.map((name) => `${name}: listed in dependencies but not installed`),
    ...packages.flatMap(([file, manifest]) => npmViolations(file, manifest)),
  ];
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
      license !== undefined && classifyExpression(license) !== REJECTED
        ? []
        : [`${tool}: license ${String(license)} is not on the allowlist`];
    return [...exact, ...allowed];
  });
}
