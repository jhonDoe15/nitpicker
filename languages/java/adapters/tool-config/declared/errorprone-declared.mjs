import { readFileSync } from 'node:fs';
import { missingProjectConfig } from '../../../../../shared/conventions/tool-precedence.mjs';
import { configurations, pluginsNamed, textsOf } from '../../../builds/narrowing/maven-sources.mjs';
import { declarationText, gradleSettings, mavenText, quotedStrings } from './declared-build.mjs';

const MEASURED_OPTIONS = new Set(['CheckReturnValue:Packages', 'NullAway:AnnotatedPackages']);
const NARROWING_OPTIONS = new Set(
  [
    'UnannotatedSubPackages',
    'UnannotatedClasses',
    'ExcludedClasses',
    'ExcludedClassAnnotations',
    'TreatGeneratedAsUnannotated',
    'OnlyNullMarked',
    'CustomGeneratedCodeAnnotations',
  ].map((name) => `NullAway:${name}`),
);
const SCOPE_FLAGS = new Set(['-XepDisableWarningsInGeneratedCode']);
const PROJECT_WINS_FLAGS = new Set([
  '-XepIgnoreSuppressionAnnotations',
  '-XepAllSuggestionsAsWarnings',
]);
const MOOT_FLAGS = new Set(['-XepAllErrorsAsWarnings']);
const SEVERITIES = ['off', 'warn', 'error', 'default'];
const BOOLEAN_FLAGS = new Map([
  ['disableWarningsInGeneratedCode', '-XepDisableWarningsInGeneratedCode'],
  ['ignoreSuppressionAnnotations', '-XepIgnoreSuppressionAnnotations'],
  ['allDisabledChecksAsWarnings', '-XepAllDisabledChecksAsWarnings'],
  ['allSuggestionsAsWarnings', '-XepAllSuggestionsAsWarnings'],
  ['allErrorsAsWarnings', '-XepAllErrorsAsWarnings'],
  ['disableAllChecks', '-XepDisableAllChecks'],
  ['disableAllWarnings', '-XepDisableAllWarnings'],
  ['ignoreUnknownCheckNames', '-XepIgnoreUnknownCheckNames'],
  ['isCompilingTestOnlyCode', '-XepCompilingTestOnlyCode'],
]);
const SEVERITY_CALLS = new Map([
  ['disable', 'OFF'],
  ['enable', 'WARN'],
  ['warn', 'WARN'],
  ['error', 'ERROR'],
]);
const ERRORPRONE_NAMES = [
  ...SEVERITY_CALLS.keys(),
  'check',
  'option',
  'excludedPaths',
  'errorproneArgs',
  'enabled',
  ...BOOLEAN_FLAGS.keys(),
];
const NULLAWAY_NAMES = [
  ...['annotatedPackages', 'unannotatedSubPackages', 'unannotatedClasses', 'knownInitializers'],
  ...['excludedClassAnnotations', 'excludedClasses', 'excludedFieldAnnotations'],
  ...['customInitializerAnnotations', 'externalInitAnnotations', 'treatGeneratedAsUnannotated'],
  ...['acknowledgeRestrictiveAnnotations', 'checkOptionalEmptiness', 'assertsEnabled'],
  ...['exhaustiveOverride', 'castToNonNullMethod', 'checkOptionalEmptinessCustomClasses'],
  ...['handleTestAssertionLibraries', 'acknowledgeAndroidRecent', 'checkContracts'],
  ...['customContractAnnotations', 'customNullableAnnotations', 'customNonnullAnnotations'],
  ...['customGeneratedCodeAnnotations', 'jspecifyMode', 'extraFuturesClasses', 'onlyNullMarked'],
];
const FLAG = /^-Xep(?::|Opt:|[A-Z])/u;
const LOOKED =
  'Error Prone settings in the build (an options.errorprone or nullaway block in a build.gradle(.kts), or -Xep flags after -Xplugin:ErrorProne in the compilerArgs of maven-compiler-plugin in a pom.xml)';

function unescaped(text) {
  return text.replaceAll(/\\(.)/gu, '$1');
}

function literals(value) {
  return quotedStrings(value).map(unescaped);
}

function flagged(found, flags) {
  return flags.map((flag) => ({ file: found.file, text: found.text.trim(), setting: flag }));
}

function severityFlags(found) {
  if (found.name === 'check') {
    const [name] = literals(found.value);
    const words = found.value.toLowerCase().match(/[a-z]+/gu) ?? [];
    const severity = words.findLast((word) => SEVERITIES.includes(word));
    const level =
      severity === undefined || severity === 'default' ? '' : `:${severity.toUpperCase()}`;
    return name === undefined ? [] : [`-Xep:${name}${level}`];
  }
  return literals(found.value).map((name) => `-Xep:${name}:${SEVERITY_CALLS.get(found.name)}`);
}

function isTrue(value) {
  const text = value.trimStart();
  return (text.startsWith('(') ? text.slice(1).trimStart() : text).startsWith('true');
}

function errorproneFlags(found) {
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
  return isTrue(found.value) ? [BOOLEAN_FLAGS.get(found.name)] : [];
}

function nullawayFlags(found) {
  const values = literals(found.value);
  const flag = isTrue(found.value) ? 'true' : undefined;
  const value = values.length === 0 ? flag : values.join(',');
  const option = `${found.name[0].toUpperCase()}${found.name.slice(1)}`;
  return value === undefined ? [] : [`-XepOpt:NullAway:${option}=${value}`];
}

function pluginTokens(texts) {
  return texts
    .filter((text) => text.includes('-Xplugin:ErrorProne') || FLAG.test(text.trim()))
    .flatMap((text) => text.trim().split(/\s+/u))
    .filter((token) => FLAG.test(token));
}

function gradleDeclarations(scripts) {
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

function mavenDeclarations(poms) {
  return poms
    .filter((pom) => pom.project !== undefined)
    .flatMap((pom) =>
      pluginsNamed(pom.project, new Set(['maven-compiler-plugin']))
        .flatMap((plugin) => configurations(plugin))
        .flatMap((configuration) => [
          ...textsOf(configuration, 'compilerArgs', 'arg'),
          ...textsOf(configuration, 'compilerArgument'),
        ])
        .flatMap((text) =>
          pluginTokens([mavenText(poms, pom, text)]).map((flag) => ({
            file: pom.file,
            text: `<arg>${text}</arg>`,
            setting: flag,
          })),
        ),
    );
}

export function errorproneDeclarations(build) {
  return [...gradleDeclarations(build.scripts), ...mavenDeclarations(build.poms)];
}

function nitpickerChecks() {
  const checks = JSON.parse(
    readFileSync(new URL('../../../gradle/errorprone/checks.json', import.meta.url), 'utf8'),
  );
  return {
    reviewed: new Set(checks.reviewedChecks),
    off: new Set(checks.disable),
    on: new Set([...checks.enable, ...checks.lombokUnsuppressedOff]),
    nullAway: new Map(Object.entries(checks.nullAway)),
  };
}

function checkFlag(flag, { projectWins, checks }) {
  const [, name, severity = 'WARN'] = flag.split(':');
  if (severity.toUpperCase() === 'OFF') {
    return checks.off.has(name) ? 'moot' : 'dropped';
  }
  if (name === 'NullAway' || !checks.reviewed.has(name)) {
    return 'dropped';
  }
  if (checks.on.has(name)) {
    return 'moot';
  }
  return !checks.off.has(name) || projectWins ? `-Xep:${name}:WARN` : 'dropped';
}

function optionFlag(flag) {
  const key = flag.slice('-XepOpt:'.length).split('=')[0];
  return MEASURED_OPTIONS.has(key) || NARROWING_OPTIONS.has(key) ? 'dropped' : flag;
}

function classified(flag, context) {
  const { projectWins } = context;
  if (/\s/u.test(flag) || flag.includes('$')) {
    return 'dropped';
  }
  if (flag.startsWith('-Xep:')) {
    return checkFlag(flag, context);
  }
  if (flag.startsWith('-XepOpt:')) {
    return optionFlag(flag);
  }
  if (flag.startsWith('-XepExcludedPaths:') || SCOPE_FLAGS.has(flag)) {
    return flag;
  }
  if (MOOT_FLAGS.has(flag)) {
    return 'moot';
  }
  return PROJECT_WINS_FLAGS.has(flag) && projectWins ? flag : 'dropped';
}

function unionedOptions(flags, lists) {
  const merged = new Map();
  const others = flags.filter((flag) => {
    const [key, value = ''] = flag.slice('-XepOpt:NullAway:'.length).split('=');
    if (!flag.startsWith('-XepOpt:NullAway:') || !lists.has(key)) {
      return true;
    }
    merged.set(key, [...(merged.get(key) ?? lists.get(key)), ...value.split(',')]);
    return false;
  });
  const unions = [...merged].map(
    ([key, values]) => `-XepOpt:NullAway:${key}=${[...new Set(values)].filter(Boolean).join(',')}`,
  );
  return [...others, ...unions];
}

function excludedPaths(flags) {
  const patterns = flags.filter((flag) => flag.startsWith('-XepExcludedPaths:'));
  const others = flags.filter((flag) => !flag.startsWith('-XepExcludedPaths:'));
  if (patterns.length < 2) {
    return flags;
  }
  const joined = patterns.map((flag) => `(?:${flag.slice('-XepExcludedPaths:'.length)})`);
  return [...others, `-XepExcludedPaths:${joined.join('|')}`];
}

export function errorproneLayers(declarations, { projectWins }) {
  const checks = nitpickerChecks();
  const outcomes = declarations.map((declaration) => ({
    declaration,
    outcome: classified(declaration.setting, { projectWins, checks }),
  }));
  const applied = outcomes
    .map(({ outcome }) => outcome)
    .filter((outcome) => outcome !== 'moot' && outcome !== 'dropped');
  return {
    flags: excludedPaths(unionedOptions([...new Set(applied)], checks.nullAway)),
    notApplied: outcomes
      .filter(({ outcome }) => outcome === 'dropped')
      .map(({ declaration }) => declaration),
  };
}

function errorproneChoice(build, { layers }) {
  const declarations = errorproneDeclarations(build);
  if (declarations.length === 0) {
    throw new Error(missingProjectConfig('errorprone', LOOKED));
  }
  return {
    arguments: errorproneLayers(declarations, { projectWins: !layers.nitpickerFirst }).flags,
    files: [],
  };
}

function errorproneNotice(declarations, layers) {
  const { notApplied } = errorproneLayers(declarations, { projectWins: !layers.nitpickerFirst });
  if (notApplied.length === 0) {
    return [];
  }
  const skipped = notApplied.map(
    (declaration) => `${declarationText(declaration)} (${declaration.file})`,
  );
  return [
    `Error Prone runs nitpicker's checks with your flags laid over them; not applied from your build, because they turn a check off, narrow NullAway or name no check nitpicker's Error Prone has: ${[...new Set(skipped)].join(', ')}`,
  ];
}

export const ERRORPRONE = {
  label: 'Error Prone',
  declarations: errorproneDeclarations,
  choice: errorproneChoice,
  notice: errorproneNotice,
};
