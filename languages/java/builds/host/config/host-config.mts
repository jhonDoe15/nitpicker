import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { type HostEnvironment, hostEnvironment } from './host-environment.config.mts';
import { valueOr } from '../../../../../shared/values/attempt/attempt.mts';

export type HostConfig = {
  readonly owner: number;
  readonly classpath: string;
  readonly maxHosts: number;
};
export type HostedTool = {
  readonly paths: 'absolute' | 'resolved';
  readonly loader: 'warm' | 'fresh';
};

export const PLAIN_TOOL: HostedTool = { paths: 'absolute', loader: 'warm' };
const RESOLVING_TOOL: HostedTool = { ...PLAIN_TOOL, paths: 'resolved' };

export const HOST_CONFIG_FILE = 'config.json';
export const HOST_MAIN_CLASS = 'nitpicker.host.ToolHost';
export const HOST_RELEASE = 17;
const MIB = 1024 ** 2;
const IDLE_HOST_BYTES = 120 * MIB;
const IDLE_MEMORY_SHARE = 0.12;
const SPARE_HOSTS = 2;
const MIN_HOSTS = 4;
const UNHOSTED_PROVIDERS = 2;
const SOCKET_PATH_LIMIT = 100;

export const HOSTED_TOOLS: Readonly<Record<string, HostedTool>> = {
  'net.sourceforge.pmd.cli.PmdCli': PLAIN_TOOL,
  'com.puppycrawl.tools.checkstyle.Main': PLAIN_TOOL,
  'de.thetaphi.forbiddenapis.cli.CliMain': PLAIN_TOOL,
  'com.google.googlejavaformat.java.Main': PLAIN_TOOL,
  CpdReport: PLAIN_TOOL,
  GeneratedClasses: PLAIN_TOOL,
  StructureMetrics: RESOLVING_TOOL,
  'nitpicker.effects.Effects': PLAIN_TOOL,
  'io.gitlab.arturbosch.detekt.cli.Main': PLAIN_TOOL,
  'nitpicker.kotlinpsi.KotlinPsi': RESOLVING_TOOL,
};

export function hostedTool(
  mainClass: string | undefined,
  allowed: Readonly<Record<string, HostedTool>> = HOSTED_TOOLS,
): HostedTool | undefined {
  return mainClass === undefined || !Object.hasOwn(allowed, mainClass)
    ? undefined
    : allowed[mainClass];
}

export function hostsDirectory(
  environment: HostEnvironment = hostEnvironment(),
): string | undefined {
  const directory = environment.hostsDirectory;
  return process.platform === 'win32' ||
    environment.hostingOff ||
    directory === undefined ||
    directory === ''
    ? undefined
    : directory;
}

export function socketFits(directory: string, key: string): boolean {
  return path.join(directory, `${key}.sock`).length <= SOCKET_PATH_LIMIT;
}

export function readHostConfig(directory: string): HostConfig | undefined {
  const value: unknown = valueOr(
    (): unknown => JSON.parse(readFileSync(path.join(directory, HOST_CONFIG_FILE), 'utf8')),
    undefined,
  );
  const owner = fieldOf(value, 'owner');
  const classpath = fieldOf(value, 'classpath');
  const maxHosts = fieldOf(value, 'maxHosts');
  return typeof owner === 'number' && typeof classpath === 'string' && typeof maxHosts === 'number'
    ? { owner, classpath, maxHosts }
    : undefined;
}

export function hostCap(memory: number): number | undefined {
  const working = Object.keys(HOSTED_TOOLS).length + UNHOSTED_PROVIDERS;
  const affordable = Math.floor((memory * IDLE_MEMORY_SHARE) / IDLE_HOST_BYTES);
  return affordable < MIN_HOSTS ? undefined : Math.min(affordable, working + SPARE_HOSTS);
}
