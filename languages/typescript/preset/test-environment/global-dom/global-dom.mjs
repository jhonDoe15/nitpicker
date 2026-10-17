import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { scanDomEvidence } from '../../eslint-plugin/rules/testing/environment/dom-evidence.mjs';
import { tokenize } from '../../test-runner/script-command.mjs';

const REGISTRARS = [
  [/^global-jsdom(?:\/|$)/u, 'jsdom'],
  [/^jsdom-global(?:\/|$)/u, 'jsdom'],
  [/^@happy-dom\/global-registrator(?:\/|$)/u, 'happy-dom'],
];
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/u;
const SETUP_OPTIONS = new Set(['--import', '--require', '-r']);
const NODE_ENVIRONMENT = { environment: 'node', scopes: [] };

export function registeredEnvironment(specifier) {
  return REGISTRARS.find(([pattern]) => pattern.test(specifier))?.[1];
}

function localFile(projectRoot, entry) {
  const file = path.resolve(projectRoot, entry);
  if (!file.startsWith(`${projectRoot}${path.sep}`)) {
    return undefined;
  }
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

function fileEnvironment(file) {
  if (!SCRIPT_FILE.test(file)) {
    return undefined;
  }
  const { specifiers } = scanDomEvidence(readFileSync(file, 'utf8'), file);
  return specifiers.map(registeredEnvironment).find((environment) => environment !== undefined);
}

function setupOf(projectRoot, entry) {
  const file = localFile(projectRoot, entry);
  return file === undefined
    ? { entry, written: entry, environment: registeredEnvironment(entry) }
    : { entry: file, written: entry, environment: fileEnvironment(file) };
}

export function globalDomEnvironments(projectRoot, entries) {
  const setups = entries.map((entry) => setupOf(projectRoot, entry));
  const registrar = setups.find(({ environment }) => environment !== undefined);
  if (registrar === undefined) {
    return NODE_ENVIRONMENT;
  }
  return {
    environment: registrar.environment,
    scopes: [],
    setupFiles: setups.map(({ entry }) => entry),
    globalDom: registrar.written,
  };
}

function optionValues(tokens) {
  return tokens.flatMap((token, index) => {
    const [name, ...value] = token.split('=');
    if (!SETUP_OPTIONS.has(name)) {
      return [];
    }
    if (value.length > 0) {
      return [value.join('=')];
    }
    return index + 1 < tokens.length ? [tokens[index + 1]] : [];
  });
}

export function nodeSetupEntries(command) {
  const nodeOptions = tokenize(command.environment?.NODE_OPTIONS ?? '').filter(
    (token) => typeof token === 'string',
  );
  return optionValues([...nodeOptions, ...command.nodeArguments, ...command.arguments_]);
}
