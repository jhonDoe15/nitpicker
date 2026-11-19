import { readFileSync } from 'node:fs';
import { missingProjectConfig as untypedMissingProjectConfig } from '../../../../../../shared/conventions/tool-precedence.mjs';
import { mavenTextsOf } from '../../../../builds/narrowing/maven-sources.mts';
import {
  declarationText,
  gradleSettings,
  mavenPluginDeclarations,
  mavenText,
  quotedStrings,
} from '../declared-build.mts';
import {
  fieldOf,
  fieldsOf,
  textsOf as stringsOf,
} from '../../../../../../shared/values/readers.mts';
import type {
  ChoiceContext,
  DeclaredBuild,
  Declaration,
  ErrorproneChecks,
  ErrorproneLayers,
  FlagOutcome,
  FoundSetting,
  Pom,
  ChoiceLayers,
  Script,
  ToolChoice,
  ToolSpec,
} from '../declared-types.mts';

import { excludedPaths, pathCheck, unionedOptions } from './errorprone-flags.mts';
import {
  MEASURED_OPTIONS,
  NULLAWAY_RAISING,
  NULLAWAY_LISTS,
  NULLAWAY_OPTION_NAMES,
  WINNING_FLAGS,
  MOOT_FLAGS,
  SEVERITIES,
  BOOLEAN_FLAGS,
  SEVERITY_CALLS,
  ERRORPRONE_NAMES,
  NULLAWAY_NAMES,
  FLAG,
  LOOKED,
} from './errorprone-words.mts';

const DROPPED = 'dropped';
const missingProjectConfig: (tool: string, looked: string) => string = untypedMissingProjectConfig;

function unescaped(text: string): string {
  return text.replaceAll(/\\(.)/gu, '$1');
}

function literals(value: string): string[] {
  return quotedStrings(value).map(unescaped);
}

function flagged(found: FoundSetting, flags: readonly string[]): Declaration[] {
  const settings = found.conditional ? [found.text.trim()] : flags;
  return settings.map((flag) => ({ file: found.file, text: found.text.trim(), setting: flag }));
}

function severityFlags(found: FoundSetting): string[] {
  if (found.name === 'check') {
    const [name] = literals(found.value);
    const words = found.value.toLowerCase().match(/[a-z]+/gu) ?? [];
    const severity = words.findLast((word) => SEVERITIES.includes(word));
    const level =
      severity === undefined || severity === 'default' ? '' : `:${severity.toUpperCase()}`;
    return name === undefined ? [] : [`-Xep:${name}${level}`];
  }
  return literals(found.value).map(
    (name) => `-Xep:${name}:${SEVERITY_CALLS.get(found.name) ?? ''}`,
  );
}

function isTrue(value: string): boolean {
  const text = value.trimStart();
  return (text.startsWith('(') ? text.slice(1).trimStart() : text).startsWith('true');
}

function errorproneFlags(found: FoundSetting): string[] {
  if (SEVERITY_CALLS.has(found.name) || found.name === 'check') {
    return severityFlags(found);
  }
  if (found.name === 'option') {
    const [key, value] = literals(found.value);
    return key === undefined ? [] : [`-XepOpt:${key}=${value ?? 'true'}`];
  }
  if (found.name === 'excludedPaths') {
    return literals(found.value).map((pattern) => `-XepExcludedPaths:${pattern}`);
  }
  if (found.name === 'errorproneArgs') {
    return pluginTokens(literals(found.value));
  }
  if (found.name === 'enabled') {
    return isTrue(found.value) ? [] : ['errorprone.enabled = false'];
  }
  const flag = BOOLEAN_FLAGS.get(found.name);
  return isTrue(found.value) && flag !== undefined ? [flag] : [];
}

function nullawayFlags(found: FoundSetting): string[] {
  const values = literals(found.value);
  const flag = isTrue(found.value) ? 'true' : undefined;
  const value = values.length === 0 ? flag : values.join(',');
  const option =
    NULLAWAY_OPTION_NAMES.get(found.name) ??
    `${found.name.charAt(0).toUpperCase()}${found.name.slice(1)}`;
  return value === undefined ? [] : [`-XepOpt:NullAway:${option}=${value}`];
}

function pluginTokens(texts: readonly string[]): string[] {
  return texts
    .filter((text) => text.includes('-Xplugin:ErrorProne') || FLAG.test(text.trim()))
    .flatMap((text) => text.trim().split(/\s+/u))
    .filter((token) => FLAG.test(token));
}

function gradleDeclarations(scripts: readonly Script[]): Declaration[] {
  const settings = gradleSettings(scripts, {
    context: /errorprone/iu,
    skip: /nullaway/iu,
    names: ERRORPRONE_NAMES,
  }).flatMap((found) => flagged(found, errorproneFlags(found)));
  const compilerArgs = gradleSettings(scripts, { context: /./u, names: ['compilerArgs'] }).flatMap(
    (found) => flagged(found, pluginTokens(literals(found.value))),
  );
  const nullaway = gradleSettings(scripts, {
    context: /nullaway/iu,
    names: NULLAWAY_NAMES,
  }).flatMap((found) => flagged(found, nullawayFlags(found)));
  return [...settings, ...nullaway, ...compilerArgs];
}

function mavenDeclarations(poms: readonly Pom[]): Declaration[] {
  return mavenPluginDeclarations(
    poms,
    new Set(['maven-compiler-plugin']),
    ({ pom, configuration }) =>
      [
        ...mavenTextsOf(configuration, 'compilerArgs', 'arg'),
        ...mavenTextsOf(configuration, 'compilerArgument'),
      ].flatMap((text) =>
        pluginTokens([mavenText(poms, pom, text)]).map((flag) => ({
          file: pom.file,
          text: `<arg>${text}</arg>`,
          setting: flag,
        })),
      ),
  );
}

export function errorproneDeclarations(build: DeclaredBuild): Declaration[] {
  return [...gradleDeclarations(build.scripts), ...mavenDeclarations(build.poms)];
}

function nitpickerChecks(): ErrorproneChecks {
  const checks: unknown = JSON.parse(
    readFileSync(new URL('../../../../gradle/errorprone/checks.json', import.meta.url), 'utf8'),
  );
  return {
    reviewed: new Set(stringsOf(fieldOf(checks, 'reviewedChecks'))),
    off: new Set(stringsOf(fieldOf(checks, 'disable'))),
    on: new Set([
      ...stringsOf(fieldOf(checks, 'enable')),
      ...stringsOf(fieldOf(checks, 'lombokUnsuppressedOff')),
    ]),
    nullAway: new Map(Object.entries(fieldsOf(fieldOf(checks, 'nullAway')))),
  };
}

function checkFlag(
  flag: string,
  { projectWins, checks }: { projectWins: boolean; checks: ErrorproneChecks },
): FlagOutcome {
  const [, name = '', severity = 'WARN'] = flag.split(':');
  if (severity.toUpperCase() === 'OFF') {
    return checks.off.has(name) ? 'moot' : DROPPED;
  }
  if (name === 'NullAway' || !checks.reviewed.has(name)) {
    return DROPPED;
  }
  if (checks.on.has(name)) {
    return 'moot';
  }
  return !checks.off.has(name) || projectWins ? `-Xep:${name}:WARN` : DROPPED;
}

function optionFlag(flag: string, checks: ErrorproneChecks): FlagOutcome {
  const [key = '', value] = flag.slice('-XepOpt:'.length).split('=');
  const [check, option = ''] = key.split(':');
  if (MEASURED_OPTIONS.has(key) || check !== 'NullAway') {
    return MEASURED_OPTIONS.has(key) ? DROPPED : flag;
  }
  const raising = NULLAWAY_RAISING.has(option) && value === 'true';
  const listed = NULLAWAY_LISTS.includes(option) || checks.nullAway.has(option);
  return raising || listed ? flag : DROPPED;
}

function classified(
  flag: string,
  context: { projectWins: boolean; checks: ErrorproneChecks },
): FlagOutcome {
  const { projectWins } = context;
  if (/\s/u.test(flag) || flag.includes('$')) {
    return DROPPED;
  }
  if (flag.startsWith('-Xep:')) {
    return checkFlag(flag, context);
  }
  if (flag.startsWith('-XepOpt:')) {
    return optionFlag(flag, context.checks);
  }
  if (flag.startsWith('-XepExcludedPaths:')) {
    return pathCheck(flag.slice('-XepExcludedPaths:'.length)).kind === 'kept' ? flag : DROPPED;
  }
  if (MOOT_FLAGS.has(flag)) {
    return 'moot';
  }
  return WINNING_FLAGS.has(flag) && projectWins ? flag : DROPPED;
}

export function errorproneLayers(
  declarations: readonly Declaration[],
  { projectWins }: { projectWins: boolean },
): ErrorproneLayers {
  const checks = nitpickerChecks();
  const outcomes = declarations.map((declaration) => ({
    declaration,
    outcome: classified(declaration.setting, { projectWins, checks }),
  }));
  const applied = outcomes
    .map(({ outcome }) => outcome)
    .filter((outcome) => outcome !== 'moot' && outcome !== DROPPED);
  return {
    flags: excludedPaths(unionedOptions([...new Set(applied)], checks.nullAway)),
    notApplied: outcomes
      .filter(({ outcome }) => outcome === DROPPED)
      .map(({ declaration }) => declaration),
  };
}

function errorproneChoice(build: DeclaredBuild, { layers }: ChoiceContext): ToolChoice {
  const declarations = errorproneDeclarations(build);
  if (declarations.length === 0) {
    throw new Error(missingProjectConfig('errorprone', LOOKED));
  }
  return {
    arguments: errorproneLayers(declarations, { projectWins: !layers.nitpickerFirst }).flags,
    files: [],
  };
}

function errorproneNotice(declarations: readonly Declaration[], layers: ChoiceLayers): string[] {
  const { notApplied } = errorproneLayers(declarations, { projectWins: !layers.nitpickerFirst });
  if (notApplied.length === 0) {
    return [];
  }
  const skipped = notApplied.map(
    (declaration) => `${declarationText(declaration)} (${declaration.file})`,
  );
  return [
    `Error Prone runs nitpicker's checks with your flags laid over them; not applied from your build, because they would drop findings or name no check nitpicker's Error Prone has: ${[...new Set(skipped)].join(', ')}`,
  ];
}

export const ERRORPRONE: ToolSpec = {
  label: 'Error Prone',
  declarations: errorproneDeclarations,
  choice: errorproneChoice,
  notice: errorproneNotice,
};
