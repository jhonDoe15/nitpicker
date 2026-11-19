import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { JavaSpawn } from '../../../adapters/typed/java-values.mts';
import { locateBinary } from '../../../maven/programs/probe/java-probe-cache.mts';
import { hostsDirectory } from '../config/host-config.mts';
import { dispatchToHost, onlyPlainOptions } from './host-client.mts';
import { valueOr } from '../../../../../shared/values/attempt/attempt.mts';

type ToolOptions = Parameters<JavaSpawn>[2] & { readonly stdoutFile?: string };

const HOSTED_PROVIDERS = new Set(['javac', 'jdeps']);
const WINDOWS_SUFFIX = /\.exe$/u;

const ESCAPES: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', f: '\f' };
const WHITESPACE = /\s/u;

type Scan = {
  tokens: string[];
  current: string | undefined;
  quote: string | undefined;
  comment: boolean;
  escape: boolean;
};

function endToken(scan: Scan): void {
  if (scan.current !== undefined) {
    scan.tokens.push(scan.current);
    scan.current = undefined;
  }
}

function append(scan: Scan, text: string): void {
  scan.current = (scan.current ?? '') + text;
}

function scanQuoted(scan: Scan, char: string): void {
  if (char === '\\') {
    scan.escape = true;
  } else if (char === scan.quote) {
    scan.quote = undefined;
  } else {
    append(scan, char);
  }
}

function scanPlain(scan: Scan, char: string): void {
  if (scan.current === undefined && char === '#') {
    scan.comment = true;
  } else if (char === '"' || char === "'") {
    scan.quote = char;
    scan.current ??= '';
  } else if (WHITESPACE.test(char)) {
    endToken(scan);
  } else {
    append(scan, char);
  }
}

function scanCharacter(scan: Scan, char: string): void {
  if (scan.comment) {
    scan.comment = char !== '\n';
  } else if (scan.escape) {
    append(scan, ESCAPES[char] ?? char);
    scan.escape = false;
  } else if (scan.quote === undefined) {
    scanPlain(scan, char);
  } else {
    scanQuoted(scan, char);
  }
}

export function parseArgumentFile(text: string): string[] | undefined {
  const scan: Scan = {
    tokens: [],
    current: undefined,
    quote: undefined,
    comment: false,
    escape: false,
  };
  for (const char of text) {
    scanCharacter(scan, char);
  }
  endToken(scan);
  return scan.quote === undefined ? scan.tokens : undefined;
}

function argumentFileTokens(args: readonly string[]): string[] | undefined {
  const parsed = args
    .filter((argument) => argument.startsWith('@'))
    .map((argument) =>
      valueOr(() => parseArgumentFile(readFileSync(argument.slice(1), 'utf8')), undefined),
    );
  return parsed.some((tokens) => tokens === undefined)
    ? undefined
    : parsed.flat().filter((t) => t !== undefined);
}

function hostedProvider(
  command: string,
  args: readonly string[],
  options: ToolOptions,
): SpawnSyncReturns<string> | undefined {
  const name = path.basename(command).replace(WINDOWS_SUFFIX, '');
  const binary = HOSTED_PROVIDERS.has(name) ? locateBinary(command) : undefined;
  const java = binary === undefined ? undefined : path.join(path.dirname(binary), 'java');
  const stdout = Array.isArray(options.stdio) ? options.stdio[1] : undefined;
  const fileTokens = argumentFileTokens(args);
  if (
    fileTokens === undefined ||
    !onlyPlainOptions(options, ['stdio', 'stdoutFile']) ||
    java === undefined ||
    !existsSync(java) ||
    typeof options.cwd !== 'string' ||
    (typeof stdout === 'number' && options.stdoutFile === undefined)
  ) {
    return undefined;
  }
  return dispatchToHost({
    java,
    jvmArgs: [],
    identity: ['tool', name],
    cwd: options.cwd,
    request: ['tool', 'warm', name, options.cwd, options.stdoutFile ?? '', ...args],
    checked: [...args, ...fileTokens],
    timeout: options.timeout,
    label: name,
  });
}

export function hostedToolSpawn(
  command: string,
  args: readonly string[],
  options: ToolOptions,
): SpawnSyncReturns<string> {
  return (
    (hostsDirectory() === undefined ? undefined : hostedProvider(command, args, options)) ??
    spawnSync(command, [...args], options)
  );
}
