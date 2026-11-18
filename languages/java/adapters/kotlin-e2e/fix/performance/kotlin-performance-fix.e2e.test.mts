import { describe, expect, it } from 'vitest';
import { useFixProject } from '../test-support/kotlin-fix-views.mts';
import { BUILD, RULES, SHAPES, SOURCES, SUPPORT } from './performance-shapes.mts';

const enabled = process.env['NITPICKER_KOTLIN_E2E'] === '1';
const { fix } = useFixProject();

describe.skipIf(!enabled)('nitpicker --fix with the Kotlin performance recipes named', () => {
  it('rewrites each shape and the fixed project still builds', () => {
    const result = fix({
      committed: {
        ...BUILD,
        ...SUPPORT,
        'nitpicker.config.json': '{ "preset": "kotlin", "kotlin": { "formatter": "none" } }\n',
      },
      changed: Object.fromEntries(SHAPES.map(({ file, before }) => [`${SOURCES}/${file}`, before])),
      cliArguments: ['--fix', '--no-cache', ...RULES],
      realAnalyzers: true,
    });

    expect(
      {
        files: Object.fromEntries(
          SHAPES.map(({ file }) => [file, result.read(`${SOURCES}/${file}`)]),
        ),
        toolErrors: result.toolErrors(),
      },
      result.stdout + result.stderr,
    ).toEqual({
      files: Object.fromEntries(SHAPES.map(({ file, after }) => [file, after])),
      toolErrors: [],
    });
  });
});
