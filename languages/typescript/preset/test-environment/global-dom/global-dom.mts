import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { selectTypeScriptApi } from '../../../typescript-api/api-selection.mts';
import { isTypeScriptApi } from '../../../../../shared/values/boundaries/typescript-guard.mts';
import { tokenize } from '../../test-runner/script-command.mts';
import type { Environments } from '../typed/environment-types.mts';

type SetupFile = {
  readonly entry: string;
  readonly written: string;
  readonly environment: string | undefined;
};

type SetupCommand = {
  readonly environment?: Readonly<Record<string, string>>;
  readonly nodeArguments: readonly string[];
  readonly arguments_: readonly string[];
};

const REGISTRARS: readonly (readonly [RegExp, string])[] = [
  [/^global-jsdom(?:\/|$)/u, 'jsdom'],
  [/^jsdom-global(?:\/|$)/u, 'jsdom'],
  [/^@happy-dom\/global-registrator(?:\/|$)/u, 'happy-dom'],
];
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/u;
const SETUP_OPTIONS = new Set(['--import', '--require', '-r']);
const NODE_ENVIRONMENT: Environments = { environment: 'node', scopes: [] };

export function registeredEnvironment(specifier: string): string | undefined {
  return REGISTRARS.find(([pattern]) => pattern.test(specifier))?.[1];
}

function localFile(projectRoot: string, entry: string): string | undefined {
  const file = path.resolve(projectRoot, entry);
  if (!file.startsWith(`${projectRoot}${path.sep}`)) {
    return undefined;
  }
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

function fileEnvironment(file: string): string | undefined {
  if (!SCRIPT_FILE.test(file)) {
    return undefined;
  }
  const ts: unknown = createRequire(import.meta.url)(selectTypeScriptApi().file);
  if (!isTypeScriptApi(ts)) {
    throw new TypeError('The selected TypeScript API does not load');
  }
  const { importedFiles } = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
  return importedFiles
    .map(({ fileName }) => registeredEnvironment(fileName))
    .find((environment) => environment !== undefined);
}

function setupOf(projectRoot: string, entry: string): SetupFile {
  const file = localFile(projectRoot, entry);
  return file === undefined
    ? { entry, written: entry, environment: registeredEnvironment(entry) }
    : { entry: file, written: entry, environment: fileEnvironment(file) };
}

export function globalDomEnvironments(
  projectRoot: string,
  entries: readonly string[],
): Environments {
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

function optionValues(tokens: readonly string[]): string[] {
  return tokens.flatMap((token, index) => {
    const [name = '', ...value] = token.split('=');
    if (!SETUP_OPTIONS.has(name)) {
      return [];
    }
    if (value.length > 0) {
      return [value.join('=')];
    }
    const next = tokens[index + 1];
    return next === undefined ? [] : [next];
  });
}

export function nodeSetupEntries(command: SetupCommand): string[] {
  const nodeOptions = tokenize(command.environment?.['NODE_OPTIONS'] ?? '').filter(
    (token): token is string => typeof token === 'string',
  );
  return optionValues([...nodeOptions, ...command.nodeArguments, ...command.arguments_]);
}
