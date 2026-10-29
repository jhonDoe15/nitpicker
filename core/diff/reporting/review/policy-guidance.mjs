const GENERIC =
  'Changes the checking policy for affected code. Restore the base setting unless a person confirms the weaker checks.';

const VERIFY_INVOCATION = [
  'If a command or runtime loads the file without an import,',
  'a reviewer confirms that invocation; otherwise remove the entry.',
].join(' ');

export const POLICY_GUIDANCE = {
  'entry-point': [
    'Marks matching files as entry points: the dead-code check treats them as used,',
    'and module-load effects and process access are allowed in them.',
    `${VERIFY_INVOCATION} Other checks still apply.`,
  ].join(' '),
  'python-entry-point': [
    'Matching files may read the process environment and the standard streams and run effects at import:',
    'process-env-access, process-stream-access and import-time-effect skip them.',
    `${VERIFY_INVOCATION} Other checks still apply.`,
  ].join(' '),
  exception: [
    'Silences the named rule for matching paths; other rules still apply.',
    'Remove the exception and fix the findings, or have a person confirm it.',
  ].join(' '),
  exclusion: [
    'Removes matching files from the checks, so their findings are not reported.',
    'Remove the entry and fix the findings, or have a person confirm it.',
  ].join(' '),
  'duplicates-scope': [
    'The duplicate-code check skips these folders, so clones inside them go unreported.',
    'Restore the previous list unless a person confirms the skip.',
  ].join(' '),
  'hidden-exclusion': [
    'Hides code this change adds or moves from the checks.',
    'Keep it under the analyzed roots and fix its findings, or have a person confirm the hiding.',
  ].join(' '),
  'hidden-exception': [
    'Exempts code this change adds or moves from the named rule.',
    'Move it out of the excepted paths and fix the findings, or have a person confirm the exception.',
  ].join(' '),
  'hidden-test-root': [
    'Code this change adds or moves is checked as test code, not production code.',
    'Move it out of the test root, or have a person confirm the reclassification.',
  ].join(' '),
  'hidden-duplicates': [
    'The duplicate-code check skips code this change adds or moves.',
    'Move it out of the skipped folders, or have a person confirm the skip.',
  ].join(' '),
  'test-root-added': [
    'Production code under this root is now checked as test code.',
    'Remove the root unless that is intended.',
  ].join(' '),
  'source-root-removed': [
    'Code under this root is no longer in the source roots, so the checks that read the roots skip it.',
    'Restore the root or move the code under another one, unless a person confirms.',
  ].join(' '),
  'test-root-removed': [
    'Tests under this root are no longer run or checked as tests.',
    'Restore the root, unless a person confirms.',
  ].join(' '),
  'generated-marker': [
    'The checks now skip these files.',
    'Remove the marker unless the file is generated.',
  ].join(' '),
  'tsconfig-removed': [
    'Type checking no longer reads this tsconfig, so its compiler options and file coverage stop applying.',
    'Restore the file.',
  ].join(' '),
  'check-js-off': [
    'JavaScript files this tsconfig covers are no longer type-checked.',
    'Set checkJs back to true.',
  ].join(' '),
  'build-roots': [
    'The build file no longer includes this checked code, so the build and the checks that need it skip the code.',
    'Restore the directory in the build file.',
  ].join(' '),
  'test-paths': [
    'pytest no longer collects these tests, so they stop running and counting toward coverage and mutation.',
    'Restore the path in testpaths.',
  ].join(' '),
  'build-filter': [
    'A build or test filter now leaves out this checked code, so it is no longer built, run or measured.',
    'Remove the filter, or have a person confirm it.',
  ].join(' '),
  'tool-config': [
    'An edited project config now applies to this tool, and nitpicker does not judge whether the edit is stricter.',
    'Restore the file, or have a person review the edit.',
  ].join(' '),
  'test-timeout': [
    'Raises or removes a test time limit, or moves tests into a project with its own limits, so slower tests pass.',
    'Restore the base limits and speed up the tests, unless a person confirms.',
  ].join(' '),
  'test-timeout-invalid': [
    'The timeout settings of the base or head are invalid, so nitpicker cannot tell whether limits were raised.',
    'Fix the setting the message names.',
  ].join(' '),
  threshold: [
    'A higher limit lets code or tests that the base limit rejected pass.',
    'Restore the base value and bring the code under it, unless a person confirms the new limit.',
  ].join(' '),
  'analyzer-disabled': [
    'Turns off this analyzer, so its findings are no longer reported.',
    'Remove it from disable unless a person confirms.',
  ].join(' '),
  'analyzer-changed': [
    'A custom analyzer that ran on the base is gone or runs differently, so what it checked may be lost.',
    'Restore its entry unless a person confirms.',
  ].join(' '),
  preset: [
    'Runs a preset that checks less than the base (for instance javascript instead of typescript).',
    'Restore the base preset unless a person confirms.',
  ].join(' '),
  'react-disabled': [
    'Turns off the React checks.',
    'Remove the setting unless the project has no React code.',
  ].join(' '),
  'i18n-disabled': [
    'Turns off the i18n checks.',
    'Remove the setting unless the project has no translations.',
  ].join(' '),
  'import-linter-disabled': [
    'Turns off the import-linter contracts.',
    'Remove the setting so the configured contracts run.',
  ].join(' '),
  'kotlin-formatter-off': [
    'Turns off the Kotlin format check.',
    'Restore ktlint or ktfmt, or remove the setting to detect one.',
  ].join(' '),
  'kotlin-detekt-config': [
    'Points detekt at another config, which may relax its rules; nitpicker does not judge that.',
    'Restore the base path, or have a person review the new config.',
  ].join(' '),
  'tool-precedence': [
    "The project's own tool config now outranks nitpicker's, or nitpicker's is dropped,",
    'so the project can relax the checks.',
    'Restore the base precedence.',
  ].join(' '),
  'spring-roles-shrank': [
    'Drops a Spring role mapping, so the classes it marked lose that role and its layering checks.',
    'Restore the mapping.',
  ].join(' '),
};

export function policyKindGuidance(kind) {
  return POLICY_GUIDANCE[kind] ?? GENERIC;
}

export function hasSpecificGuidance(kind) {
  return Object.hasOwn(POLICY_GUIDANCE, kind);
}
