export const QUALITY_NOTES = {
  'crap-score-limit': [
    "A function whose CRAP score (its complexity combined with how little of it the tests cover) is at or above the limit.",
    'Complex code that tests do not cover is the code most likely to break unnoticed.',
    'Test the uncovered branches, or split a branchy part into its own function.',
  ],
  'crap-coverage-unknown': [
    'A function with unknown coverage and so no CRAP score, because no test runs it.',
    'A function no test runs cannot be scored, and is the riskiest kind.',
    'Add a test that calls it; for inline composition-root wiring, move it into a named function and test that.',
  ],
  'changed-branch-coverage': [
    'A branch the change added or touched with coverage below the minimum.',
    'Only changed code is held to coverage, so a change cannot add code that no test exercises.',
    'Cover the branch with a test. When a branch cannot be reached from a test, accept it with an exception that names its function; it applies to that function only.',
  ],
  'mutant-survived': [
    'A mutant (a small deliberate change to production code) that every test survived.',
    'A mutant that survives shows a test that runs the code without checking what it does.',
    'Strengthen the test so that it fails for the mutant: assert the exact value instead of only running the code. An equivalent mutant is accepted with an exception after review.',
  ],
  'mutant-nocoverage': [
    'A mutant in code that no test runs.',
    'Code no test reaches is not protected against change.',
    'Add a test that runs the code and asserts its result.',
  ],
  'duplicate-clone': [
    'A new block of code that repeats another block, also when only the names and literals differ.',
    'Copies drift apart and each fix has to be made twice.',
    'Extract the shared code into one function or module and call it from both places. When the copies are meant to be copies, the message names the files to add to `exclude`.',
  ],
  'stability-direction': [
    'A package that depends on a less stable package.',
    'Stable code that depends on volatile code breaks whenever the volatile code changes (the Stable Dependencies Principle).',
    'Depend on an abstraction in a more stable package, or move the dependency inward. An import that exists only for the type checker is never the reported dependency.',
  ],
  'slow-test': [
    'A test the change adds or edits that takes longer than the limit for its kind (unit or integration).',
    'Slow tests slow every run and are the first to be skipped; most tests should be fast unit tests.',
    'Make the test fast: inject a clock or a fake instead of waiting, or move it to the integration tests, which have a higher limit.',
  ],
  'test-console-output': [
    'A test file that prints console error or warn output the base run did not print.',
    'Console noise hides real warnings and usually points at a leaked timer or an unhandled error.',
    'Fix the cause of the output, or allow a third-party message in `testConsole.allow` of nitpicker.config.json.',
  ],
  'no-production-runtime': [
    'A test that runs no production runtime code.',
    'A test that never runs the code it is named for cannot fail when that code breaks.',
    'Import and run the production code the test is about.',
  ],
  'type-only-production-dependency': [
    "A test whose only link to production code is a type-only import.",
    'A type import proves nothing at runtime, so the test cannot fail when the code breaks.',
    'Import and run the production code the test is about.',
  ],
  'baseline-expansion': [
    'A change raises an allowance in the legacy baseline (`nitpicker.legacy.json`).',
    'The baseline records old problems so that they can shrink; raising it would hide new ones.',
    'Fix the new sites instead of baselining them.',
  ],
  'public-alternative-bypass': [
    'An import that goes around the public entry point of a package.',
    'Importing internals defeats the entry point that keeps a package replaceable.',
    'Import from the public entry point.',
  ],
  'doc-comment-content': [
    'A doc comment that only restates its declaration name, or whose description is longer than the limit.',
    'A comment that repeats the name adds noise; a long one belongs in names and types.',
    'Delete the comment, or say what the name cannot: a unit, a limit, an edge case or why. TypeScript and JavaScript report this as `nitpicker/no-comments`.',
  ],
};
