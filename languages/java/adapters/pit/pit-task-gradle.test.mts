import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRADLE_DIRECTORY, INIT_SCRIPT } from '../../builds/java-build.mts';

function gradleScript(relative: string): string {
  return readFileSync(path.join(GRADLE_DIRECTORY, relative), 'utf8');
}

describe('Gradle PIT task scripts for Gradle 8 and Gradle 9', () => {
  const pitTask = gradleScript('pit/pit-task.gradle');
  const pitRetry = gradleScript('pit/pit-retry.gradle');
  const initScript = readFileSync(INIT_SCRIPT, 'utf8');

  it('guards nullable File checks explicitly instead of safe-navigating File.isFile()', () => {
    expect(pitTask).not.toMatch(/\?\.(?:isFile|exists|isDirectory)\(/u);
    expect(pitRetry).not.toMatch(/\?\.(?:isFile|exists|isDirectory)\(/u);
    expect(pitTask).toContain(
      'if (recorded != null && recorded.isFile() && recorded.path.startsWith(baseRoot.path + File.separator)) {',
    );
    expect(pitRetry).toContain(
      'if (baseStopped != null && baseStopped.isFile() && failingClasses(baseStopped.readLines()) == failingClasses(lines)) {',
    );
  });

  it('filters null files before calling File filesystem predicates in pit-task.gradle', () => {
    expect(pitTask).toContain('source.testClassesDirs.files.findAll { it != null && it.exists() }');
    expect(pitTask).toContain(
      'def classDirs = spec.classDirs().findAll { it != null && it.exists() }',
    );
    expect(pitTask).toContain(
      "(dir.listFiles() ?: []).findAll { it != null && it.isFile() && it.name.endsWith('.class') }",
    );
    expect(pitTask).toContain(
      'def subpackages = { (dir.listFiles() ?: []).findAll { it != null && it.isDirectory() }',
    );
    expect(pitTask).toContain(
      '.findAll { it != null && it.exists() }.collect { it.absolutePath }.unique()',
    );
    expect(pitTask).toContain(
      "'--sourceDirs', spec.sourceDirs().findAll { it != null && it.exists() }.join(','),",
    );
  });

  it('skips PIT cleanly when there are no mutation targets and writes an empty mutations report', () => {
    const emptyTargetGuard = pitTask.indexOf('if (targets.isEmpty()) {');

    expect(emptyTargetGuard).toBeGreaterThan(-1);
    const guardBlock = pitTask.slice(emptyTargetGuard, emptyTargetGuard + 180);
    expect(guardBlock).toContain('project.delete(pitDir)');
    expect(guardBlock).toContain('pitDir.asFile.mkdirs()');
    expect(guardBlock).toContain('throw new StopExecutionException()');
    expect(initScript).toContain("report.text = '<mutations/>'");
  });
});
