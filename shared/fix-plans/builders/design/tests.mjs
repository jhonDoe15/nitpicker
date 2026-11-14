import { subjectOfTest } from '../../plan-parts/files.mjs';
import { allowedFormOf, without } from '../../plan-parts/finding.mjs';
import { ALL_PRESETS } from '../../plan-parts/presets.mjs';
import { importSpecifier, linesOf } from '../../plan-parts/source.mjs';
import { stepsOf } from '../../plan-parts/steps.mjs';

const MAX_IMPORTS = 8;

function importsOf(text) {
  if (text === undefined) {
    return [];
  }
  return linesOf(text)
    .map(importSpecifier)
    .filter((specifier) => specifier !== undefined)
    .slice(0, MAX_IMPORTS);
}

function exerciseProduction(finding, env) {
  const subject = subjectOfTest(finding.path, (candidate) => env.exists(candidate));
  const imports = importsOf(env.read(finding.path));
  const line = finding.location?.line ?? 1;
  return {
    kind: 'exercise-production-code',
    target: { path: finding.path, startLine: line, endLine: line },
    context: without({ subject, imports: imports.length === 0 ? undefined : imports }),
    steps: stepsOf(
      subject === undefined
        ? `Find the production code that ${finding.path} is about.`
        : `Import and call the code the test is about: ${subject}.`,
      allowedFormOf(finding, 'Import and run the production code the test is about.'),
      'Assert what the production code returns or does, so the test fails when it breaks.',
    ),
  };
}

export const TEST_BUILDERS = [
  {
    id: 'exercise-production-code',
    rules: [
      { tool: 'test-runtime', rule: 'no-production-runtime' },
      { tool: 'test-runtime', rule: 'type-only-production-dependency' },
    ],
    presets: ALL_PRESETS,
    build: exerciseProduction,
  },
];
