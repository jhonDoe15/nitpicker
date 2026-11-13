import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles, createJavaAnalyzer, javaRuntimeVersion } from './java-analyzer.mjs';
import { checkoutModulePath } from '../../../shared/paths/checkout-module.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\b[^'";]*?\bfrom\s*['"](\.[^'"]+)['"]/g;
const MODULE = /\.m[jt]s$/u;

const GENERATOR_INPUTS = 'languages/java/gradle/rulesets/';
const FIX_ONLY_CHECKS = 'languages/java/gradle/errorprone/fix-checks/';

function resourceFiles(directory) {
  return readdirSync(path.join(packageRoot, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(packageRoot, path.join(entry.parentPath, entry.name)))
    .filter(
      (file) => ![GENERATOR_INPUTS, FIX_ONLY_CHECKS].some((prefix) => file.startsWith(prefix)),
    );
}

function staticImports(file) {
  const source = readFileSync(checkoutModulePath(path.join(packageRoot, file)), 'utf8');
  return [...source.matchAll(STATIC_IMPORT)].map(([, specifier]) =>
    path.relative(packageRoot, path.resolve(packageRoot, path.dirname(file), specifier)),
  );
}

function isHashed(file, hashed) {
  return [file, file.replace(/\.mts$/u, '.mjs'), file.replace(/\.mjs$/u, '.mts')].some((name) =>
    hashed.includes(name),
  );
}

function hashedAmong(expected) {
  return configurationFiles().filter((file) => expected.includes(file));
}

describe('Java analyzer configuration files', () => {
  it('hash the runner, the analyzer and every resource the Gradle and detekt runs read', () => {
    const expected = [
      'languages/java/adapters/java-runner.mjs',
      'languages/java/adapters/java-analyzer.mjs',
      'languages/java/adapters/kotlin/rules/kotlin-literals.mjs',
      ...resourceFiles('languages/java/gradle'),
      ...resourceFiles('languages/java/detekt'),
    ];

    expect(hashedAmong(expected).sort()).toEqual(expected.sort());
  });

  it('hash every rule, task, guard and lint file, so changing one invalidates cached findings', () => {
    const unhashed = [
      'languages/java/gradle/rules',
      'languages/java/gradle/tasks',
      'languages/java/guards',
      'languages/java/adapters/gradle-reports',
      'languages/java/builds/lint',
      'languages/java/builds/classes',
      'languages/java/builds/rulesets',
      'languages/java/builds/tools',
    ]
      .flatMap((directory) => resourceFiles(directory))
      .filter((file) => !(/\.test\.m[jt]s$/u.test(file) || file.includes('test-support')))
      .filter((file) => !isHashed(file, configurationFiles()));

    expect(unhashed).toEqual([]);
  });

  it('hash every module that a hashed module imports', () => {
    const hashed = configurationFiles();
    const modules = hashed.filter((file) => MODULE.test(file));
    const missing = modules.flatMap((file) =>
      staticImports(file)
        .filter((imported) => !isHashed(imported, hashed))
        .map((imported) => `${file} imports ${imported}`),
    );

    expect(missing).toEqual([]);
  });

  it('reach shared and core modules the runner uses', () => {
    const expected = ['core/diff/git/paths.mjs', 'shared/rules/structure.mjs'];

    expect(hashedAmong(expected).sort()).toEqual(expected);
  });
});

describe('Java analyzer version', () => {
  it('names the JDK that runs the build, so the findings cache misses after a JDK switch', () => {
    const output = {
      status: 0,
      stdout: '',
      stderr:
        'Picked up JAVA_TOOL_OPTIONS: -Dx=y\nNOTE: Picked up JDK_JAVA_OPTIONS: -Dport=1\nopenjdk version "21.0.5" 2024-10-15\nOpenJDK VM\n',
    };

    expect(javaRuntimeVersion(() => output)).toBe(
      'jdk:openjdk version "21.0.5" 2024-10-15 | OpenJDK VM',
    );
    expect(javaRuntimeVersion(() => ({ status: null, error: new Error('ENOENT') }))).toMatch(
      /^jdk:unavailable\(.*java\)$/u,
    );
    const analyzer = createJavaAnalyzer();
    expect(analyzer.resolveVersion()).toBe(`${analyzer.version};${javaRuntimeVersion()}`);
  });
});
