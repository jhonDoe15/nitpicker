import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kotlinFormat, kotlinFormatterPlan } from './kotlin-format.mjs';
import { fakeJvmTools } from './test-support/fake-jvm-tools.mjs';

const PINNED = { ktlint: '1.8.0', ktfmt: '0.64' };
const SOURCES = new Map([['app/src/A.kt', 'class  A\n']]);

describe('kotlinFormatterPlan', () => {
  it('asks for the pinned ktlint fat jar without its dependencies', () => {
    expect(kotlinFormatterPlan('ktlint', PINNED)).toEqual({
      label: 'ktlint',
      operation: 'ktlint-fix',
      tools: {
        ktlint: { coordinates: 'com.pinterest.ktlint:ktlint-cli:1.8.0:all', transitive: false },
      },
    });
  });
  it('asks for the pinned ktfmt jar with its dependencies bundled', () => {
    expect(kotlinFormatterPlan('ktfmt', PINNED).tools).toEqual({
      ktfmt: { coordinates: 'com.facebook:ktfmt:0.64:with-dependencies', transitive: false },
    });
  });
  it('plans nothing when no Kotlin formatter runs', () => {
    expect(kotlinFormatterPlan('none', PINNED)).toBeUndefined();
  });
});

describe('kotlinFormat', () => {
  it('mirrors the editorconfig files above the sources, at the offset of the project', () => {
    const tools = fakeJvmTools();
    const style = {
      offset: 'app',
      editorconfigs: [
        { path: '.editorconfig', text: 'root = true\n' },
        { path: 'app/.editorconfig', text: '[*.kt]\nindent_size = 2\n' },
      ],
    };

    const { formatted } = kotlinFormat({
      formatter: 'ktlint',
      tools: {},
      style,
      classpath: ['/k.jar'],
      executeFixCommand: tools.executeFixCommand,
    })(SOURCES);

    expect(formatted.get('app/src/A.kt')).toBe('class A\n');
    const [launch] = tools.launches;
    expect(launch.layout).toEqual([
      'workspace',
      'workspace/.editorconfig',
      'workspace/app',
      'workspace/app/.editorconfig',
      'workspace/app/app',
      'workspace/app/app/src',
      'workspace/app/app/src/A.kt',
    ]);
    expect([path.basename(path.dirname(launch.cwd)), path.basename(launch.cwd)]).toEqual([
      'workspace',
      'app',
    ]);
  });
  it('uses an isolated root editorconfig when the style names none', () => {
    const tools = fakeJvmTools();

    kotlinFormat({
      formatter: 'ktlint',
      tools: {},
      style: undefined,
      classpath: [],
      executeFixCommand: tools.executeFixCommand,
    })(new Map([['A.kt', 'class  A\n']]));

    expect(tools.launches[0].layout).toEqual([
      'workspace',
      'workspace/.editorconfig',
      'workspace/A.kt',
    ]);
    expect(tools.launches[0].defaults).toBeUndefined();
  });
  it('refuses an editorconfig path that leaves the mirror', () => {
    const style = { editorconfigs: [{ path: '../.editorconfig', text: 'root = true\n' }] };

    expect(() =>
      kotlinFormat({
        formatter: 'ktlint',
        tools: {},
        style,
        classpath: [],
        executeFixCommand: fakeJvmTools().executeFixCommand,
      })(SOURCES),
    ).toThrow('../.editorconfig is outside the formatting workspace');
  });
  it('lets ktfmt read the editorconfig files when the project opted in', () => {
    const tools = fakeJvmTools();

    kotlinFormat({
      formatter: 'ktfmt',
      tools: { ktfmtStyle: 'google', ktfmtEditorconfig: true },
      style: undefined,
      classpath: [],
      executeFixCommand: tools.executeFixCommand,
    })(new Map([['A.kt', 'class  A\n']]));

    expect(tools.launches[0].args).toEqual(['--google-style', '--enable-editorconfig', 'A.kt']);
  });
  it('fails when ktfmt fails without naming a file it could not format', () => {
    const format = kotlinFormat({
      formatter: 'ktfmt',
      tools: { ktfmtStyle: 'meta' },
      style: undefined,
      classpath: [],
      executeFixCommand: () => ({ status: 1, stdout: '', stderr: 'out of memory' }),
    });

    expect(() => format(new Map([['A.kt', 'class A\n']]))).toThrow('ktfmt failed: out of memory');
  });
});
