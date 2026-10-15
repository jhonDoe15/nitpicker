import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIGURATION_FILES } from './java-analyzer.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\b[^'";]*?\bfrom\s*['"](\.[^'"]+)['"]/g;

function resourceFiles(directory) {
  return readdirSync(path.join(packageRoot, directory)).map((name) => `${directory}/${name}`);
}

function staticImports(file) {
  const source = readFileSync(path.join(packageRoot, file), 'utf8');
  return [...source.matchAll(STATIC_IMPORT)].map(([, specifier]) =>
    path.relative(packageRoot, path.resolve(packageRoot, path.dirname(file), specifier)),
  );
}

describe('Java analyzer configuration files', () => {
  it('hash the runner, the analyzer and every resource the Gradle and detekt runs read', () => {
    expect(CONFIGURATION_FILES).toEqual(
      expect.arrayContaining([
        'languages/java/adapters/java-runner.mjs',
        'languages/java/adapters/java-analyzer.mjs',
        'languages/java/adapters/kotlin/rules/kotlin-literals.mjs',
        ...resourceFiles('languages/java/gradle'),
        ...resourceFiles('languages/java/detekt'),
      ]),
    );
  });

  it('hash every module that a hashed module imports', () => {
    const modules = CONFIGURATION_FILES.filter((file) => file.endsWith('.mjs'));
    const missing = modules.flatMap((file) =>
      staticImports(file)
        .filter((imported) => !CONFIGURATION_FILES.includes(imported))
        .map((imported) => `${file} imports ${imported}`),
    );

    expect(missing).toEqual([]);
  });

  it('reach shared and core modules the runner uses', () => {
    expect(CONFIGURATION_FILES).toEqual(
      expect.arrayContaining(['shared/rules/structure.mjs', 'core/diff/git/paths.mjs']),
    );
  });
});
