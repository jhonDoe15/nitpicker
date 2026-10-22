import { readFileSync } from 'node:fs';
import { childAt, childrenAt, parseXml } from '../../../../shared/ingest/common.mjs';
import { executionsOf, pluginsOf } from './pom-elements.mjs';
import { existingFile, globalToolchainsFile, userToolchainsFile } from './toolchain-files.mjs';

const TOOLCHAINS_PLUGIN = 'org.apache.maven.plugins:maven-toolchains-plugin';
const COMPILER_PLUGIN = 'org.apache.maven.plugins:maven-compiler-plugin';

function valuesOf(element) {
  return element === undefined
    ? {}
    : Object.fromEntries(
        element.children
          .filter(({ text }) => text !== undefined)
          .map(({ name, text }) => [name, text]),
      );
}

export function jdkRequirements(project) {
  const plugins = pluginsOf(project);
  const toolchains = plugins.get(TOOLCHAINS_PLUGIN);
  const fromToolchains =
    toolchains === undefined
      ? undefined
      : [toolchains, ...executionsOf(toolchains)]
          .map((element) => childAt(element, 'configuration', 'toolchains', 'jdk'))
          .find((jdk) => jdk !== undefined);
  const compiler = plugins.get(COMPILER_PLUGIN);
  const fromCompiler =
    compiler === undefined ? undefined : childAt(compiler, 'configuration', 'jdkToolchain');
  const found = valuesOf(fromToolchains ?? fromCompiler);
  return Object.keys(found).length === 0 ? undefined : found;
}

function versionNumbers(version) {
  return version.split('.').map((part) => Number(part));
}

function compareVersions(left, right) {
  const [a, b] = [versionNumbers(left), versionNumbers(right)];
  return (
    Array.from(
      { length: Math.max(a.length, b.length) },
      (_, index) => (a[index] ?? 0) - (b[index] ?? 0),
    ).find((difference) => difference !== 0) ?? 0
  );
}

const RANGE = /^([[(])([^,]*),([^\])]*)([\])])$/u;

function versionMatches(required, provided) {
  const range = RANGE.exec(required);
  if (range === null) {
    return required === provided;
  }
  const [, open, written, upper, close] = range;
  const [low, high] = [written.trim(), upper.trim()];
  const aboveLow = low === '' || compareVersions(provided, low) > (open === '[' ? -1 : 0);
  const belowHigh = high === '' || compareVersions(provided, high) < (close === ']' ? 1 : 0);
  return aboveLow && belowHigh;
}

function provides(entry, required) {
  const offered = valuesOf(childAt(entry, 'provides'));
  return Object.entries(required).every(([key, value]) =>
    key === 'version' ? versionMatches(value, offered.version ?? '') : offered[key] === value,
  );
}

function interpolated(text, { environment, home }) {
  return text.replaceAll(/\$\{([^}]+)\}/gu, (match, name) => {
    if (name === 'user.home') {
      return home;
    }
    return name.startsWith('env.') ? (environment[name.slice('env.'.length)] ?? match) : match;
  });
}

function jdkHomeIn(file, required, context) {
  const existing = existingFile(file);
  if (existing === undefined) {
    return undefined;
  }
  const entries = childrenAt(parseXml(readFileSync(existing, 'utf8')), 'toolchain').filter(
    (entry) => childAt(entry, 'type')?.text === 'jdk' && provides(entry, required),
  );
  const found = entries
    .map((entry) => childAt(entry, 'configuration', 'jdkHome')?.text)
    .find((candidate) => candidate !== undefined);
  return found === undefined ? undefined : interpolated(found.trim(), context);
}

export function toolchainJdkHome(required, context) {
  return (
    jdkHomeIn(userToolchainsFile(context), required, context) ??
    jdkHomeIn(globalToolchainsFile(context), required, context)
  );
}
