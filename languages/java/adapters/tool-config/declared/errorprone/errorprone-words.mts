export const MEASURED_OPTIONS: ReadonlySet<string> = new Set([
  'CheckReturnValue:Packages',
  'NullAway:AnnotatedPackages',
]);
export const NULLAWAY_RAISING: ReadonlySet<string> = new Set([
  ...['CheckOptionalEmptiness', 'CheckContracts', 'AcknowledgeRestrictiveAnnotations'],
  ...['AcknowledgeAndroidRecent', 'ExhaustiveOverride', 'JSpecifyMode'],
]);
export const NULLAWAY_LISTS = ['CheckOptionalEmptinessCustomClasses', 'CustomNullableAnnotations'];
export const NULLAWAY_OPTION_NAMES: ReadonlyMap<string, string> = new Map([
  ['jspecifyMode', 'JSpecifyMode'],
]);
export const SOURCE_PATHS = [
  'src/main/java/A.java',
  '/p/src/main/java/A.java',
  '/p/src/main/kotlin/A.java',
];
export const WINNING_FLAGS: ReadonlySet<string> = new Set([
  '-XepIgnoreSuppressionAnnotations',
  '-XepAllSuggestionsAsWarnings',
]);
export const MOOT_FLAGS: ReadonlySet<string> = new Set(['-XepAllErrorsAsWarnings']);
export const SEVERITIES = ['off', 'warn', 'error', 'default'];
export const BOOLEAN_FLAGS: ReadonlyMap<string, string> = new Map([
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
export const SEVERITY_CALLS: ReadonlyMap<string, string> = new Map(
  Object.entries({ disable: 'OFF', enable: 'WARN', warn: 'WARN', error: 'ERROR' }),
);
export const ERRORPRONE_NAMES = [
  ...SEVERITY_CALLS.keys(),
  ...['check', 'option', 'excludedPaths', 'errorproneArgs', 'enabled'],
  ...BOOLEAN_FLAGS.keys(),
];
export const NULLAWAY_NAMES = [
  ...['annotatedPackages', 'unannotatedSubPackages', 'unannotatedClasses', 'knownInitializers'],
  ...['excludedClassAnnotations', 'excludedClasses', 'excludedFieldAnnotations'],
  ...['customInitializerAnnotations', 'externalInitAnnotations', 'treatGeneratedAsUnannotated'],
  ...['acknowledgeRestrictiveAnnotations', 'checkOptionalEmptiness', 'assertsEnabled'],
  ...['exhaustiveOverride', 'castToNonNullMethod', 'checkOptionalEmptinessCustomClasses'],
  ...['handleTestAssertionLibraries', 'acknowledgeAndroidRecent', 'checkContracts'],
  ...['customContractAnnotations', 'customNullableAnnotations', 'customNonnullAnnotations'],
  ...['customGeneratedCodeAnnotations', 'jspecifyMode', 'extraFuturesClasses', 'onlyNullMarked'],
];
export const FLAG = /^-Xep(?::|Opt:|[A-Z])/u;
export const LOOKED =
  'Error Prone settings in the build (an options.errorprone or nullaway block in a build.gradle(.kts), or -Xep flags after -Xplugin:ErrorProne in the compilerArgs of maven-compiler-plugin in a pom.xml)';
