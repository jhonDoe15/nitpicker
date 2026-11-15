import { afterEach } from 'vitest';
import type { PickLanguage } from '../area-options.mts';
import {
  JAVASCRIPT_PRESET,
  PICK_JS_SOURCE,
  PICK_SOURCE,
  createRunnerProjects,
  newConsoleOutput,
} from './runner-project.mts';

export const LANGUAGES: readonly PickLanguage[] = [
  { extension: 'ts', source: PICK_SOURCE, config: {} },
  {
    extension: 'js',
    source: PICK_JS_SOURCE,
    config: { 'nitpicker.config.json': JAVASCRIPT_PRESET },
  },
];

type ConsoleSuite = {
  readonly project: (files: Readonly<Record<string, unknown>>, script?: string) => string;
  readonly testFile: (lines: readonly string[]) => string;
  readonly newHeadOutput: (
    language: PickLanguage,
    indent: string,
  ) => ReturnType<typeof newConsoleOutput>;
  readonly brandNewError: (
    language: PickLanguage,
    testName: string,
  ) => readonly (readonly string[])[];
};

export function createConsoleSuite({
  header,
  defaultScript,
  pickTestLines,
}: {
  readonly header: readonly string[];
  readonly defaultScript: string;
  readonly pickTestLines: (first: string, second: string) => readonly string[];
}): ConsoleSuite {
  const projects = createRunnerProjects();
  afterEach(() => {
    projects.remove();
  });

  function suiteProject(files: Readonly<Record<string, unknown>>, script = defaultScript): string {
    return projects.project({
      'package.json': { name: 'p', type: 'module', scripts: { test: script } },
      'src/main/pick.js': PICK_JS_SOURCE,
      ...files,
    });
  }

  function pickTest(
    { extension, source, config }: PickLanguage,
    [first, second]: readonly [string, string],
  ): string {
    return projects.project({
      'package.json': { name: 'p', type: 'module', scripts: { test: defaultScript } },
      [`src/main/pick.${extension}`]: source,
      ...config,
      [`test/pick.test.${extension}`]: [
        ...header,
        `import { pick } from '../src/main/pick.${extension}';`,
        ...pickTestLines(first, second),
        '',
      ].join('\n'),
    });
  }

  function testFile(lines: readonly string[]): string {
    return [...header, "import { pick } from '../src/main/pick.js';", ...lines, ''].join('\n');
  }

  function newHeadOutput(
    language: PickLanguage,
    indent: string,
  ): ReturnType<typeof newConsoleOutput> {
    const old = `${indent}console.warn('old warning about the cart');\n`;
    return newConsoleOutput({
      base: pickTest(language, [old, '']),
      head: pickTest(language, ['', `${old}${indent}console.error('brand new error');\n`]),
    });
  }

  function brandNewError({ extension }: PickLanguage, testName: string): string[][] {
    return [
      [
        'test-console-output',
        `test/pick.test.${extension}`,
        `"brand new error" (test "${testName}")`,
      ],
    ];
  }

  return { project: suiteProject, testFile, newHeadOutput, brandNewError };
}
