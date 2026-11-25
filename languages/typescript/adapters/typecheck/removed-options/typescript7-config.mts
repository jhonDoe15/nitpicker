import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../typed/typescript-program.mts';
import {
  baseUrlOf,
  baseUrlPaths,
  removedOptions,
} from '../../../typescript-api/typescript7-options.mts';
import { fieldsOf, parseJson } from '../../../../../shared/values/readers.mts';

const NO_INPUT_CODES = new Set([18002, 18003]);
const UNMAPPED_OPTIONS = new Set(['module', 'outFile', 'out']);
const LOWEST_TARGET = 'ES2015';

function parsedOptions(
  configPath: string,
  ts: typeof TypeScript,
): TypeScript.CompilerOptions | undefined {
  const config = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
  if (config.error !== undefined) {
    return undefined;
  }
  const { options, errors } = ts.parseJsonConfigFileContent(
    { ...fieldsOf(config.config), include: [], files: [] },
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  return errors.every(({ code }) => NO_INPUT_CODES.has(code)) ? options : undefined;
}

export function typescript7Overrides(
  configPath: string,
  ts: typeof TypeScript = typescriptApi(),
): Readonly<Record<string, unknown>> | undefined {
  const options = parsedOptions(configPath, ts);
  if (options === undefined) {
    return undefined;
  }
  const removed = removedOptions(options);
  const hasBaseUrl = baseUrlOf(options) !== undefined;
  if ((removed.length === 0 && !hasBaseUrl) || removed.some((name) => UNMAPPED_OPTIONS.has(name))) {
    return undefined;
  }
  return {
    ...baseUrlPaths(options),
    ...(hasBaseUrl ? { baseUrl: null } : {}),
    ...Object.fromEntries(removed.map((name) => [name, name === 'target' ? LOWEST_TARGET : null])),
  };
}

function jsonObject(text: string): Readonly<Record<string, unknown>> | undefined {
  try {
    return fieldsOf(parseJson(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

export async function withTypescript7Options<T>(
  configPath: string,
  run: () => Promise<T>,
): Promise<T> {
  const overrides = typescript7Overrides(configPath);
  if (overrides === undefined) {
    return run();
  }
  const original = readFileSync(configPath, 'utf8');
  const config = jsonObject(original);
  if (config === undefined) {
    return run();
  }
  writeFileSync(
    configPath,
    JSON.stringify({
      ...config,
      compilerOptions: { ...fieldsOf(config['compilerOptions']), ...overrides },
    }),
  );
  try {
    return await run();
  } finally {
    writeFileSync(configPath, original);
  }
}
