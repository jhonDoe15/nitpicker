import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateConfig } from '../../../../core/configuration/validate.mjs';
import { loadConfig } from '../../../../core/configuration/config.mjs';
import { detectJavaBuild, describeJavaBuild } from '../java-build.mjs';
import { configureJavaAnalyzer, parseJavaRunnerArguments } from '../../adapters/java-policy.mjs';
import { validateJavaBuildSetting } from './build-tool-setting.mjs';

const roots = [];

function project(files, config) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-build-tool-'));
  roots.push(root);
  for (const name of files) {
    writeFileSync(path.join(root, name), '');
  }
  if (config !== undefined) {
    writeFileSync(path.join(root, 'nitpicker.config.json'), JSON.stringify(config));
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('java.buildTool', () => {
  it.each(['java', 'kotlin'])('is accepted with the %s preset', (preset) => {
    const config = { preset, java: { buildTool: 'maven' } };

    expect(validateConfig(config)).toEqual(config);
  });

  it.each([
    [
      { preset: 'java', java: { buildTool: 'ant' } },
      /"java.buildTool" must be one of: maven, gradle/,
    ],
    [{ preset: 'java', java: { build: 'maven' } }, /unknown key "java.build"/],
    [{ preset: 'java', java: 'maven' }, /"java" must be an object/],
    [{ preset: 'python', java: { buildTool: 'maven' } }, /"java" is only supported with/],
  ])('rejects %j', (config, message) => {
    expect(() => {
      validateJavaBuildSetting(config);
    }).toThrow(message);
  });

  it('overrides the detection in both directions', () => {
    const root = project(['pom.xml', 'build.gradle', 'gradlew']);

    expect(detectJavaBuild(root)).toBe('gradle');
    expect(detectJavaBuild(root, 'maven')).toBe('maven');
    expect(detectJavaBuild(root, 'gradle')).toBe('gradle');
  });

  it('explains which wrapper decided when both builds exist', () => {
    expect(describeJavaBuild(project(['pom.xml', 'build.gradle', 'gradlew']))).toEqual({
      tool: 'gradle',
      both: true,
      reason: 'gradlew exists',
    });
    expect(describeJavaBuild(project(['pom.xml', 'build.gradle', 'mvnw'])).tool).toBe('maven');
    expect(describeJavaBuild(project(['pom.xml'])).both).toBe(false);
  });

  it('is a setup error when the configured build file is missing', () => {
    const missingPom = project(['build.gradle'], { preset: 'java', java: { buildTool: 'maven' } });
    const missingGradle = project(['pom.xml'], { preset: 'java', java: { buildTool: 'gradle' } });

    expect(() => loadConfig(missingPom)).toThrow(
      /"java.buildTool" is "maven", but .* has no pom.xml\. .*"gradle" or remove it/,
    );
    expect(() => loadConfig(missingGradle)).toThrow(/has no settings.gradle or/);
  });

  it('loads when the configured build file exists', () => {
    const root = project(['pom.xml', 'build.gradle'], {
      preset: 'java',
      java: { buildTool: 'maven' },
    });

    expect(loadConfig(root).java).toEqual({ buildTool: 'maven' });
  });

  it('reaches the runner as --build-tool and into the policy', () => {
    const base = {
      name: 'java',
      configurationHash: 'hash',
      createInvocation: () => ({ args: [] }),
    };
    const plain = configureJavaAnalyzer(base, { java: {} });
    const pinned = configureJavaAnalyzer(base, { java: { buildTool: 'maven' } });
    const { args } = pinned.createInvocation({});

    expect(args.slice(0, 2)).toEqual(['--build-tool', 'maven']);
    expect(pinned.configurationHash).not.toBe(plain.configurationHash);
    expect(parseJavaRunnerArguments(['--project-root', '.', ...args]).policy.buildTool).toBe(
      'maven',
    );
    expect(() => parseJavaRunnerArguments(['--project-root', '.', '--build-tool', 'ant'])).toThrow(
      /--build-tool must be one of: maven, gradle/,
    );
  });
});
