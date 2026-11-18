import { existsSync } from 'node:fs';
import path from 'node:path';
import { runMaven } from '../../maven-command.mts';
import { readInside as untypedReadInside } from '../../../../../shared/conventions/read-inside.mjs';
import { callUntyped } from '../../../adapters/typed/java-values.mts';
import { messageOf, optionalText, textOf } from '../../../../../shared/values/readers.mts';
import type { ToolchainContext } from '../../typed/toolchain-types.mts';

type MavenHome = { readonly home?: string | undefined; readonly failure?: string };

const MAVEN_CONFIG = '.mvn/maven.config';
const USER_OPTIONS = ['-t', '--toolchains'];
const GLOBAL_OPTIONS = ['-gt', '--global-toolchains'];
const MAVEN_HOME_LINE = /^Maven home: (.+)$/mu;
const QUOTED = /^(["'])(.*)\1$/u;

function words(text: string): string[] {
  return text
    .split(/\s+/u)
    .filter((word) => word !== '')
    .map((word) => word.replace(QUOTED, '$2'));
}

function argumentWords({ projectRoot, environment }: ToolchainContext): string[] {
  return [
    ...words(optionalText(callUntyped(untypedReadInside, projectRoot, MAVEN_CONFIG, 'utf8')) ?? ''),
    ...words(environment['MAVEN_ARGS'] ?? ''),
  ];
}

function optionValue(given: readonly string[], names: readonly string[]): string | undefined {
  const values = given.flatMap((word, index) => {
    const joined = names.find((name) => word.startsWith(`${name}=`));
    if (joined !== undefined) {
      return [word.slice(joined.length + 1)];
    }
    const next = given[index + 1];
    return names.includes(word) && next !== undefined ? [next] : [];
  });
  return values.at(-1);
}

function mavenHome(context: ToolchainContext): MavenHome {
  try {
    const output = textOf(callUntyped(runMaven, { ...context, args: ['--version'] }));
    return { home: MAVEN_HOME_LINE.exec(output)?.[1]?.trim() };
  } catch (error) {
    return { failure: messageOf(error) };
  }
}

export function userToolchainsFile(context: ToolchainContext): string {
  const given = optionValue(argumentWords(context), USER_OPTIONS);
  return given === undefined
    ? path.join(context.home, '.m2', 'toolchains.xml')
    : path.resolve(context.projectRoot, given);
}

export function globalToolchainsFile(context: ToolchainContext): string | undefined {
  const given = optionValue(argumentWords(context), GLOBAL_OPTIONS);
  if (given !== undefined) {
    return path.resolve(context.projectRoot, given);
  }
  const { home } = mavenHome(context);
  return home === undefined ? undefined : path.join(home, 'conf', 'toolchains.xml');
}

export function existingFile(file: string | undefined): string | undefined {
  return file !== undefined && existsSync(file) ? file : undefined;
}
