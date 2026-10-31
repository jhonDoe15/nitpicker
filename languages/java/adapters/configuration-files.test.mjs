import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles, createJavaAnalyzer, javaRuntimeVersion } from './java-analyzer.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\b[^'";]*?\bfrom\s*['"](\.[^'"]+)['"]/g;

function resourceFiles(directory) {
  return readdirSync(path.join(packageRoot, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(packageRoot, path.join(entry.parentPath, entry.name)));
}

function staticImports(file) {
  const source = readFileSync(path.join(packageRoot, file), 'utf8');
  return [...source.matchAll(STATIC_IMPORT)].map(([, specifier]) =>
    path.relative(packageRoot, path.resolve(packageRoot, path.dirname(file), specifier)),
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

  it('hash every module that a hashed module imports', () => {
    const hashed = configurationFiles();
    const modules = hashed.filter((file) => file.endsWith('.mjs'));
    const missing = modules.flatMap((file) =>
      staticImports(file)
        .filter((imported) => !hashed.includes(imported))
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
